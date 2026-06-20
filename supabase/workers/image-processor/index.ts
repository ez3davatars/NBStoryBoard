/// <reference types="node" />

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

type GeminiPayloadPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  fileData?: unknown;
  hosted_reference_path?: string;
  mimeType?: string;
  [key: string]: unknown;
};

type GeminiPayloadContent = {
  role?: string;
  parts?: GeminiPayloadPart[];
  [key: string]: unknown;
};

type GeminiRequestPayload = {
  prompt?: string;
  contents?: GeminiPayloadContent[];
  [key: string]: unknown;
};

type GeminiProviderPart = {
  inlineData?: { data?: string };
  text?: string;
};

type GeminiProviderResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiProviderPart[];
    };
  }>;
  usageMetadata?: Record<string, unknown> | null;
  modelVersion?: string | null;
  responseId?: string | null;
};

// ===== Metered image pricing — gemini-3.1-flash-image (GA), Standard. MUST stay identical to the edge
// (supabase/functions/generate-image/index.ts); an alignment test asserts the registries match. =====
const HOSTED_METERED_BILLING_ENABLED = (Deno.env.get('HOSTED_METERED_BILLING_ENABLED') ?? '').toLowerCase() === 'true';
const HOSTED_GOOGLE_IMAGE_PRICING_VERSION = 'gemini-3.1-flash-image-standard-2026-06';
const HOSTED_GOOGLE_COST_MARKUP_BPS = 10000;
const HOSTED_GOOGLE_IMAGE_PRICING: Record<string, Partial<Record<'standard', { inputTokenNanoUsd: number; textOutputTokenNanoUsd: number; imageOutputTokenNanoUsd: number; imageOutputTokensByResolution: Record<'1k' | '2k' | '4k', number> }>>> = {
  'gemini-3.1-flash-image': {
    standard: { inputTokenNanoUsd: 500, textOutputTokenNanoUsd: 3000, imageOutputTokenNanoUsd: 60000, imageOutputTokensByResolution: { '1k': 1120, '2k': 1680, '4k': 2520 } }
  }
};

const ceilDivBigInt = (n: bigint, d: bigint): bigint => (n <= 0n ? 0n : (n + d - 1n) / d);
const isNonNegInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

const resolveResolutionTier = (payload: unknown): '1k' | '2k' | '4k' => {
  const size = (payload as { generationConfig?: { imageConfig?: { imageSize?: unknown } } } | null)?.generationConfig?.imageConfig?.imageSize;
  if (size === '4K') return '4k';
  if (size === '2K') return '2k';
  return '1k';
};

// Computes the metered image settlement (list cost × 2) for reconciliation. Fails closed (returns null +
// logs) on unknown model/tier/resolution or invalid usage rather than guessing.
const computeWorkerImageSettlement = (
  providerModel: string,
  resolution: '1k' | '2k' | '4k',
  result: GeminiProviderResponse
): Record<string, unknown> | null => {
  const rates = HOSTED_GOOGLE_IMAGE_PRICING[providerModel]?.standard;
  const imageOutputTokens = rates?.imageOutputTokensByResolution[resolution];
  const usage = result.usageMetadata as Record<string, unknown> | null | undefined;
  const tierRaw = usage?.serviceTier;
  const tierOk = tierRaw === undefined || tierRaw === null || tierRaw === '' || String(tierRaw).toLowerCase() === 'standard';
  if (!rates || imageOutputTokens === undefined || !usage || !tierOk) return null;
  const prompt = usage.promptTokenCount ?? 0;
  const thoughts = usage.thoughtsTokenCount ?? 0;
  if (!isNonNegInt(prompt) || !isNonNegInt(thoughts)) return null;
  const listCost = BigInt(prompt) * BigInt(rates.inputTokenNanoUsd) + BigInt(thoughts) * BigInt(rates.textOutputTokenNanoUsd) + BigInt(imageOutputTokens) * BigInt(rates.imageOutputTokenNanoUsd);
  const customerPrice = ceilDivBigInt(listCost * BigInt(10000 + HOSTED_GOOGLE_COST_MARKUP_BPS), 10000n);
  return {
    pricingVersion: HOSTED_GOOGLE_IMAGE_PRICING_VERSION,
    pricingSource: 'published_rate',
    billingUnit: 'image_output',
    provider: 'gemini',
    providerModel,
    providerServiceTier: 'standard',
    providerModelVersion: typeof result.modelVersion === 'string' ? result.modelVersion : null,
    providerResponseId: typeof result.responseId === 'string' ? result.responseId : null,
    providerListCostNanoUsd: listCost.toString(),
    providerInvoicedCostNanoUsd: null,
    markupBasisPoints: HOSTED_GOOGLE_COST_MARKUP_BPS,
    customerPriceNanoUsd: customerPrice.toString(),
    fundingSource: 'paid',
    settlementStatus: 'RECONCILE_PENDING'
  };
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
};

const isJobRecord = (value: unknown): value is JobRecord => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<JobRecord>;
  return (
    typeof candidate.id === 'string'
    && typeof candidate.provider_model === 'string'
    && Object.prototype.hasOwnProperty.call(candidate, 'request_payload')
  );
};

console.log(`[Worker ${WORKER_ID}] Booted & listening for generation jobs...`);

// ==========================================
// HELPERS
// ==========================================
function normalizeGeminiPayload(raw: unknown): GeminiRequestPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('VALIDATION_ERROR: request_payload is missing or malformed.');
  }

  const payload = raw as GeminiRequestPayload;

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
  if (Array.isArray(data)) {
    const first = data[0];
    return isJobRecord(first) ? first : null;
  }
  return isJobRecord(data) ? data : null;
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
               
               let data: Blob | null = null;
               let error: { message: string } | null = null;
               let retries = 3;
               
               while (retries > 0) {
                 const res = await supabase.storage.from('reference_images').download(storagePath);
                 data = res.data;
                 error = res.error ? { message: res.error.message } : null;
                 
                 if (!error && data) break;
                 
                 console.warn(`[Worker ${WORKER_ID}] Download failed (${error?.message || 'No data'}). Retrying ${storagePath}... (${retries - 1} attempts left)`);
                 await new Promise(r => setTimeout(r, 2000));
                 retries--;
               }
               
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

    console.log(`[Worker ${WORKER_ID}] Preflight payload shape:`, JSON.stringify(payload?.contents?.[0]?.parts?.map((p: GeminiPayloadPart) => ({ ...p, inlineData: p.inlineData ? '<base64 omitted>' : undefined }))));
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

    const result = (await providerResponse.json()) as GeminiProviderResponse;
    const providerParts = result?.candidates?.[0]?.content?.parts ?? [];
    const imgData = providerParts.find((p) => p?.inlineData?.data)?.inlineData?.data;
    const textData = providerParts.find((p) => p?.text)?.text;

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

    // Metered image cost (list × 2) for reconciliation parity with the synchronous edge path. The worker
    // does not apply the metered charge (legacy reservation stands); flipping requires the same feature
    // flag + local DB settle tests as the edge.
    if (imgData) {
      try {
        const imgSettlement = computeWorkerImageSettlement(job.provider_model, resolveResolutionTier(payload), result);
        if (imgSettlement) {
          await supabase.from('generations').update({
            billing_metadata: { ...imgSettlement, parentGenerationId: job.id, meteredBillingEnabled: HOSTED_METERED_BILLING_ENABLED }
          }).eq('id', job.id);
        } else {
          console.warn(`[Worker ${WORKER_ID}] Could not meter image ${job.id} (unknown model/tier/resolution or invalid usage); left on legacy reservation.`);
        }
      } catch (billErr) {
        console.warn(`[Worker ${WORKER_ID}] Non-fatal: metered settlement persist failed for ${job.id}`, billErr);
      }
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
