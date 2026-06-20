import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

type SupabaseClientAny = ReturnType<typeof createClient<any, 'public', any>>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
};
const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json'
};

const jsonResponse = (
  body: Record<string, unknown>,
  init: Omit<ResponseInit, 'headers'> & { headers?: Record<string, string> } = {}
): Response => new Response(JSON.stringify(body), {
  ...init,
  headers: {
    ...jsonHeaders,
    ...(init.headers ?? {})
  }
});

const corsPreflightResponse = (req: Request): Response => {
  const requestedHeaders = req.headers.get('Access-Control-Request-Headers');
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Headers': requestedHeaders || corsHeaders['Access-Control-Allow-Headers']
    }
  });
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
    hostedQualityGateBilling?: unknown;
    usageCategory?: unknown;
    analysisKind?: unknown;
  } | unknown;
  generationType?: unknown;
  resolutionTier?: unknown;
  requiredCredits?: unknown;
  creditPricingVersion?: unknown;
};

type GenerationType = 'standard' | 'character_sheet';
type ResolutionTier = '1k' | '2k' | '4k';
type ExpectedResponseType = 'image' | 'text' | 'json';
type HostedQualityGateBilling = 'skip' | 'included' | 'paid';

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
  usageMetadata?: Record<string, unknown> | null;
  modelVersion?: string | null;
  responseId?: string | null;
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
// GA image model. The preview `gemini-3.1-flash-image-preview` is deprecated (shutdown 2026-06-25) and is
// normalized forward to GA; the metered pricing registry has no preview entry, so any stray preview model
// also fails closed at pricing time.
const NANO_BANANA_2_IMAGE_MODEL = 'gemini-3.1-flash-image';
const LEGACY_HOSTED_IMAGE_MODELS = new Set([
  'gemini-2.5-flash-image',
  'imagen-4.0-generate-001',
  'gemini-3.1-flash-image-preview'
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

const readJsonBody = async (req: Request): Promise<GenerateImageRequestBody> => {
  try {
    const body = await withTimeout(req.json() as Promise<unknown>, 15000, 'req.json');
    if (!isObjectRecord(body)) {
      throw new HttpError(400, 'INVALID_REQUEST_BODY', 'Request body must be a JSON object.');
    }
    return body as GenerateImageRequestBody;
  } catch (error) {
    if (isHttpErrorLike(error)) throw error;
    throw new HttpError(400, 'INVALID_JSON', 'Invalid JSON request body.');
  }
};

const validateGenerateImageRequestBody = (body: GenerateImageRequestBody): {
  payload: NonNullable<GenerateImageRequestBody['payload']> & { model: string; requestBody: unknown };
  executionFingerprint: string;
} => {
  if (!isObjectRecord(body.payload)) {
    throw new HttpError(400, 'MISSING_PAYLOAD', 'Missing required field: payload');
  }

  const payload = body.payload;
  if (typeof payload.model !== 'string' || !payload.model.trim()) {
    throw new HttpError(400, 'MISSING_MODEL', 'Missing required field: payload.model');
  }

  if (payload.requestBody === undefined || payload.requestBody === null) {
    throw new HttpError(400, 'MISSING_REQUEST_BODY', 'Missing required field: payload.requestBody');
  }

  if (typeof body.executionFingerprint !== 'string' || !body.executionFingerprint.trim()) {
    throw new HttpError(400, 'MISSING_EXECUTION_FINGERPRINT', 'Missing required field: executionFingerprint');
  }

  return {
    payload: {
      ...payload,
      model: payload.model.trim(),
      requestBody: payload.requestBody
    },
    executionFingerprint: body.executionFingerprint.trim()
  };
};

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

const normalizeHostedQualityGateBilling = (value: unknown): HostedQualityGateBilling | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'skip' || normalized === 'included' || normalized === 'paid') return normalized;
  return null;
};

const isIncludedHostedQualityGateBilling = (
  options: Record<string, unknown>,
  expectedResponseType: ExpectedResponseType
): boolean =>
  normalizeHostedQualityGateBilling(options.hostedQualityGateBilling) === 'included' &&
  (expectedResponseType === 'text' || expectedResponseType === 'json');

const normalizeClientRequiredCredits = (value: unknown, allowZero = false): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(numeric) || numeric < minimum) {
    throw new HttpError(
      400,
      'INVALID_REQUIRED_CREDITS',
      allowZero
        ? 'requiredCredits must be a non-negative integer.'
        : 'requiredCredits must be a positive integer.'
    );
  }
  return numeric;
};

const calculateBackendRequiredCredits = (_generationType: GenerationType, resolutionTier: ResolutionTier): number => {
  if (resolutionTier === '4k') return 6;
  if (resolutionTier === '2k') return 2;
  return 1;
};

// Server-side operation contract. The operation is derived from the authenticated response type,
// never trusted from a client-supplied label: text/json => analyze (post-generation quality gate),
// image => generate.
type HostedOperation = 'generate' | 'analyze';

const deriveHostedOperation = (expectedResponseType: ExpectedResponseType): HostedOperation =>
  expectedResponseType === 'text' || expectedResponseType === 'json' ? 'analyze' : 'generate';

// ===== Hosted analysis policy registry (server-authoritative) =====
// MUST stay aligned with src/renderer/services/hostedAnalysisPolicy.ts (a contract test asserts this).
// The kind is the single source of truth: the server derives billing, credits, response type, and the
// persisted usageCategory from this registry and never trusts a client-supplied display string.
type HostedAnalysisResponseType = 'text' | 'json';
type HostedAnalysisBilling = 'paid' | 'included' | 'metered';
type HostedAnalysisBounds = {
  maxOutputTokens: number;
  thinkingBudget: number;
  maxImages: number;
  maxAttempts: number;
  maxBillableMicrocredits: number;
};
type HostedAnalysisPolicy = {
  billing: HostedAnalysisBilling;
  credits: number;
  responseType: HostedAnalysisResponseType;
  usageCategory?: string;
  aggregateUnderParent?: boolean;
  bounds?: HostedAnalysisBounds;
};

const TEXT_BOUNDS: HostedAnalysisBounds = { maxOutputTokens: 256, thinkingBudget: 0, maxImages: 1, maxAttempts: 1, maxBillableMicrocredits: 200000 };
const JSON_BOUNDS: HostedAnalysisBounds = { maxOutputTokens: 768, thinkingBudget: 0, maxImages: 2, maxAttempts: 1, maxBillableMicrocredits: 500000 };

const HOSTED_ANALYSIS_POLICIES: Record<string, HostedAnalysisPolicy> = {
  reference_dna: { billing: 'metered', credits: 0, responseType: 'text', usageCategory: 'reference_dna_analysis', aggregateUnderParent: false, bounds: TEXT_BOUNDS },
  actor_intelligence: { billing: 'metered', credits: 0, responseType: 'text', usageCategory: 'actor_intelligence_analysis', aggregateUnderParent: false, bounds: TEXT_BOUNDS },
  scene_reextract: { billing: 'metered', credits: 0, responseType: 'json', usageCategory: 'scene_reextract_analysis', aggregateUnderParent: false, bounds: JSON_BOUNDS },
  production_actor_identity: { billing: 'metered', credits: 0, responseType: 'json', usageCategory: 'production_actor_identity_analysis', aggregateUnderParent: false, bounds: JSON_BOUNDS },
  veo_prompt_enhance: { billing: 'metered', credits: 0, responseType: 'text', usageCategory: 'veo_prompt_enhance_analysis', aggregateUnderParent: false, bounds: JSON_BOUNDS },
  scene_dna_gate: { billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: true, bounds: JSON_BOUNDS },
  token_profile_gate: { billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: true, bounds: JSON_BOUNDS },
  character_style_gate: { billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: true, bounds: JSON_BOUNDS },
  scene_intent_gate: { billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: true, bounds: JSON_BOUNDS },
  shot_integrity_gate: { billing: 'metered', credits: 0, responseType: 'json', aggregateUnderParent: true, bounds: { ...JSON_BOUNDS, maxImages: 2 } },
  pose_quality_gate: { billing: 'metered', credits: 0, responseType: 'text', aggregateUnderParent: true, bounds: TEXT_BOUNDS },
  style_quality_gate: { billing: 'metered', credits: 0, responseType: 'text', aggregateUnderParent: true, bounds: TEXT_BOUNDS },
  wardrobe_continuity_gate: { billing: 'metered', credits: 0, responseType: 'text', aggregateUnderParent: true, bounds: TEXT_BOUNDS }
};

// ===== Server-owned provider pricing (gemini-standard-2026-06). Mirror of
// src/renderer/services/hostedMeteredPricing.ts; an alignment test asserts they match.
// customer price = provider list cost × 2 (100% markup => 50% gross margin). =====
const HOSTED_GOOGLE_PRICING_VERSION = 'gemini-standard-2026-06';
const HOSTED_GOOGLE_GROSS_MARGIN_BPS = 5000;

// Markup is server config. Validate it is a non-negative integer; fall back to the 100% default
// rather than silently using NaN/garbage.
const readMarkupBps = (): number => {
  const raw = Deno.env.get('HOSTED_GOOGLE_COST_MARKUP_BPS');
  if (raw === undefined || raw === null || raw.trim() === '') return 10000;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.error(`[Metered] Invalid HOSTED_GOOGLE_COST_MARKUP_BPS "${raw}"; using default 10000.`);
    return 10000;
  }
  return parsed;
};
const HOSTED_GOOGLE_COST_MARKUP_BPS = readMarkupBps();
const MICROCREDITS_PER_CREDIT = 1000000n;

// Master feature flag for charging the metered amount. While OFF (default) the metered settlement is
// computed + persisted for reconciliation but NOT applied as the live charge (the legacy reservation
// stands), so users are never partially charged before local DB tests + UI + credit value are ready.
const HOSTED_METERED_BILLING_ENABLED = (Deno.env.get('HOSTED_METERED_BILLING_ENABLED') ?? '').toLowerCase() === 'true';

type HostedServiceTier = 'standard';
type ProviderTokenRates = { uncachedInput: number; cachedInput: number; output: number };
// Published Gemini token pricing (nano-USD/token) keyed by model then service tier.
const HOSTED_GOOGLE_TOKEN_PRICING: Record<string, Partial<Record<HostedServiceTier, ProviderTokenRates>>> = {
  'gemini-2.5-flash': { standard: { uncachedInput: 300, cachedInput: 30, output: 2500 } },
  'gemini-2.5-flash-lite': { standard: { uncachedInput: 100, cachedInput: 10, output: 400 } }
};

type ProviderUsage = {
  promptTokenCount: number;
  cachedContentTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
};

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const ceilDivBigInt = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator <= 0n) throw new Error('ceilDivBigInt: denominator must be positive');
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
};

// Maps the provider serviceTier to a priced tier; fails closed on batch/flex/priority/preview/unknown.
const normalizeServiceTier = (raw: unknown): HostedServiceTier => {
  if (raw === undefined || raw === null || raw === '') return 'standard';
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'standard') return 'standard';
  throw new GenerationExecutionError(502, 'UNKNOWN_SERVICE_TIER', 'PROVIDER_ERROR', `Unsupported Google service tier "${String(raw)}"; only Standard tier is priced.`);
};

// Validates raw Gemini usageMetadata into ProviderUsage; fails closed on invalid/missing fields.
const normalizeProviderUsage = (raw: Record<string, unknown> | null | undefined): ProviderUsage => {
  if (!raw) {
    throw new GenerationExecutionError(502, 'MISSING_USAGE_METADATA', 'PROVIDER_ERROR', 'Provider returned no usageMetadata; cannot meter the call.');
  }
  const fields: Array<keyof ProviderUsage> = ['promptTokenCount', 'cachedContentTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount'];
  const out = {} as ProviderUsage;
  for (const name of fields) {
    const value = raw[name] ?? 0;
    if (!isNonNegativeInteger(value)) {
      throw new GenerationExecutionError(502, 'INVALID_USAGE_METADATA', 'PROVIDER_ERROR', `Invalid provider usage field "${name}".`);
    }
    out[name] = value;
  }
  return out;
};

// Published provider LIST cost (nano-USD) for a model+tier. Fails closed on unknown model OR tier.
const computeProviderListCostNanoUsd = (model: string, tier: HostedServiceTier, usage: ProviderUsage): bigint => {
  const rates = HOSTED_GOOGLE_TOKEN_PRICING[model]?.[tier];
  if (!rates) {
    throw new GenerationExecutionError(500, 'UNKNOWN_PROVIDER_PRICING', 'INTERNAL_ERROR', `No server pricing for provider "${model}" at tier "${tier}".`);
  }
  const uncachedInput = Math.max(0, usage.promptTokenCount - usage.cachedContentTokenCount);
  const outputTokens = usage.candidatesTokenCount + usage.thoughtsTokenCount;
  return (
    BigInt(uncachedInput) * BigInt(rates.uncachedInput) +
    BigInt(usage.cachedContentTokenCount) * BigInt(rates.cachedInput) +
    BigInt(outputTokens) * BigInt(rates.output)
  );
};

const applyMarkupNanoUsd = (providerListCostNanoUsd: bigint, markupBps: number = HOSTED_GOOGLE_COST_MARKUP_BPS): bigint =>
  ceilDivBigInt(providerListCostNanoUsd * BigInt(10000 + markupBps), 10000n);

const customerPriceToMicrocredits = (customerPriceNanoUsd: bigint, creditValueNanoUsd: bigint): bigint => {
  if (creditValueNanoUsd <= 0n) throw new Error('creditValueNanoUsd must be positive');
  return ceilDivBigInt(customerPriceNanoUsd * MICROCREDITS_PER_CREDIT, creditValueNanoUsd);
};

type MeteredSettlement = {
  pricingVersion: string;
  pricingSource: 'published_rate' | 'invoice_reconciled';
  reconciliationStatus: 'pending' | 'reconciled';
  billingUnit: 'token' | 'image_output';
  providerModel: string;
  providerModelVersion: string | null;
  providerServiceTier: HostedServiceTier;
  providerResponseId: string | null;
  promptTokenCount: number;
  cachedContentTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  providerListCostNanoUsd: string;
  providerInvoicedCostNanoUsd: string | null;
  markupBasisPoints: number;
  grossMarginBasisPoints: number;
  customerPriceNanoUsd: string;
  creditMicroUnitsCharged: string | null;
};

// Reads the configured min realized USD value per credit (nano-USD). Null when unset.
const readCreditValueNanoUsd = (): bigint | null => {
  const raw = Deno.env.get('HOSTED_CREDIT_USD_VALUE_NANO_USD');
  if (!raw) return null;
  try {
    const v = BigInt(raw);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
};

const buildMeteredSettlement = (params: {
  providerModel: string;
  modelVersion: string | null;
  serviceTier: HostedServiceTier;
  responseId: string | null;
  usage: ProviderUsage;
}): MeteredSettlement => {
  const providerListCost = computeProviderListCostNanoUsd(params.providerModel, params.serviceTier, params.usage);
  const customerPrice = applyMarkupNanoUsd(providerListCost);
  const creditValue = readCreditValueNanoUsd();
  return {
    pricingVersion: HOSTED_GOOGLE_PRICING_VERSION,
    pricingSource: 'published_rate',
    reconciliationStatus: 'pending',
    billingUnit: 'token',
    providerModel: params.providerModel,
    providerModelVersion: params.modelVersion,
    providerServiceTier: params.serviceTier,
    providerResponseId: params.responseId,
    promptTokenCount: params.usage.promptTokenCount,
    cachedContentTokenCount: params.usage.cachedContentTokenCount,
    candidatesTokenCount: params.usage.candidatesTokenCount,
    thoughtsTokenCount: params.usage.thoughtsTokenCount,
    providerListCostNanoUsd: providerListCost.toString(),
    providerInvoicedCostNanoUsd: null,
    markupBasisPoints: HOSTED_GOOGLE_COST_MARKUP_BPS,
    grossMarginBasisPoints: HOSTED_GOOGLE_GROSS_MARGIN_BPS,
    customerPriceNanoUsd: customerPrice.toString(),
    // Microcredit settlement requires the configured credit USD value; null => reconcile later.
    creditMicroUnitsCharged: creditValue ? customerPriceToMicrocredits(customerPrice, creditValue).toString() : null
  };
};

// Conservative reservation (in displayed credits) for a metered analysis: the policy's hard cap.
const meteredReservationCredits = (policy: HostedAnalysisPolicy): number =>
  policy.bounds ? policy.bounds.maxBillableMicrocredits / 1000000 : 0;

// Detects a Google grounding / search / URL-context tool in the provider request body.
const requestUsesGoogleGrounding = (requestBody: unknown): boolean => {
  if (!isObjectRecord(requestBody)) return false;
  const tools = (requestBody as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return false;
  return tools.some((tool) =>
    isObjectRecord(tool) && (
      'googleSearch' in tool || 'googleSearchRetrieval' in tool || 'google_search' in tool || 'urlContext' in tool || 'url_context' in tool
    )
  );
};

// ===== Image-generation pricing — gemini-3.1-flash-image (GA), Standard tier. Mirror of
// hostedMeteredPricing.ts (alignment-tested). input 500 / text-thinking output 3000 / image output 60000
// nano-USD per token; per-resolution image-output token counts. Unknown model/tier/resolution fails
// closed; there is NO preview entry so a stray preview model also fails closed. =====
const HOSTED_GOOGLE_IMAGE_PRICING_VERSION = 'gemini-3.1-flash-image-standard-2026-06';
type ImageGenerationRates = {
  inputTokenNanoUsd: number;
  textOutputTokenNanoUsd: number;
  imageOutputTokenNanoUsd: number;
  imageOutputTokensByResolution: Record<ResolutionTier, number>;
};
const HOSTED_GOOGLE_IMAGE_PRICING: Record<string, Partial<Record<HostedServiceTier, ImageGenerationRates>>> = {
  'gemini-3.1-flash-image': {
    standard: { inputTokenNanoUsd: 500, textOutputTokenNanoUsd: 3000, imageOutputTokenNanoUsd: 60000, imageOutputTokensByResolution: { '1k': 1120, '2k': 1680, '4k': 2520 } }
  }
};

const buildImageMeteredSettlement = (params: {
  providerModel: string;
  serviceTier: HostedServiceTier;
  resolution: ResolutionTier;
  modelVersion: string | null;
  responseId: string | null;
  usage: ProviderUsage;
}): MeteredSettlement => {
  const rates = HOSTED_GOOGLE_IMAGE_PRICING[params.providerModel]?.[params.serviceTier];
  const imageOutputTokens = rates?.imageOutputTokensByResolution[params.resolution];
  if (!rates || imageOutputTokens === undefined) {
    throw new GenerationExecutionError(500, 'UNKNOWN_PROVIDER_PRICING', 'INTERNAL_ERROR', `No image pricing for "${params.providerModel}" tier "${params.serviceTier}" resolution "${params.resolution}".`);
  }
  // Sum ALL provider components before the 2× markup. The image-output cost is the fixed per-resolution
  // amount; candidatesTokenCount (the image tokens) is NOT re-charged at the text rate. Thinking tokens
  // are billed as text/thinking output. Grounding is fail-closed upstream (not added here).
  const inputCost = BigInt(Math.max(0, params.usage.promptTokenCount)) * BigInt(rates.inputTokenNanoUsd);
  const textThinkingCost = BigInt(Math.max(0, params.usage.thoughtsTokenCount)) * BigInt(rates.textOutputTokenNanoUsd);
  const imageOutputCost = BigInt(imageOutputTokens) * BigInt(rates.imageOutputTokenNanoUsd);
  const providerListCost = inputCost + textThinkingCost + imageOutputCost;
  const customerPrice = applyMarkupNanoUsd(providerListCost);
  const creditValue = readCreditValueNanoUsd();
  return {
    pricingVersion: HOSTED_GOOGLE_IMAGE_PRICING_VERSION,
    pricingSource: 'published_rate',
    reconciliationStatus: 'pending',
    billingUnit: 'image_output',
    providerModel: params.providerModel,
    providerModelVersion: params.modelVersion,
    providerServiceTier: params.serviceTier,
    providerResponseId: params.responseId,
    promptTokenCount: params.usage.promptTokenCount,
    cachedContentTokenCount: params.usage.cachedContentTokenCount,
    candidatesTokenCount: params.usage.candidatesTokenCount,
    thoughtsTokenCount: params.usage.thoughtsTokenCount,
    providerListCostNanoUsd: providerListCost.toString(),
    providerInvoicedCostNanoUsd: null,
    markupBasisPoints: HOSTED_GOOGLE_COST_MARKUP_BPS,
    grossMarginBasisPoints: HOSTED_GOOGLE_GROSS_MARGIN_BPS,
    customerPriceNanoUsd: customerPrice.toString(),
    creditMicroUnitsCharged: creditValue ? customerPriceToMicrocredits(customerPrice, creditValue).toString() : null
  };
};

// Analysis (pose/style/wardrobe quality gates) is restricted to approved vision-text models so a
// paid image generation cannot be relabeled as a free zero-credit analysis call.
const ANALYSIS_OPERATION_MODELS = new Set<string>([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
]);

const readHostedCreditMetadata = (
  body: GenerateImageRequestBody,
  expectedResponseType: ExpectedResponseType,
  providerModel: string
) => {
  const payload = body.payload ?? {};
  const options = isObjectRecord(body.options) ? body.options : {};

  const operation = deriveHostedOperation(expectedResponseType);
  const qualityGateBilling = normalizeHostedQualityGateBilling(options.hostedQualityGateBilling);

  // Resolve the server-owned analysis policy from the client-declared analysisKind. The kind — not any
  // client billing flag or usageCategory string — is authoritative for billing/credits/usage label.
  const requestedAnalysisKind = typeof options.analysisKind === 'string' ? options.analysisKind : undefined;
  let analysisPolicy: HostedAnalysisPolicy | undefined;
  if (requestedAnalysisKind !== undefined) {
    if (operation !== 'analyze') {
      throw new HttpError(400, 'ANALYSIS_KIND_ON_GENERATE', 'analysisKind is only valid for text/json analysis operations, not image generation.');
    }
    analysisPolicy = HOSTED_ANALYSIS_POLICIES[requestedAnalysisKind];
    if (!analysisPolicy) {
      throw new HttpError(400, 'INVALID_ANALYSIS_KIND', `Unknown analysisKind "${requestedAnalysisKind}".`);
    }
    if (analysisPolicy.responseType !== expectedResponseType) {
      throw new HttpError(400, 'ANALYSIS_KIND_RESPONSE_MISMATCH', `analysisKind "${requestedAnalysisKind}" requires response type "${analysisPolicy.responseType}", received "${expectedResponseType}".`);
    }
  }

  // Prevent relabeling a generation as free analysis: analysis must use a whitelisted vision model.
  if (operation === 'analyze' && !ANALYSIS_OPERATION_MODELS.has(providerModel)) {
    throw new HttpError(
      400,
      'INVALID_ANALYSIS_MODEL',
      `Analysis operations must use an approved vision-text model; received "${providerModel}".`
    );
  }

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

  // Post-generation analysis is included in the original generation's charge: the server bills it as
  // zero credits (derived from the server-side operation type, NOT a client flag) unless the caller
  // explicitly opts into separately-paid analysis. This guarantees a legitimate analysis call can
  // never be rejected with INVALID_REQUIRED_CREDITS, while image generation is always charged.
  // When an analysisKind is present, the policy is billing truth. Otherwise fall back to the
  // flag-based rule (analyze is included unless explicitly paid) so unmigrated/legacy calls still work.
  // Metered analysis kinds are billed by actual Google usage × markup, settled AFTER the provider call.
  // Before the call we reserve a bounded maximum (the policy cap). The client's fixed estimate is not
  // cross-checked because the real charge is variable and computed server-side from usageMetadata.
  const isMeteredAnalysis = analysisPolicy?.billing === 'metered';

  const includedQualityGate = isIncludedHostedQualityGateBilling(options, expectedResponseType);
  const treatAsIncludedAnalysis = analysisPolicy
    ? analysisPolicy.billing === 'included'
    : includedQualityGate || (operation === 'analyze' && qualityGateBilling !== 'paid');

  let backendCalculatedRequiredCredits: number;
  if (isMeteredAnalysis) {
    backendCalculatedRequiredCredits = meteredReservationCredits(analysisPolicy!);
  } else if (analysisPolicy) {
    backendCalculatedRequiredCredits = analysisPolicy.credits;
  } else {
    backendCalculatedRequiredCredits = treatAsIncludedAnalysis ? 0 : calculateBackendRequiredCredits(generationType, resolutionTier);
  }

  const clientRequiredCredits = isMeteredAnalysis
    ? null
    : normalizeClientRequiredCredits(
        body.requiredCredits ??
        payload.requiredCredits ??
        options.requiredCredits,
        backendCalculatedRequiredCredits === 0
      );

  if (clientRequiredCredits !== null && clientRequiredCredits !== backendCalculatedRequiredCredits) {
    throw new HttpError(
      400,
      'CREDIT_COST_MISMATCH',
      `Credit metadata mismatch: client requiredCredits ${clientRequiredCredits} does not match backend calculated ${backendCalculatedRequiredCredits}.`
    );
  }

  // Server-derived usage category, taken only from the validated analysisKind policy. A client-supplied
  // usageCategory display string is never trusted or persisted.
  const usageCategory: string | undefined = analysisPolicy?.usageCategory;

  return {
    operation,
    generationType,
    resolutionTier,
    requiredCredits: backendCalculatedRequiredCredits,
    creditPricingVersion: CREDIT_PRICING_VERSION,
    usageCategory,
    billingMode: isMeteredAnalysis ? 'metered' : 'fixed',
    analysisKind: isMeteredAnalysis ? requestedAnalysisKind : undefined
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

// Sums today's hosted (non-BYOK) spend for a user from completed generations, optionally restricted to a
// billing operation (e.g. 'analyze'). Used for server-authoritative daily spend caps. Best-effort: on a
// query error it returns 0 (the per-request cap + balance check still gate the call).
const sumHostedSpendSince = async (
  supabaseService: SupabaseClientAny,
  userId: string,
  sinceIso: string,
  operation: 'analyze' | null
): Promise<number> => {
  try {
    let query = supabaseService
      .from('generations')
      .select('cost')
      .eq('user_id', userId)
      .eq('is_byok', false)
      .gte('created_at', sinceIso);
    if (operation) query = query.filter('billing_metadata->>operation', 'eq', operation);
    const { data, error } = await withTimeout(query, 8000, 'sum_hosted_spend');
    if (error || !Array.isArray(data)) return 0;
    return data.reduce((sum: number, row: { cost?: unknown }) => sum + (Number(row.cost) || 0), 0);
  } catch {
    return 0;
  }
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
  settlement: MeteredSettlement;
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

  // Grounding policy: Google Web/Image Search grounding is billed separately ($14 per 1,000 queries
  // after a shared 5,000/mo free allowance; one request may issue multiple queries). Server-observed
  // billed-query counts are not yet available, so we fail closed rather than under-charge — a grounded
  // hosted image request is rejected until grounding pricing (Policy A) or invoice reconciliation
  // (Policy B) is implemented. See docs/hosted-google-pricing-audit.md.
  if (requestUsesGoogleGrounding(requestBody)) {
    throw new GenerationExecutionError(
      400,
      'GROUNDING_NOT_PRICED',
      'INTERNAL_ERROR',
      'Grounding/search is not yet priced for metered hosted image generation. Disable grounding for this request.'
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

    // Meter the image generation at published list cost × 2 (input tokens + image output by resolution).
    // Fails closed on missing/invalid usage, unsupported tier, or unknown model/resolution pricing.
    const usageMeta = result.usageMetadata as Record<string, unknown> | null | undefined;
    const usage = normalizeProviderUsage(usageMeta);
    const serviceTier = normalizeServiceTier(usageMeta?.serviceTier);
    const settlement = buildImageMeteredSettlement({
      providerModel,
      serviceTier,
      resolution: resolutionTier,
      modelVersion: typeof result.modelVersion === 'string' ? result.modelVersion : null,
      responseId: typeof result.responseId === 'string' ? result.responseId : null,
      usage
    });

    return {
      assetUrl: upload.publicUrl,
      fileKey: upload.fileKey,
      providerStartedAt,
      providerFinishedAt,
      r2StartedAt: upload.r2StartedAt,
      r2FinishedAt: upload.r2FinishedAt,
      referenceCount: materialized.referenceCount,
      settlement
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
  settlement: MeteredSettlement;
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

  // Meter the call from the provider's own usageMetadata (fails closed on missing/invalid usage, and
  // on an unsupported service tier — Standard prices are never silently applied to Batch/Flex/etc.).
  const usageMeta = result.usageMetadata as Record<string, unknown> | null | undefined;
  const usage = normalizeProviderUsage(usageMeta);
  const serviceTier = normalizeServiceTier(usageMeta?.serviceTier);
  const settlement = buildMeteredSettlement({
    providerModel,
    modelVersion: typeof result.modelVersion === 'string' ? result.modelVersion : null,
    serviceTier,
    responseId: typeof result.responseId === 'string' ? result.responseId : null,
    usage
  });

  return {
    assetUrl: `data:application/json;charset=utf-8,${encodeURIComponent(text)}`,
    providerStartedAt,
    providerFinishedAt,
    settlement
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      { status: 405, headers: { Allow: 'POST, OPTIONS' } }
    );
  }

  let supabaseServiceForFailure: SupabaseClientAny | null = null;
  let startedGenerationId: string | null = null;
  let generationAccepted = false;
  let expectedResponseTypeForFailure: ExpectedResponseType | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new HttpError(401, 'UNAUTHORIZED', 'Missing Authorization header');

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
      throw new HttpError(401, 'UNAUTHORIZED', 'Unauthorized');
    }

    // Service client ONLY
    const supabaseService = createClient(supabaseUrl, supabaseServerKey);
    supabaseServiceForFailure = supabaseService;
    
    const userId = userData.user.id;
    const requestBody = await readJsonBody(req);
    const { payload, executionFingerprint } = validateGenerateImageRequestBody(requestBody);
    const providerModel = normalizeHostedProviderModel(payload.model);
    const expectedResponseType = readExpectedResponseType(requestBody);
    expectedResponseTypeForFailure = expectedResponseType;

    const creditMetadata = readHostedCreditMetadata(requestBody, expectedResponseType, providerModel);

    // ===== Server-authoritative spend controls (checked BEFORE provider invocation) =====
    const killAll = (Deno.env.get('HOSTED_GOOGLE_KILL_SWITCH') ?? '').toLowerCase() === 'true';
    const killAnalysis = (Deno.env.get('HOSTED_ANALYSIS_KILL_SWITCH') ?? '').toLowerCase() === 'true';
    if (killAll) {
      throw new HttpError(503, 'HOSTED_GOOGLE_DISABLED', 'Hosted Google operations are temporarily disabled by an administrator.');
    }
    if (creditMetadata.operation === 'analyze' && killAnalysis) {
      throw new HttpError(503, 'HOSTED_GOOGLE_DISABLED', 'Hosted analysis is temporarily disabled by an administrator.');
    }

    const numericEnv = (name: string): number | null => {
      const raw = Deno.env.get(name);
      if (!raw || raw.trim() === '') return null;
      const v = Number(raw);
      return Number.isFinite(v) && v >= 0 ? v : null;
    };

    // Per-request reservation cap.
    const requestCap = numericEnv('HOSTED_REQUEST_COST_CAP_CREDITS');
    if (requestCap !== null && creditMetadata.requiredCredits > requestCap) {
      throw new HttpError(429, 'REQUEST_COST_LIMIT', `This request reserves ${creditMetadata.requiredCredits} credits, above the per-request cap of ${requestCap}.`);
    }

    // Per-user daily total + analysis-only caps (server-summed from today's completed generations).
    const userDailyCap = numericEnv('HOSTED_USER_DAILY_SPEND_CAP_CREDITS');
    const analysisDailyCap = numericEnv('HOSTED_ANALYSIS_DAILY_SPEND_CAP_CREDITS');
    if (userDailyCap !== null || analysisDailyCap !== null) {
      const since = new Date(); since.setUTCHours(0, 0, 0, 0);
      if (userDailyCap !== null) {
        const spent = await sumHostedSpendSince(supabaseService, userId, since.toISOString(), null);
        if (spent + creditMetadata.requiredCredits > userDailyCap) {
          throw new HttpError(429, 'USER_DAILY_SPEND_LIMIT', `Daily hosted spend cap of ${userDailyCap} credits reached.`);
        }
      }
      if (analysisDailyCap !== null && creditMetadata.operation === 'analyze') {
        const spent = await sumHostedSpendSince(supabaseService, userId, since.toISOString(), 'analyze');
        if (spent + creditMetadata.requiredCredits > analysisDailyCap) {
          throw new HttpError(429, 'ANALYSIS_DAILY_SPEND_LIMIT', `Daily hosted-analysis cap of ${analysisDailyCap} credits reached.`);
        }
      }
    }

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

      // Persist the server-derived metered ledger metadata (token counts, provider cost, markup,
      // customer price, microcredits, pricing version). Client-supplied values are never used.
      const settlement = analysisResult.settlement;
      const meteredBillingMetadata = {
        ...creditMetadata,
        operation: 'analyze',
        analysisKind: creditMetadata.analysisKind ?? null,
        billingMode: 'metered',
        provider: 'gemini',
        ...settlement,
        parentGenerationId: job.id,
        executionFingerprint,
        fundingSource: 'paid',
        reservationCredits: creditMetadata.requiredCredits,
        // Only mark SETTLED when metered billing is enabled AND settleable; otherwise leave the legacy
        // reservation as the live charge and flag for reconciliation.
        settlementStatus: (HOSTED_METERED_BILLING_ENABLED && settlement.creditMicroUnitsCharged !== null) ? 'SETTLED' : 'RECONCILE_PENDING'
      };
      const { error: billingMetaErr } = await supabaseService
        .from('generations')
        .update({ billing_metadata: meteredBillingMetadata })
        .eq('id', job.id);
      if (billingMetaErr) {
        console.warn(`[Metered Analysis] Could not persist billing_metadata for ${job.id}: ${billingMetaErr.message}`);
      }

      // Apply the metered charge ONLY behind the feature flag (don't partially charge before local DB
      // tests + UI + credit value are ready). Idempotent on providerResponseId.
      if (HOSTED_METERED_BILLING_ENABLED && settlement.creditMicroUnitsCharged !== null) {
        const actualCredits = Number(BigInt(settlement.creditMicroUnitsCharged)) / 1_000_000;
        const { error: settleErr } = await supabaseService.rpc('settle_generation', {
          p_generation_id: job.id,
          p_actual_cost: actualCredits,
          p_provider_response_id: settlement.providerResponseId
        });
        if (settleErr) {
          console.warn(`[Metered Analysis] settle_generation unavailable for ${job.id} (RECONCILE_PENDING): ${settleErr.message}`);
        }
      } else if (!HOSTED_METERED_BILLING_ENABLED) {
        console.info(`[Metered Analysis] Metered billing disabled (flag off); ${job.id} on legacy reservation, RECONCILE_PENDING.`);
      } else {
        console.warn(`[Metered Analysis] No HOSTED_CREDIT_USD_VALUE_NANO_USD configured; ${job.id} left RECONCILE_PENDING.`);
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

      // Persist the metered image settlement (published list cost × 2) for reconciliation. The live
      // charge for image generation remains the legacy reservation (creditMetadata.requiredCredits) until
      // the image rates are verified and the settle flow is integration-tested; the row is therefore
      // flagged RECONCILE_PENDING rather than auto-settled to the metered amount.
      const imageSettlement = imageResult.settlement;
      const imageBillingMetadata = {
        ...creditMetadata,
        operation: 'generate',
        billingMode: 'metered',
        provider: 'gemini',
        ...imageSettlement,
        parentGenerationId: job.id,
        executionFingerprint,
        fundingSource: 'paid',
        reservationCredits: creditMetadata.requiredCredits,
        settlementStatus: 'RECONCILE_PENDING'
      };
      const { error: imgBillingMetaErr } = await supabaseService
        .from('generations')
        .update({ billing_metadata: imageBillingMetadata })
        .eq('id', job.id);
      if (imgBillingMetaErr) {
        console.warn(`[Metered Image] Could not persist billing_metadata for ${job.id}: ${imgBillingMetaErr.message}`);
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

