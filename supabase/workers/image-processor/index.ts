import { createClient } from '@supabase/supabase-js';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as crypto from 'node:crypto';

// ==========================================
// CONFIGURATION
// ==========================================
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://wtgkeytabshxtspjoegb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_12qAUYx1gzluIF0kxQqPNw_zMGtwwVr';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBaGcnd1_gxdECdTE89HVNQgxdYk4d3WxE';

// Cloudflare R2 configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '6c36be70912cdcabc7b26eb790314e2c';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '2285c183d3af0f4c3a30e9636c5c7562';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '12befab0e645e9becb47bffdefc32b399b1671c5922d8efb43c2ed8f28ad2b53';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'cd-generations';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://pub-62f299edb7ef4f748caadb57f15f1d02.r2.dev').replace(/\/+$/, '');

function decodeJwtPayload(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const jwtPayload = decodeJwtPayload(SUPABASE_SERVICE_ROLE_KEY);

console.log('[Worker] SUPABASE_URL:', SUPABASE_URL);
console.log('[Worker] service key present:', !!SUPABASE_SERVICE_ROLE_KEY);
console.log('[Worker] service key prefix:', SUPABASE_SERVICE_ROLE_KEY.slice(0, 20));
console.log('[Worker] decoded role claim:', jwtPayload?.role);
console.log('[Worker] decoded iss claim:', jwtPayload?.iss);
console.log('[Worker] decoded ref claim:', jwtPayload?.ref);
console.log('[Worker] key prefix raw:', SUPABASE_SERVICE_ROLE_KEY.slice(0, 16));

if (
  !SUPABASE_SERVICE_ROLE_KEY ||
  !GEMINI_API_KEY ||
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET_NAME
) {
  console.error('FATAL: Missing essential environment credentials. Worker standing down.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
  request_payload: any;
};

console.log(`[Worker ${WORKER_ID}] Booted & listening for generation jobs...`);

// ==========================================
// HELPERS
// ==========================================
function normalizeGeminiPayload(raw: any) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('VALIDATION_ERROR: request_payload is missing or malformed.');
  }

  if (Array.isArray(raw.contents) && raw.contents.length > 0) {
    return raw;
  }

  if (typeof raw.prompt === 'string' && raw.prompt.trim()) {
    return {
      ...raw,
      contents: [
        {
          role: 'user',
          parts: [{ text: raw.prompt.trim() }],
        },
      ],
    };
  }

  throw new Error('VALIDATION_ERROR: Gemini payload must include contents[].');
}

function extractClaimedJob(data: any): JobRecord | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
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
  } catch (err: any) {
    console.error(`[Worker ${WORKER_ID}] Polling error: ${err?.message || String(err)}`);
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

    console.log(`[Worker ${WORKER_ID}] Preflight payload shape:`, JSON.stringify(payload?.contents?.[0]?.parts?.map((p: any) => ({ ...p, inlineData: p.inlineData ? '<base64 omitted>' : undefined }))));
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
      (p: any) => p?.inlineData?.data
    )?.inlineData?.data;

    if (!imgData) {
      failCode = 'PROVIDER_ERROR';
      throw new Error('PROVIDER_ERROR: Provider succeeded but returned no image data.');
    }

    console.log(`[Worker ${WORKER_ID}] Uploading image to Cloudflare R2...`);
    let fileKey = '';
    let publicUrl: string | null = null;
    const r2_started_at = Date.now();

    try {
      const upload = await uploadToR2(job.id, imgData);
      fileKey = upload.fileKey;
      publicUrl = upload.publicUrl;
    } catch (uploadErr: any) {
      failCode = 'STORAGE_ERROR';
      throw new Error(`STORAGE_ERROR: R2 upload failed: ${uploadErr?.message || String(uploadErr)}`);
    }
    const r2_finished_at = Date.now();

    console.log(`[Worker ${WORKER_ID}] R2 upload complete. Writing metrics and finalizing generation...`);

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
  } catch (err: any) {
    const message = err?.message || String(err);
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