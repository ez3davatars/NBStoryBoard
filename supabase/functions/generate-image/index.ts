import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

type SupabaseClientAny = ReturnType<typeof createClient<any, 'public', any>>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
};

type GenerationJob = {
  id: string;
  request_fingerprint: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | string;
  asset_url?: string | null;
};

type GenerateImageRequestBody = {
  payload?: {
    model?: string;
    requestBody?: unknown;
    generationType?: unknown;
    resolutionTier?: unknown;
    requiredCredits?: unknown;
    creditPricingVersion?: unknown;
  };
  executionFingerprint?: string;
  options?: {
    imageSize?: unknown;
    creditRenderType?: unknown;
    expectedResponseType?: unknown;
    generationType?: unknown;
    resolutionTier?: unknown;
    requiredCredits?: unknown;
  } | unknown;
  generationType?: unknown;
  resolutionTier?: unknown;
  requiredCredits?: unknown;
  creditPricingVersion?: unknown;
};

type GenerationType = 'standard' | 'character_sheet';
type ResolutionTier = '1k' | '2k' | '4k';
type ExpectedResponseType = 'image' | 'text' | 'json';

type GeminiProviderPart = {
  text?: string;
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
};

type GeminiProviderResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiProviderPart[];
    };
  }>;
};

type GeminiRequestPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  fileData?: unknown;
  hosted_reference_path?: string;
  mimeType?: string;
  label?: string;
  [key: string]: unknown;
};

type GeminiRequestContent = {
  role?: string;
  parts?: GeminiRequestPart[];
  [key: string]: unknown;
};

type GeminiRequestPayload = {
  contents?: GeminiRequestContent[];
  [key: string]: unknown;
};

const CREDIT_PRICING_VERSION = '1-2-6';
const NANO_BANANA_2_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const LEGACY_HOSTED_IMAGE_MODELS = new Set([
  'gemini-2.5-flash-image',
  'imagen-4.0-generate-001'
]);

const normalizeHostedProviderModel = (model: string): string =>
  LEGACY_HOSTED_IMAGE_MODELS.has(model) ? NANO_BANANA_2_IMAGE_MODEL : model;

class HttpError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class GenerationExecutionError extends Error {
  status: number;
  code: string;
  failureCode: string;

  constructor(status: number, code: string, failureCode: string, message: string) {
    super(message);
    this.name = 'GenerationExecutionError';
    this.status = status;
    this.code = code;
    this.failureCode = failureCode;
  }
}

const withTimeout = <T>(promise: PromiseLike<T>, ms: number, name: string): Promise<T> => {
    return Promise.race([
        Promise.resolve(promise),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`DIAGNOSTIC HANG DETECTED: [${name}] timed out after ${ms}ms`)), ms))
    ]);
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type HostedFailureClassification = {
  status: number;
  publicMessage: string;
  code: string;
  failureCode: string;
  details?: Record<string, unknown>;
};

const isHttpErrorLike = (value: unknown): value is HttpError => {
  if (!isObjectRecord(value)) return false;
  return typeof value.status === 'number'
    && typeof value.code === 'string'
    && typeof value.message === 'string'
    && (value.name === 'HttpError' || value instanceof HttpError);
};

const isGenerationExecutionErrorLike = (value: unknown): value is GenerationExecutionError => {
  if (!isObjectRecord(value)) return false;
  return typeof value.status === 'number'
    && typeof value.code === 'string'
    && typeof value.failureCode === 'string'
    && typeof value.message === 'string'
    && (value.name === 'GenerationExecutionError' || value instanceof GenerationExecutionError);
};

const isHostedSchemaSetupError = (message: string): boolean =>
  /schema cache|could not find (?:the )?function|function .* does not exist|column .* does not exist|relation .* does not exist|invalid input value for enum .*generation_status|request_payload|timing_metrics|asset_storage_path|request_fingerprint/i.test(message);

const classifyHostedFailure = (
  err: unknown,
  errMessage: string,
  expectedResponseType: ExpectedResponseType | null
): HostedFailureClassification => {
  if (isHttpErrorLike(err)) {
    return {
      status: err.status,
      publicMessage: err.message,
      code: err.code,
      failureCode: err.code,
      details: err.details
    };
  }

  if (isGenerationExecutionErrorLike(err)) {
    return {
      status: err.status,
      publicMessage: err.message,
      code: err.code,
      failureCode: err.failureCode
    };
  }

  if (errMessage.includes('Unauthorized') || errMessage.includes('Missing Authorization header')) {
    return {
      status: 401,
      publicMessage: 'Unauthorized',
      code: 'UNAUTHORIZED',
      failureCode: 'INTERNAL_ERROR'
    };
  }

  if (errMessage.includes('Idempotency')) {
    return {
      status: 409,
      publicMessage: errMessage,
      code: 'IDEMPOTENCY_CONFLICT',
      failureCode: 'INTERNAL_ERROR'
    };
  }

  if (
    errMessage.includes('Missing X-Idempotency-Key header') ||
    errMessage.startsWith('Invalid request payload')
  ) {
    return {
      status: 400,
      publicMessage: errMessage,
      code: 'INVALID_REQUEST',
      failureCode: 'VALIDATION_ERROR'
    };
  }

  if (errMessage.includes('req.json')) {
    return {
      status: 400,
      publicMessage: 'Invalid request body',
      code: 'INVALID_JSON',
      failureCode: 'VALIDATION_ERROR'
    };
  }

  if (errMessage.includes('Missing function Supabase credentials')) {
    return {
      status: 500,
      publicMessage: 'Hosted generation function credentials are missing. Verify SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY on generate-image.',
      code: 'HOSTED_FUNCTION_CONFIG_MISSING',
      failureCode: 'INTERNAL_ERROR'
    };
  }

  if (/reference_images\.download/i.test(errMessage) && /timed out after \d+ms/i.test(errMessage)) {
    return {
      status: 504,
      publicMessage: 'Hosted generation timed out while downloading a reference image. Retry the render; if it repeats, reduce active references or use smaller reference images.',
      code: 'REFERENCE_DOWNLOAD_TIMEOUT',
      failureCode: 'STORAGE_ERROR'
    };
  }

  if (errMessage.includes('DIAGNOSTIC HANG DETECTED') || /timed out after \d+ms/i.test(errMessage)) {
    return {
      status: 504,
      publicMessage: errMessage,
      code: 'HOSTED_ORCHESTRATION_TIMEOUT',
      failureCode: 'PROVIDER_TIMEOUT'
    };
  }

  if (isHostedSchemaSetupError(errMessage)) {
    return {
      status: 500,
      publicMessage: 'Hosted generation database setup is incomplete. Apply supabase/workers/image-processor/database_setup.sql, then redeploy generate-image.',
      code: 'HOSTED_SCHEMA_MIGRATION_REQUIRED',
      failureCode: 'INTERNAL_ERROR',
      details: {
        setupFile: 'supabase/workers/image-processor/database_setup.sql'
      }
    };
  }

  if (/Could not validate hosted credit balance/i.test(errMessage)) {
    return {
      status: 500,
      publicMessage: errMessage,
      code: 'HOSTED_CREDIT_BALANCE_UNAVAILABLE',
      failureCode: 'INTERNAL_ERROR'
    };
  }

  if (/start_generation failed|complete_generation failed|Could not claim hosted generation job|Could not enqueue generation payload data/i.test(errMessage)) {
    return {
      status: 500,
      publicMessage: errMessage,
      code: 'HOSTED_ORCHESTRATION_FAILED',
      failureCode: 'INTERNAL_ERROR'
    };
  }

  if (expectedResponseType === 'text' || expectedResponseType === 'json') {
    return {
      status: 500,
      publicMessage: errMessage,
      code: 'HOSTED_ANALYSIS_FAILED',
      failureCode: 'INTERNAL_ERROR'
    };
  }

  return {
    status: 500,
    publicMessage: 'Generation request failed',
    code: 'INTERNAL_ERROR',
    failureCode: 'INTERNAL_ERROR'
  };
};

const isGenerationJob = (value: unknown): value is GenerationJob => {
  if (!isObjectRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.request_fingerprint === 'string'
    && typeof value.status === 'string';
};

const readGenerationJob = (value: unknown): GenerationJob | null => {
  if (isGenerationJob(value)) return value;
  if (Array.isArray(value) && isGenerationJob(value[0])) return value[0];
  return null;
};

const normalizeGenerationType = (value: unknown): GenerationType => {
  if (value === undefined || value === null || value === '') return 'standard';
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_GENERATION_TYPE', 'generationType must be "standard" or "character_sheet".');
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'standard' || normalized === 'character_sheet') return normalized;

  throw new HttpError(400, 'INVALID_GENERATION_TYPE', 'generationType must be "standard" or "character_sheet".');
};

const normalizeResolutionTier = (value: unknown): ResolutionTier | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_RESOLUTION_TIER', 'resolutionTier must be "1k", "2k", or "4k".');
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '1k' || normalized === '1K'.toLowerCase()) return '1k';
  if (normalized === '2k' || normalized === '2K'.toLowerCase()) return '2k';
  if (normalized === '4k' || normalized === '4K'.toLowerCase()) return '4k';

  throw new HttpError(400, 'INVALID_RESOLUTION_TIER', 'resolutionTier must be "1k", "2k", or "4k".');
};

const normalizeExpectedResponseType = (value: unknown): ExpectedResponseType => {
  if (value === undefined || value === null || value === '') return 'image';
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_EXPECTED_RESPONSE_TYPE', 'expectedResponseType must be "image", "text", or "json".');
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'image' || normalized === 'text' || normalized === 'json') {
    return normalized;
  }

  throw new HttpError(400, 'INVALID_EXPECTED_RESPONSE_TYPE', 'expectedResponseType must be "image", "text", or "json".');
};

const readExpectedResponseType = (body: GenerateImageRequestBody): ExpectedResponseType => {
  const options = isObjectRecord(body.options) ? body.options : {};
  return normalizeExpectedResponseType(options.expectedResponseType);
};

const deriveResolutionTierFromRequestBody = (requestBody: unknown): ResolutionTier | null => {
  if (!isObjectRecord(requestBody)) return null;
  const generationConfig = requestBody.generationConfig;
  if (!isObjectRecord(generationConfig)) return null;
  const imageConfig = generationConfig.imageConfig;
  if (!isObjectRecord(imageConfig)) return null;
  return normalizeResolutionTier(imageConfig.imageSize);
};

const normalizeClientRequiredCredits = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new HttpError(400, 'INVALID_REQUIRED_CREDITS', 'requiredCredits must be a positive integer.');
  }
  return numeric;
};

const calculateBackendRequiredCredits = (_generationType: GenerationType, resolutionTier: ResolutionTier): number => {
  if (resolutionTier === '4k') return 6;
  if (resolutionTier === '2k') return 2;
  return 1;
};

const readHostedCreditMetadata = (body: GenerateImageRequestBody) => {
  const payload = body.payload ?? {};
  const options = isObjectRecord(body.options) ? body.options : {};

  const generationType = normalizeGenerationType(
    body.generationType ??
    payload.generationType ??
    options.generationType ??
    options.creditRenderType
  );

  const resolutionTier =
    normalizeResolutionTier(
      body.resolutionTier ??
      payload.resolutionTier ??
      options.resolutionTier ??
      options.imageSize
    ) ??
    deriveResolutionTierFromRequestBody(payload.requestBody) ??
    '1k';

  const backendCalculatedRequiredCredits = calculateBackendRequiredCredits(generationType, resolutionTier);
  const clientRequiredCredits = normalizeClientRequiredCredits(
    body.requiredCredits ??
    payload.requiredCredits ??
    options.requiredCredits
  );

  if (clientRequiredCredits !== null && clientRequiredCredits !== backendCalculatedRequiredCredits) {
    throw new HttpError(
      400,
      'CREDIT_COST_MISMATCH',
      `Credit metadata mismatch: client requiredCredits ${clientRequiredCredits} does not match backend calculated ${backendCalculatedRequiredCredits}.`
    );
  }

  return {
    generationType,
    resolutionTier,
    requiredCredits: backendCalculatedRequiredCredits,
    creditPricingVersion: CREDIT_PRICING_VERSION
  };
};

const readHostedCreditBalance = async (
  supabaseService: SupabaseClientAny,
  userId: string
): Promise<number> => {
  const { data: profileData, error: profileErr } = await withTimeout(
    supabaseService
      .from('profiles')
      .select('credit_balance')
      .eq('id', userId)
      .single(),
    10000,
    'profiles.credit_balance'
  );

  if (profileErr) {
    throw new Error(`Could not validate hosted credit balance: ${profileErr.message}`);
  }

  const currentCredits = Number(profileData?.credit_balance ?? 0);
  if (!Number.isFinite(currentCredits)) {
    throw new Error('Could not validate hosted credit balance: credit_balance is not numeric.');
  }

  return currentCredits;
};

const extractTextFromGeminiResponse = (response: GeminiProviderResponse): string => {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text)
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .join('\n')
    .trim();
};

const classifyProviderFailure = (status: number, bodyText: string): string => {
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
};

const textEncoder = new TextEncoder();

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const sha256Hex = async (value: string | Uint8Array): Promise<string> =>
  toHex(await crypto.subtle.digest(
    'SHA-256',
    typeof value === 'string' ? toArrayBuffer(textEncoder.encode(value)) : toArrayBuffer(value)
  ));

const hmacSha256 = async (key: ArrayBuffer, value: string): Promise<ArrayBuffer> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, toArrayBuffer(textEncoder.encode(value)));
};

const encodeS3Path = (path: string): string =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const getImageExtension = (mimeType: string): string => {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
};

const cloneJsonCompatible = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const REFERENCE_DOWNLOAD_MAX_ATTEMPTS = 3;
const REFERENCE_DOWNLOAD_TIMEOUT_MS = 30000;

const downloadHostedReference = async (
  supabaseService: SupabaseClientAny,
  storagePath: string,
  fallbackMimeType?: string
): Promise<{ bytes: Uint8Array; mimeType: string }> => {
  let lastErrorMessage = 'No data returned.';

  for (let attempt = 1; attempt <= REFERENCE_DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { data, error } = await withTimeout(
        supabaseService.storage.from('reference_images').download(storagePath),
        REFERENCE_DOWNLOAD_TIMEOUT_MS,
        `reference_images.download:${storagePath}`
      );

      if (!error && data) {
        const arrayBuffer = await data.arrayBuffer();
        if (arrayBuffer.byteLength < 100) {
          throw new GenerationExecutionError(
            502,
            'REFERENCE_DOWNLOAD_INVALID',
            'STORAGE_ERROR',
            `Downloaded hosted reference is suspiciously small (${arrayBuffer.byteLength} bytes): ${storagePath}`
          );
        }

        return {
          bytes: new Uint8Array(arrayBuffer),
          mimeType: fallbackMimeType || data.type || 'image/jpeg'
        };
      }

      lastErrorMessage = error?.message || lastErrorMessage;
    } catch (error: unknown) {
      if (isGenerationExecutionErrorLike(error)) throw error;
      lastErrorMessage = getErrorMessage(error);
      console.warn(`[Synchronous Image Generation] Reference download attempt ${attempt}/${REFERENCE_DOWNLOAD_MAX_ATTEMPTS} failed for ${storagePath}: ${lastErrorMessage}`);
    }

    if (attempt < REFERENCE_DOWNLOAD_MAX_ATTEMPTS) await sleep(1200 * attempt);
  }

  throw new GenerationExecutionError(
    502,
    'REFERENCE_DOWNLOAD_FAILED',
    'STORAGE_ERROR',
    `Failed to download hosted reference image after ${REFERENCE_DOWNLOAD_MAX_ATTEMPTS} attempts (${storagePath}): ${lastErrorMessage}`
  );
};

const materializeHostedReferences = async (
  supabaseService: SupabaseClientAny,
  requestBody: unknown
): Promise<{ requestBody: unknown; referenceCount: number; cleanupPaths: string[] }> => {
  const materialized = cloneJsonCompatible(requestBody) as GeminiRequestPayload;
  const cleanupPaths: string[] = [];
  let referenceCount = 0;

  if (!Array.isArray(materialized.contents)) {
    return { requestBody: materialized, referenceCount, cleanupPaths };
  }

  for (const content of materialized.contents) {
    if (!isObjectRecord(content) || !Array.isArray(content.parts)) continue;

    for (let i = 0; i < content.parts.length; i += 1) {
      const part = content.parts[i];
      if (!isObjectRecord(part)) continue;

      const storagePath = typeof part.hosted_reference_path === 'string'
        ? part.hosted_reference_path
        : '';

      if (storagePath) {
        const downloaded = await downloadHostedReference(
          supabaseService,
          storagePath,
          typeof part.mimeType === 'string' ? part.mimeType : undefined
        );

        content.parts[i] = {
          inlineData: {
            mimeType: downloaded.mimeType,
            data: bytesToBase64(downloaded.bytes)
          }
        };
        cleanupPaths.push(storagePath);
        referenceCount += 1;
      } else if (part.inlineData || part.fileData) {
        referenceCount += 1;
      }
    }
  }

  return { requestBody: materialized, referenceCount, cleanupPaths };
};

const cleanupHostedReferences = async (
  supabaseService: SupabaseClientAny,
  cleanupPaths: string[]
): Promise<void> => {
  if (cleanupPaths.length === 0) return;
  const { error } = await supabaseService.storage.from('reference_images').remove(cleanupPaths);
  if (error) {
    console.warn(`[Synchronous Image Generation] Failed to clean up hosted references: ${error.message}`);
  }
};

const canExecuteImageSynchronously = (_requestBody: unknown): boolean => true;

const uploadImageToR2 = async (
  jobId: string,
  imageBase64: string,
  mimeType: string
): Promise<{ fileKey: string; publicUrl: string; r2StartedAt: number; r2FinishedAt: number }> => {
  const accountId = Deno.env.get('R2_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID') || '';
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') || Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '';
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') || Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '';
  const bucket = Deno.env.get('R2_BUCKET_NAME') || Deno.env.get('CLOUDFLARE_R2_BUCKET_DOWNLOADS') || '';
  const publicBaseUrl = (Deno.env.get('R2_PUBLIC_URL') || '').replace(/\/+$/, '');

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new GenerationExecutionError(
      500,
      'MISSING_R2_CONFIG',
      'STORAGE_ERROR',
      'Hosted image generation is not configured: one or more R2 secrets are missing from generate-image.'
    );
  }

  const r2StartedAt = Date.now();
  const bytes = base64ToBytes(imageBase64);
  const extension = getImageExtension(mimeType);
  const fileKey = `generations/${jobId}.${extension}`;
  const encodedKey = encodeS3Path(fileKey);
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${encodedKey}`;
  const endpoint = `https://${host}${canonicalUri}`;
  const bodyHash = await sha256Hex(bytes);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders =
    `content-type:${mimeType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${bodyHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    bodyHash
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');

  const kDate = await hmacSha256(toArrayBuffer(textEncoder.encode(`AWS4${secretAccessKey}`)), dateStamp);
  const kRegion = await hmacSha256(kDate, 'auto');
  const kService = await hmacSha256(kRegion, 's3');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  const uploadResponse = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'Content-Type': mimeType,
      'x-amz-content-sha256': bodyHash,
      'x-amz-date': amzDate
    },
    body: bytes
  });

  if (!uploadResponse.ok) {
    const bodyText = await uploadResponse.text();
    throw new GenerationExecutionError(
      502,
      'R2_UPLOAD_FAILED',
      'STORAGE_ERROR',
      `R2 upload failed for hosted image generation (${uploadResponse.status}): ${bodyText}`
    );
  }

  return {
    fileKey,
    publicUrl: `${publicBaseUrl}/${fileKey}`,
    r2StartedAt,
    r2FinishedAt: Date.now()
  };
};

const executeSynchronousImageGeneration = async (
  supabaseService: SupabaseClientAny,
  providerModel: string,
  requestBody: unknown,
  jobId: string,
  resolutionTier: ResolutionTier
): Promise<{
  assetUrl: string;
  fileKey: string;
  providerStartedAt: number;
  providerFinishedAt: number;
  r2StartedAt: number;
  r2FinishedAt: number;
  referenceCount: number;
}> => {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!geminiApiKey) {
    throw new GenerationExecutionError(
      500,
      'MISSING_GEMINI_API_KEY',
      'INTERNAL_ERROR',
      'Hosted image generation is not configured: GEMINI_API_KEY is missing from generate-image function secrets.'
    );
  }

  const materialized = await materializeHostedReferences(supabaseService, requestBody);

  const providerTimeoutMs =
    resolutionTier === '4k' ? 220000 :
    resolutionTier === '2k' ? 180000 :
    120000;
  try {
    const providerStartedAt = Date.now();
    const providerResponse = await withTimeout(
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${providerModel}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(materialized.requestBody),
      }),
      providerTimeoutMs,
      'gemini_image_generation'
    );
    const providerFinishedAt = Date.now();

    if (!providerResponse.ok) {
      const bodyText = await providerResponse.text();
      throw new GenerationExecutionError(
        502,
        'PROVIDER_ERROR',
        classifyProviderFailure(providerResponse.status, bodyText),
        `Google API failed for hosted image generation (${providerResponse.status}): ${bodyText}`
      );
    }

    const result = (await providerResponse.json()) as GeminiProviderResponse;
    const providerParts = result.candidates?.[0]?.content?.parts ?? [];
    const imagePart = providerParts.find((part) => part.inlineData?.data);
    const imageBase64 = imagePart?.inlineData?.data;
    const mimeType = imagePart?.inlineData?.mimeType || 'image/png';

    if (!imageBase64) {
      throw new GenerationExecutionError(
        502,
        'PROVIDER_EMPTY_RESPONSE',
        'PROVIDER_ERROR',
        'Provider succeeded but returned no image data.'
      );
    }

    const upload = await uploadImageToR2(jobId, imageBase64, mimeType);

    return {
      assetUrl: upload.publicUrl,
      fileKey: upload.fileKey,
      providerStartedAt,
      providerFinishedAt,
      r2StartedAt: upload.r2StartedAt,
      r2FinishedAt: upload.r2FinishedAt,
      referenceCount: materialized.referenceCount
    };
  } finally {
    await cleanupHostedReferences(supabaseService, materialized.cleanupPaths);
  }
};

const executeSynchronousTextAnalysis = async (
  providerModel: string,
  requestBody: unknown
): Promise<{
  assetUrl: string;
  providerStartedAt: number;
  providerFinishedAt: number;
}> => {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!geminiApiKey) {
    throw new GenerationExecutionError(
      500,
      'MISSING_GEMINI_API_KEY',
      'INTERNAL_ERROR',
      'Hosted text analysis is not configured: GEMINI_API_KEY is missing from generate-image function secrets.'
    );
  }

  const providerStartedAt = Date.now();
  const providerResponse = await withTimeout(
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${providerModel}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }),
    55000,
    'gemini_text_analysis'
  );
  const providerFinishedAt = Date.now();

  if (!providerResponse.ok) {
    const bodyText = await providerResponse.text();
    throw new GenerationExecutionError(
      502,
      'PROVIDER_ERROR',
      classifyProviderFailure(providerResponse.status, bodyText),
      `Google API failed for hosted text analysis (${providerResponse.status}): ${bodyText}`
    );
  }

  const result = (await providerResponse.json()) as GeminiProviderResponse;
  const text = extractTextFromGeminiResponse(result);
  if (!text) {
    throw new GenerationExecutionError(
      502,
      'PROVIDER_EMPTY_RESPONSE',
      'PROVIDER_ERROR',
      'Provider succeeded but returned no text analysis.'
    );
  }

  return {
    assetUrl: `data:application/json;charset=utf-8,${encodeURIComponent(text)}`,
    providerStartedAt,
    providerFinishedAt
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    const requestedHeaders = req.headers.get('Access-Control-Request-Headers');
    return new Response('ok', { 
        headers: {
            ...corsHeaders,
            'Access-Control-Allow-Headers': requestedHeaders || corsHeaders['Access-Control-Allow-Headers']
        } 
    });
  }

  let supabaseServiceForFailure: SupabaseClientAny | null = null;
  let startedGenerationId: string | null = null;
  let generationAccepted = false;
  let expectedResponseTypeForFailure: ExpectedResponseType | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServerKey =
      Deno.env.get('SUPABASE_SECRET_KEY') ||
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
      '';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServerKey) {
      throw new Error(
        JSON.stringify({
          message: 'Missing function Supabase credentials',
          has_supabase_url: !!supabaseUrl,
          has_anon_key: !!supabaseAnonKey,
          has_secret_key: !!Deno.env.get('SUPABASE_SECRET_KEY'),
          has_service_role_key: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        })
      );
    }

    // Auth client ONLY
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const jwt = authHeader.replace(/^Bearer /i, '').trim();

    const { data: userData, error: userError } = await withTimeout(
      supabaseAuth.auth.getUser(jwt),
      5000,
      "auth.getUser"
    );

    if (userError || !userData?.user) {
      console.warn('[AUTH] Unauthorized generation request:', userError?.message || 'User data missing');
      throw new Error('Unauthorized');
    }

    // Service client ONLY
    const supabaseService = createClient(supabaseUrl, supabaseServerKey);
    supabaseServiceForFailure = supabaseService;
    
    const userId = userData.user.id;

    const payloadRaw = await withTimeout(req.json() as Promise<unknown>, 15000, "req.json");
    const requestBody = (payloadRaw ?? {}) as GenerateImageRequestBody;
    const { payload, executionFingerprint } = requestBody;
    if (!payload?.model || !executionFingerprint) {
      throw new Error("Invalid request payload: missing payload.model or executionFingerprint");
    }
    const providerModel = normalizeHostedProviderModel(payload.model);
    const expectedResponseType = readExpectedResponseType(requestBody);
    expectedResponseTypeForFailure = expectedResponseType;

    const creditMetadata = readHostedCreditMetadata(requestBody);
    let currentCredits = await readHostedCreditBalance(supabaseService, userId);

    if (currentCredits < creditMetadata.requiredCredits) {
      throw new HttpError(
        402,
        'INSUFFICIENT_CREDITS',
        `Insufficient hosted credits: this render needs ${creditMetadata.requiredCredits}, current balance is ${currentCredits}.`,
        {
          requiredCredits: creditMetadata.requiredCredits,
          currentCredits
        }
      );
    }
    
    const idempotencyKey = req.headers.get('x-idempotency-key');
    if (!idempotencyKey) throw new Error("Missing X-Idempotency-Key header");

    // 1. Transaction Lock / Ownership Handshake
    const { data: jobData, error: startErr } = await withTimeout(
        supabaseService.rpc('start_generation', {
            p_user_id: userId,
            p_request_idempotency_key: idempotencyKey,
            p_request_fingerprint: executionFingerprint,
            p_generation_type: 'image',
            p_cost: creditMetadata.requiredCredits,
            p_is_byok: false,
            p_provider: 'gemini',
            p_provider_model: providerModel
        }),
        10000, "start_generation_rpc"
    );

    if (startErr) {
      if (/insufficient|credit/i.test(startErr.message)) {
        currentCredits = await readHostedCreditBalance(supabaseService, userId);
        throw new HttpError(
          402,
          'INSUFFICIENT_CREDITS',
          `start_generation rejected hosted credits: ${startErr.message}`,
          {
            requiredCredits: creditMetadata.requiredCredits,
            currentCredits
          }
        );
      }
      throw new Error(`start_generation failed: ${startErr.message}`);
    }
    const job = readGenerationJob(jobData);
    if (!job) throw new Error("start_generation returned no job");
    startedGenerationId = job.id;

    // 2. Ownership & Replay Check
    if (job.request_fingerprint !== executionFingerprint) {
       // Idempotency Collision Detected
       if (job.status === 'COMPLETED') {
           return new Response(JSON.stringify({ imageUrl: job.asset_url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
       }
       if (job.status === 'PENDING' || job.status === 'PROCESSING') {
           return new Response(JSON.stringify({ error: job.status, message: 'Job is actively processing.' }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
       }
       return new Response(JSON.stringify({ error: 'Conflict', message: 'Idempotency conflict. Require new idempotency key.'}), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    } else {
        // EXACT match replay
        if (job.status === 'COMPLETED') {
             return new Response(JSON.stringify({ imageUrl: job.asset_url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
        }
        if (job.status === 'FAILED' || job.status === 'CANCELED') {
             return new Response(JSON.stringify({ error: 'Conflict', message: `Job was previously ${job.status}. Require new idempotency key.`}), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
        }
    }

    if (job.status !== 'PENDING') {
       throw new Error(`Unexpected job status: ${job.status}`);
    }

    const shouldExecuteSynchronousText = expectedResponseType === 'text' || expectedResponseType === 'json';
    const shouldExecuteSynchronousImage = expectedResponseType === 'image' && canExecuteImageSynchronously(payload.requestBody);
    const shouldExecuteSynchronously = shouldExecuteSynchronousText || shouldExecuteSynchronousImage;
    let synchronousWorkerClaimedAt: number | null = null;

    if (shouldExecuteSynchronously) {
      synchronousWorkerClaimedAt = Date.now();
      const executionMode = shouldExecuteSynchronousImage ? 'edge_synchronous_image' : 'edge_synchronous_text';
      const { error: processingErr } = await supabaseService
        .from('generations')
        .update({
          status: 'PROCESSING',
          timing_metrics: {
            worker_claimed_at: synchronousWorkerClaimedAt,
            job_id: job.id,
            provider_model: providerModel,
            response_type: expectedResponseType,
            execution_mode: executionMode
          }
        })
        .eq('id', job.id)
        .eq('status', 'PENDING');

      if (processingErr) {
        throw new Error(`Could not claim hosted generation job for synchronous execution: ${processingErr.message}`);
      }
    }

    // 3. Persist the Exact Generative Payload Request to the DB Queue (Required for Background Delegate)
    const { error: payloadErr } = await supabaseService
        .from('generations')
        .update({ 
             request_payload: payload.requestBody,
             provider_model: providerModel
        })
        .eq('id', job.id);

    if (payloadErr) throw new Error(`Could not enqueue generation payload data: ${payloadErr.message}`);

    const { error: metadataErr } = await supabaseService
        .from('generations')
        .update({
             billing_metadata: creditMetadata
        })
        .eq('id', job.id);

    if (metadataErr) {
      console.warn(
        `[Billing Metadata] Could not persist metadata for generation ${job.id}. ` +
        `Apply the billing_metadata schema migration to store it. Error: ${metadataErr.message}`
      );
    }

    if (shouldExecuteSynchronousText) {
      const workerClaimedAt = synchronousWorkerClaimedAt ?? Date.now();
      const analysisResult = await executeSynchronousTextAnalysis(providerModel, payload.requestBody);
      const dbCompletedAt = Date.now();

      const { error: metricsErr } = await supabaseService
        .from('generations')
        .update({
          timing_metrics: {
            worker_claimed_at: workerClaimedAt,
            provider_started_at: analysisResult.providerStartedAt,
            provider_finished_at: analysisResult.providerFinishedAt,
            r2_started_at: null,
            r2_finished_at: null,
            db_completed_at: dbCompletedAt,
            job_id: job.id,
            provider_model: providerModel,
            response_type: expectedResponseType,
            execution_mode: 'edge_synchronous_text'
          }
        })
        .eq('id', job.id);

      if (metricsErr) {
        console.warn(`[Synchronous Text Analysis] Could not persist metrics for generation ${job.id}: ${metricsErr.message}`);
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: completeErr } = await supabaseService.rpc('complete_generation', {
        p_generation_id: job.id,
        p_asset_url: analysisResult.assetUrl,
        p_asset_storage_path: 'text-result',
        p_provider_request_id: null,
        p_asset_expires_at: expiresAt,
      });

      if (completeErr) {
        throw new Error(`complete_generation failed for hosted text analysis: ${completeErr.message}`);
      }

      generationAccepted = true;
      return new Response(JSON.stringify({
        imageUrl: analysisResult.assetUrl,
        generationId: job.id,
        status: 'COMPLETED'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (shouldExecuteSynchronousImage) {
      const workerClaimedAt = synchronousWorkerClaimedAt ?? Date.now();
      const imageResult = await executeSynchronousImageGeneration(
        supabaseService,
        providerModel,
        payload.requestBody,
        job.id,
        creditMetadata.resolutionTier
      );
      const dbCompletedAt = Date.now();

      const { error: metricsErr } = await supabaseService
        .from('generations')
        .update({
          timing_metrics: {
            worker_claimed_at: workerClaimedAt,
            provider_started_at: imageResult.providerStartedAt,
            provider_finished_at: imageResult.providerFinishedAt,
            r2_started_at: imageResult.r2StartedAt,
            r2_finished_at: imageResult.r2FinishedAt,
            db_completed_at: dbCompletedAt,
            job_id: job.id,
            provider_model: providerModel,
            response_type: expectedResponseType,
            execution_mode: 'edge_synchronous_image',
            reference_count: imageResult.referenceCount
          }
        })
        .eq('id', job.id);

      if (metricsErr) {
        console.warn(`[Synchronous Image Generation] Could not persist metrics for generation ${job.id}: ${metricsErr.message}`);
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: completeErr } = await supabaseService.rpc('complete_generation', {
        p_generation_id: job.id,
        p_asset_url: imageResult.assetUrl,
        p_asset_storage_path: imageResult.fileKey,
        p_provider_request_id: null,
        p_asset_expires_at: expiresAt,
      });

      if (completeErr) {
        throw new Error(`complete_generation failed for hosted image generation: ${completeErr.message}`);
      }

      generationAccepted = true;
      return new Response(JSON.stringify({
        imageUrl: imageResult.assetUrl,
        generationId: job.id,
        status: 'COMPLETED'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Return instant HTTP 202 
    generationAccepted = true;
    return new Response(JSON.stringify({ generationId: job.id, status: 'PENDING', acceptedAt: Date.now() }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    const failure = classifyHostedFailure(err, errMessage, expectedResponseTypeForFailure);
    console.error("Generate Image Orchestration Error:", errMessage, errStack);

    if (startedGenerationId && !generationAccepted && supabaseServiceForFailure) {
      const { error: failErr } = await supabaseServiceForFailure.rpc('fail_generation', {
        p_generation_id: startedGenerationId,
        p_failure_code: failure.failureCode,
        p_error_message: `generate-image failed before completion: ${errMessage}`
      });

      if (failErr) {
        console.error('CRITICAL: fail_generation refund after enqueue failure failed', failErr);
      }
    }
    
    // fail_generation relies on generation payload isolation
    const errorBody = {
      error: failure.publicMessage,
      code: failure.code,
      ...(failure.details ?? {})
    };

    return new Response(JSON.stringify(errorBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: failure.status,
    });
  }
});
