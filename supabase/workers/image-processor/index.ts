import { createClient } from '@supabase/supabase-js';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as crypto from 'node:crypto';

// ==========================================
// CONFIGURATION
// ==========================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Cloudflare R2 configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

console.log('[Worker] SUPABASE_URL:', SUPABASE_URL);
console.log('[Worker] service key present:', !!SUPABASE_SECRET_KEY);
console.log('[Worker] key prefix raw:', SUPABASE_SECRET_KEY ? SUPABASE_SECRET_KEY.slice(0, 16) : 'none');

if (
  !SUPABASE_URL ||
  !SUPABASE_SECRET_KEY ||
  !GEMINI_API_KEY ||
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET_NAME
) {
  console.error('FATAL: Missing essential environment credentials. Worker standing down.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
const WORKER_ID = crypto.randomUUID();

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

type GenerationFailureCode =
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'STORAGE_ERROR'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'SWEPT_STALE'
  | 'USER_CANCELED';

type JobRecord = {
  id: string;
  provider_model: string;
  request_payload: unknown;
};

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  fileData?: unknown;
  hosted_reference_path?: string;
  mimeType?: string;
  [key: string]: unknown;
};

type GeminiContent = {
  role?: string;
  parts?: GeminiPart[];
  [key: string]: unknown;
};

type GeminiPayload = {
  prompt?: string;
  contents?: GeminiContent[];
  [key: string]: unknown;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

console.log(`[Worker ${WORKER_ID}] Booted & listening for generation jobs...`);

// ==========================================
// HELPERS
// ==========================================
function normalizeGeminiPayload(raw: unknown): GeminiPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('VALIDATION_ERROR: request_payload is missing or malformed.');
  }
  const payload = raw as GeminiPayload;

  if (Array.isArray(payload.contents) && payload.contents.length > 0) {
    return payload;
  }

  if (typeof payload.prompt === 'string' && payload.prompt.trim()) {
    return {
      ...payload,
      contents: [
        {
          role: 'user',
          parts: [{ text: payload.prompt.trim() }],
        },
      ],
    };
  }

  throw new Error('VALIDATION_ERROR: Gemini payload must include contents[].');
}

function extractClaimedJob(data: unknown): JobRecord | null {
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] as JobRecord) ?? null;
  return data as JobRecord;
}

function classifyProviderFailure(status: number, bodyText: string): GenerationFailureCode {
  const msg = bodyText.toUpperCase();

  if (status === 429) return 'RATE_LIMIT';
  if (status === 408 || status === 504) return 'PROVIDER_TIMEOUT';

  if (
    msg.includes('QUOTA') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('BILLING') ||
    msg.includes('INSUFFICIENT CREDITS')
  ) {
    return 'QUOTA_EXCEEDED';
  }

  return 'PROVIDER_ERROR';
}

async function failJob(jobId: string, code: GenerationFailureCode, message: string) {
  const { error } = await supabase.rpc('fail_generation', {
    p_generation_id: jobId,
    p_failure_code: code,
    p_error_message: message,
  });

  if (error) {
    console.error(`[Worker ${WORKER_ID}] CRITICAL: fail_generation RPC failed`, error);
  }
}

async function uploadToR2(jobId: string, imgDataBase64: string) {
  const buffer = Buffer.from(imgDataBase64, 'base64');
  const fileKey = `generations/${jobId}.png`;

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileKey,
      Body: buffer,
      ContentType: 'image/png',
    })
  );

  const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${fileKey}` : null;
  return { fileKey, publicUrl };
}

// ==========================================
// POLLING ENGINE
// ==========================================
async function pollForJobs() {
  try {
    const { data, error } = await supabase.rpc('claim_next_generation_job');

    if (error) throw error;

    const job = extractClaimedJob(data);
    if (job) {
      await executeJob(job);
    }
  } catch (err: unknown) {
    console.error(`[Worker ${WORKER_ID}] Polling error: ${getErrorMessage(err)}`);
  } finally {
    setTimeout(pollForJobs, 3000 + Math.random() * 1000);
  }
}

// ==========================================
// JOB EXECUTION
// ==========================================
async function executeJob(job: JobRecord) {
  const worker_claimed_at = Date.now();
  console.log(`[Worker ${WORKER_ID}] Claimed job: ${job.id}`);

  let failCode: GenerationFailureCode = 'INTERNAL_ERROR';
  const storagePathsToCleanup: string[] = [];

  try {
    if (!job.provider_model || typeof job.provider_model !== 'string') {
      failCode = 'VALIDATION_ERROR';
      throw new Error('VALIDATION_ERROR: provider_model missing.');
    }

    if (job.provider_model.toLowerCase().includes('imagen')) {
      failCode = 'VALIDATION_ERROR';
      throw new Error(
        'VALIDATION_ERROR: Hosted billing currently supports Gemini generateContent flow only.'
      );
    }

    const payload = normalizeGeminiPayload(job.request_payload);
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${job.provider_model}:generateContent`;

    // Try to count references or inline images in payload, and reconstruct hosted references
    let reference_count = 0;
    if (Array.isArray(payload?.contents)) {
       const parts = payload.contents[0]?.parts || [];
       for (let i = 0; i < parts.length; i++) {
           const part = parts[i];
           
           if (part.hosted_reference_path) {
               const storagePath = part.hosted_reference_path;
               
               console.log(`[Worker ${WORKER_ID}] Downloading high-fidelity reference bypass: ${storagePath}`);
               const { data, error } = await supabase.storage.from('reference_images').download(storagePath);
               
               if (error || !data) {
                  failCode = 'STORAGE_ERROR';
                  throw new Error(`Failed to download reference image bypass (path: ${storagePath}): ${error ? error.message : 'No data'}`);
               }
               const arrayBuffer = await data.arrayBuffer();
               
               if (arrayBuffer.byteLength < 100) {
                  failCode = 'STORAGE_ERROR';
                  throw new Error(`Downloaded bypassed reference image is suspiciously small! size: ${arrayBuffer.byteLength} bytes.`);
               }
               
               const base64Data = Buffer.from(arrayBuffer).toString('base64');
               
               console.log(`[Worker ${WORKER_ID}] Storage Bypass Success. Translated ${arrayBuffer.byteLength} bytes to base64 length ${base64Data.length}.`);
               
               parts[i] = {
                  inlineData: {
                     mimeType: part.mimeType || 'image/jpeg',
                     data: base64Data
                  }
               };
               
               storagePathsToCleanup.push(storagePath);
               reference_count++;
           } else if (part.inlineData || part.fileData) {
               reference_count++;
           }
       }
    }

    console.log(`[Worker ${WORKER_ID}] Preflight payload shape:`, JSON.stringify(payload?.contents?.[0]?.parts?.map((p: GeminiPart) => ({ ...p, inlineData: p.inlineData ? '<base64 omitted>' : undefined }))));
    console.log(`[Worker ${WORKER_ID}] Executing Gemini API call...`);
    const provider_started_at = Date.now();
    const providerResponse = await fetch(`${baseUrl}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const provider_finished_at = Date.now();

    if (!providerResponse.ok) {
      const errText = await providerResponse.text();
      failCode = classifyProviderFailure(providerResponse.status, errText);
      throw new Error(`Google API Failed (${providerResponse.status}): ${errText}`);
    }

    const result = await providerResponse.json();
    const imgData = result?.candidates?.[0]?.content?.parts?.find(
      (p: GeminiPart) => p?.inlineData?.data
    )?.inlineData?.data;

    const textData = result?.candidates?.[0]?.content?.parts?.find(
      (p: GeminiPart) => p?.text
    )?.text;

    if (!imgData && !textData) {
      failCode = 'PROVIDER_ERROR';
      throw new Error('PROVIDER_ERROR: Provider succeeded but returned neither image nor text data.');
    }

    let fileKey = '';
    let publicUrl: string | null = null;
    const r2_started_at = Date.now();
    let r2_finished_at = Date.now();

    if (imgData) {
        console.log(`[Worker ${WORKER_ID}] Uploading image to Cloudflare R2...`);
        try {
          const upload = await uploadToR2(job.id, imgData);
          fileKey = upload.fileKey;
          publicUrl = upload.publicUrl;
        } catch (uploadErr: unknown) {
          failCode = 'STORAGE_ERROR';
          throw new Error(`STORAGE_ERROR: R2 upload failed: ${getErrorMessage(uploadErr)}`);
        }
        r2_finished_at = Date.now();
    } else if (textData) {
        console.log(`[Worker ${WORKER_ID}] Received text/vision payload. Encoding as data URI...`);
        fileKey = 'text-result';
        // URI encode to prevent breaking JSON strings in the database URL column
        publicUrl = `data:application/json;charset=utf-8,${encodeURIComponent(textData)}`;
    }

    console.log(`[Worker ${WORKER_ID}] Generation task payload handler complete. Writing metrics and finalizing generation...`);

    const db_start_attempt = Date.now();
    try {
        await supabase.from('generations').update({
            timing_metrics: {
                worker_claimed_at,
                provider_started_at,
                provider_finished_at,
                r2_started_at,
                r2_finished_at,
                db_completed_at: db_start_attempt, // approx db commit time
                job_id: job.id,
                provider_model: job.provider_model,
                reference_count
            }
        }).eq('id', job.id);
    } catch (metricErr) {
        console.error(`[Worker ${WORKER_ID}] Non-fatal: failed to write timing_metrics for ${job.id}`, metricErr);
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: completeErr } = await supabase.rpc('complete_generation', {
      p_generation_id: job.id,
      p_asset_url: publicUrl,
      p_asset_storage_path: fileKey,
      p_provider_request_id: null,
      p_asset_expires_at: expiresAt,
    });

    if (completeErr) {
      failCode = 'STORAGE_ERROR';
      throw new Error(`complete_generation RPC failed: ${completeErr.message}`);
    }

    console.log(
      `[Worker ${WORKER_ID}] Job ${job.id} COMPLETED. publicUrl=${publicUrl ?? 'not-set'}`
    );
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    console.error(`[Worker ${WORKER_ID}] Job ${job.id} FAILED: ${message}`);
    await failJob(job.id, failCode, message);
  } finally {
    if (storagePathsToCleanup.length > 0) {
      console.log(`[Worker ${WORKER_ID}] Cleaning up ${storagePathsToCleanup.length} reference images from bucket...`);
      const { error } = await supabase.storage.from('reference_images').remove(storagePathsToCleanup);
      if (error) {
         console.error(`[Worker ${WORKER_ID}] Failed to clean up reference images:`, error);
      }
    }
  }
}

// Start Engine
pollForJobs();
