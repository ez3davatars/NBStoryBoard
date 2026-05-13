import type { VeoFivePartDraft, VeoAudioBlock } from '../promptEngine/veoFivePart';
import type { ActorIdentityReferenceSet } from '../context/AppContext';
import { buildOrderedActorIdentityInputs, hasStrongFaceAnchor } from '../utils/identityReferenceHelpers';
import { SupabaseAuth, supabase } from './SupabaseClient';
import { assertAuthenticatedForGeneration } from './AuthGenerationGate';
import {
  CREDIT_PRICING_VERSION,
  INSUFFICIENT_HOSTED_CREDITS_EVENT,
  calculateRequiredGenerationCredits,
  type HostedCreditRenderType,
  type HostedGenerationType,
  type HostedImageSize,
  type HostedResolutionTier,
  type InsufficientCreditModalState,
  toHostedResolutionTier
} from '../utils/billingProducts';
import { normalizeImageGenerationModel } from '../constants/generationModels';
import {
  buildPoseCoherenceCorrectionPrompt,
  buildPoseCoherenceValidationPrompt,
  parsePoseCoherenceValidation,
  shouldApplyPoseCoherence,
  shouldValidatePoseCoherence,
  withPoseCoherenceContract,
  type PoseCoherenceIntent
} from '../../prompts/poseCoherence';
import {
  buildHeadshotWardrobeCorrectionPrompt,
  buildHeadshotWardrobeValidationPrompt,
  parseHeadshotWardrobeValidation,
  shouldApplyHeadshotWardrobeContinuity,
  shouldValidateHeadshotWardrobeContinuity,
  withHeadshotWardrobeContinuityContract,
  type HeadshotWardrobeContinuityIntent
} from '../../prompts/headshotWardrobeContinuity';
import {
  buildStyleCorrectionPrompt,
  buildStyleValidationPrompt,
  parseStyleValidation,
  shouldApplyStyleCategoryContract,
  shouldValidateStyleCategory,
  withStyleCategoryContract,
  type StyleCategoryIntent
} from '../../prompts/styleContracts';
import { withSheetStyleLockContract } from '../../prompts/sheetStyleLock';
import {
  withBiometricIdentityLockContract,
  type BiometricIdentityLock
} from '../../prompts/identityContracts';
import {
  shouldApplyCharacterAnatomyIntegrity,
  withCharacterAnatomyIntegrityContract
} from '../../prompts/characterAnatomyIntegrity';

export type ExtractedStyle = {
  medium?: string;
  palette?: string;
  lighting?: string;
  renderStyle?: string;
  mood?: string;
  styleSummary?: string;
  impliedEra?: string;
  impliedWorld?: string;
  architectureHints?: string;
  environmentMustAvoid?: string;
};

export type SceneIntent = {
  location?: string;
  action?: string;
  furniture?: string[];
  propContext?: string[];
  mood?: string;
  supportContext?: string[];
  mustInclude?: string[];
  mustAvoid?: string[];
  summary?: string;
  recommendedCamera?: string;
  recommendedLighting?: string;
};

type BillingMode = 'hosted' | 'byok';
type ExpectedResponseType = 'image' | 'text' | 'json';

type GenerationEntitlements = {
  hasHostedAccess?: boolean;
  hasByokAccess?: boolean;
  effectiveBillingMode?: string;
};

type PoseCoherenceGenerationOptions = {
  poseCoherence?: boolean | {
    enabled?: boolean;
    validate?: boolean;
    retry?: boolean;
    intent?: PoseCoherenceIntent;
  };
  _poseCoherenceRetryAttempt?: number;
};

type HeadshotWardrobeGenerationOptions = {
  headshotWardrobeContinuity?: boolean | {
    enabled?: boolean;
    validate?: boolean;
    retry?: boolean;
    intent?: HeadshotWardrobeContinuityIntent;
  };
  _headshotWardrobeRetryAttempt?: number;
};

type StyleCategoryGenerationOptions = {
  styleCategory?: boolean | {
    enabled?: boolean;
    validate?: boolean;
    retry?: boolean;
    styleId?: string | null;
    intent?: StyleCategoryIntent;
  };
  _styleCategoryRetryAttempt?: number;
};

type BiometricIdentityGenerationOptions = {
  identityLock?: BiometricIdentityLock | BiometricIdentityLock[] | null;
  identityLocks?: BiometricIdentityLock[];
};

type GeminiInlineData = {
  mimeType: string;
  data: string;
};

type GeminiPart = {
  text?: string;
  inlineData?: GeminiInlineData;
  [key: string]: unknown;
};

type GeminiGenerateContentResult = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
  }>;
  predictions?: Array<{
    bytesBase64Encoded?: string;
  }>;
};

type HostedExecutionOptions = {
  imageSize?: HostedImageSize;
  creditRenderType?: HostedCreditRenderType;
  expectedResponseType?: ExpectedResponseType;
  onJobAccepted?: (generationId: string, acceptedAt?: number) => void;
  uiWaitWindowMs?: number;
  signal?: AbortSignal;
};

type HostedBillingMetadata = {
  generationType: HostedGenerationType;
  resolutionTier: HostedResolutionTier;
  requiredCredits: number;
  creditPricingVersion: typeof CREDIT_PRICING_VERSION;
};

type HostedCreditPreflightResult = {
  billingMetadata: HostedBillingMetadata;
  verified: boolean;
};

type HostedInsufficientCreditsResponse = {
  code?: unknown;
  requiredCredits?: unknown;
  currentCredits?: unknown;
};

type SharedGenerationOptions = PoseCoherenceGenerationOptions & HeadshotWardrobeGenerationOptions & StyleCategoryGenerationOptions & BiometricIdentityGenerationOptions & {
  billingMode?: BillingMode;
  entitlements?: GenerationEntitlements;
  onJobAccepted?: (generationId: string, acceptedAt?: number) => void;
  expectedResponseType?: ExpectedResponseType;
  imageSize?: HostedImageSize;
  creditRenderType?: HostedCreditRenderType;
  uiWaitWindowMs?: number;
  signal?: AbortSignal;
  hostedQualityGateBilling?: 'skip' | 'paid';
};

type ImageGenerationOptions = SharedGenerationOptions & {
  aspectRatio?: string;
  thinkingLevel?: boolean | 'minimal' | 'low' | 'medium' | 'high';
  googleGrounding?: boolean;
  strictMode?: boolean;
};

const QUALITY_GATE_UI_WAIT_WINDOW_MS = 90000;

const withQualityGateWaitWindow = <T extends SharedGenerationOptions>(options: T): T => ({
  ...options,
  imageSize: undefined,
  creditRenderType: undefined,
  uiWaitWindowMs: Math.min(options.uiWaitWindowMs ?? QUALITY_GATE_UI_WAIT_WINDOW_MS, QUALITY_GATE_UI_WAIT_WINDOW_MS)
});

const shouldSkipHostedQualityGate = (options: SharedGenerationOptions): boolean =>
  options.billingMode === 'hosted' && options.hostedQualityGateBilling !== 'paid';

type HostedSupabaseClient = {
  auth: {
    getUser: () => Promise<{ data?: { user?: { id?: string } } }>;
  };
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: Blob,
        options: { contentType?: string; upsert?: boolean }
      ) => Promise<{ error: HostedStorageUploadError | null }>;
    };
  };
};

type HostedStorageUploadError = {
  message?: string;
  status?: number | string;
  statusCode?: number | string;
  code?: number | string;
  name?: string;
};

type ElectronApiWithWorkerStatus = {
  getWorkerStatus?: () => Promise<{
    imageWorker: { status: string; lastError?: string | null };
  }>;
};

type ThinkingConfig = { thinkingLevel: string };

type VeoFivePartDraftResponse = VeoFivePartDraft & {
  audio?: VeoAudioBlock;
  negativePrompt?: string;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const HOSTED_REFERENCE_UPLOAD_PRIMARY_MAX_SIZE = 3072;
const HOSTED_REFERENCE_UPLOAD_FALLBACK_MAX_SIZE = 2048;
const HOSTED_REFERENCE_UPLOAD_MAX_ATTEMPTS = 2;
const HOSTED_REFERENCE_UPLOAD_RETRY_BASE_MS = 850;
const HOSTED_REFERENCE_UPLOAD_ATTEMPT_TIMEOUT_MS = 30000;

class HostedReferenceUploadError extends Error {
  transient: boolean;
  originalError: HostedStorageUploadError;

  constructor(message: string, transient: boolean, originalError: HostedStorageUploadError) {
    super(message);
    this.name = 'HostedReferenceUploadError';
    this.transient = transient;
    this.originalError = originalError;
  }
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error("AbortError: Canceled by user");
};

const waitForHostedReferenceUploadRetry = (attempt: number): Promise<void> => {
  const jitter = Math.floor(Math.random() * 250);
  const delayMs = HOSTED_REFERENCE_UPLOAD_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1)) + jitter;
  return new Promise((resolve) => setTimeout(resolve, delayMs));
};

const getHostedStorageErrorMessage = (error: HostedStorageUploadError): string =>
  error.message || error.name || 'unknown storage upload error';

const getHostedStorageStatus = (error: HostedStorageUploadError): number | null => {
  const rawStatus = error.statusCode ?? error.status ?? error.code;
  const parsed = typeof rawStatus === 'number' ? rawStatus : Number.parseInt(String(rawStatus ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const isTransientHostedStorageError = (error: HostedStorageUploadError): boolean => {
  const status = getHostedStorageStatus(error);
  if (status !== null && [408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;

  const message = getHostedStorageErrorMessage(error).toLowerCase();
  return /\b(408|409|425|429|500|502|503|504)\b/.test(message)
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('gateway')
    || message.includes('temporarily')
    || message.includes('network')
    || message.includes('failed to fetch');
};

const inlineImageDataToBlob = (inline: GeminiInlineData): Blob => {
  const byteString = atob(inline.data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let k = 0; k < byteString.length; k++) {
    ia[k] = byteString.charCodeAt(k);
  }
  return new Blob([ab], { type: inline.mimeType });
};

const runHostedReferenceUploadAttempt = (
  client: HostedSupabaseClient,
  storagePath: string,
  blob: Blob,
  mimeType: string
): Promise<{ error: HostedStorageUploadError | null }> =>
  Promise.race([
    client.storage.from('reference_images').upload(storagePath, blob, {
      contentType: mimeType,
      upsert: true
    }),
    new Promise<{ error: HostedStorageUploadError }>((resolve) => {
      setTimeout(() => {
        resolve({
          error: {
            name: 'UploadTimeout',
            statusCode: 408,
            message: `storage upload attempt timed out after ${Math.round(HOSTED_REFERENCE_UPLOAD_ATTEMPT_TIMEOUT_MS / 1000)}s`
          }
        });
      }, HOSTED_REFERENCE_UPLOAD_ATTEMPT_TIMEOUT_MS);
    })
  ]);

const uploadHostedReferenceWithRetry = async (args: {
  client: HostedSupabaseClient;
  storagePath: string;
  blob: Blob;
  mimeType: string;
  label: string;
  signal?: AbortSignal;
}): Promise<void> => {
  const { client, storagePath, blob, mimeType, label, signal } = args;

  for (let attempt = 1; attempt <= HOSTED_REFERENCE_UPLOAD_MAX_ATTEMPTS; attempt++) {
    throwIfAborted(signal);
    const { error } = await runHostedReferenceUploadAttempt(client, storagePath, blob, mimeType);

    if (!error) return;

    const transient = isTransientHostedStorageError(error);
    const message = getHostedStorageErrorMessage(error);
    if (!transient || attempt === HOSTED_REFERENCE_UPLOAD_MAX_ATTEMPTS) {
      console.error("Storage bypass error:", error);
      throw new HostedReferenceUploadError(`Failed to upload reference ${label}: ${message}`, transient, error);
    }

    console.warn(`[Storage Proxy Retry] Reference upload failed for ${label}: ${message}. Retrying ${attempt + 1}/${HOSTED_REFERENCE_UPLOAD_MAX_ATTEMPTS}...`);
    await waitForHostedReferenceUploadRetry(attempt);
  }
};

const extractInlineImageData = (result: GeminiGenerateContentResult): string | undefined =>
  result.candidates?.[0]?.content?.parts?.find(
    (part): part is GeminiPart & { inlineData: GeminiInlineData } =>
      typeof part.inlineData?.data === 'string' && part.inlineData.data.length > 0
  )?.inlineData.data;

const extractTextParts = (result: GeminiGenerateContentResult, joiner: string): string =>
  (result.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text)
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .join(joiner)
    .trim();

class InsufficientHostedCreditsError extends Error {
  details: InsufficientCreditModalState;

  constructor(details: InsufficientCreditModalState) {
    super(`Insufficient hosted credits: this render needs ${details.requiredCredits} credits, current balance is ${details.currentCredits}.`);
    this.name = 'InsufficientHostedCreditsError';
    this.details = details;
  }
}

const getHostedRequestImageSize = (
  requestBody: Record<string, unknown>,
  fallback?: HostedImageSize
): HostedImageSize | undefined => {
  if (fallback) return fallback;

  const generationConfig = requestBody.generationConfig as { imageConfig?: { imageSize?: unknown } } | undefined;
  const imageSize = generationConfig?.imageConfig?.imageSize;
  return imageSize === '1K' || imageSize === '2K' || imageSize === '4K' ? imageSize : undefined;
};

const buildHostedBillingMetadata = (
  requestBody: Record<string, unknown>,
  options: HostedExecutionOptions = {}
): HostedBillingMetadata => {
  const imageSize = getHostedRequestImageSize(requestBody, options.imageSize);
  const resolutionTier = toHostedResolutionTier(imageSize);
  const generationType = options.creditRenderType ?? 'standard';
  const requiredCredits = calculateRequiredGenerationCredits({
    generationType,
    resolutionTier
  });

  return {
    generationType,
    resolutionTier,
    requiredCredits,
    creditPricingVersion: CREDIT_PRICING_VERSION
  };
};

const dispatchInsufficientHostedCredits = (
  details: InsufficientCreditModalState
) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(INSUFFICIENT_HOSTED_CREDITS_EVENT, { detail: details }));
  }
};

const isHostedInsufficientCreditsResponse = (
  value: unknown
): value is HostedInsufficientCreditsResponse =>
  Boolean(value && typeof value === 'object' && (value as HostedInsufficientCreditsResponse).code === 'INSUFFICIENT_CREDITS');

const tryParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const GeminiService = {

  // Helper: Flatten structured actor references for multi-image Gemini injection
  flattenActorReferenceImageUrls(actorReferences: Array<{ actorId: string, referenceImageUrls: string[] }>): string[] {
    if (!actorReferences || actorReferences.length === 0) return [];
    
    const flattened: string[] = [];
    actorReferences.forEach(actor => {
      if (!actor.referenceImageUrls || actor.referenceImageUrls.length === 0) {
        console.warn(`[Face Fidelity] Actor ${actor.actorId} is missing reference images in pipeline.`);
      } else {
        flattened.push(...actor.referenceImageUrls);
      }
    });
    return flattened;
  },

  // Helper: Convert Blob/Data URL to Base64
  async _resolveImageData(
    url: string,
    maxSize: number = 3072,
    options: { preservePng?: boolean } = {}
  ): Promise<{ mimeType: string; data: string }> {
    if (!url) throw new Error("No URL provided to _resolveImageData");

    let resolvedMimeType = '';
    let resolvedData = '';

    // 1. Handle Base64 Data URL
    if (url.startsWith('data:')) {
      try {
        resolvedMimeType = url.substring(url.indexOf(':') + 1, url.indexOf(';'));
        resolvedData = url.split('base64,')[1];
        if (!resolvedData) throw new Error("Invalid base64 data");
      } catch {
        throw new Error("Failed to parse base64 data URL");
      }
    }
    // 2. Handle Blob URL (or any fetchable URL)
    else if (url.startsWith('blob:') || url.startsWith('http')) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const blob = await response.blob();
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            try {
              resolvedMimeType = result.substring(result.indexOf(':') + 1, result.indexOf(';'));
              resolvedData = result.split('base64,')[1];
              resolve();
            } catch {
              reject(new Error("Failed to parse blob to base64"));
            }
          };
          reader.onerror = () => reject(new Error("FileReader error"));
          reader.readAsDataURL(blob);
        });
      } catch (e: unknown) {
        throw new Error(`Failed to resolve image data from ${url.startsWith('blob:') ? 'blob' : 'URL'}: ${getErrorMessage(e)}`);
      }
    }
    // 3. Handle Raw Base64 (Assume PNG)
    else if (url.length > 100) { // Simple heuristic for raw base64
      resolvedMimeType = 'image/png';
      resolvedData = url;
    } else {
      throw new Error(`Invalid image URL format: ${url.substring(0, 50)}...`);
    }

    // 4. Downscale Guardian - Protects Gemini REST API from Deadline Exceeded timeouts on massive uncompressed Turnaround sheets
    try {
      // Reconstruct temporary data URI
      const tempUrl = `data:${resolvedMimeType};base64,${resolvedData}`;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = tempUrl;
      });

      const MAX_SIZE = maxSize || 3072; // Gemini multi-image payload limit logic
      let targetW = img.width;
      let targetH = img.height;
      const needsFlattening = !options.preservePng && (resolvedMimeType.includes('png') || resolvedMimeType.includes('webp'));
      
      if (targetW > MAX_SIZE || targetH > MAX_SIZE || needsFlattening) {
          if (targetW > MAX_SIZE || targetH > MAX_SIZE) {
              const ratio = Math.min(MAX_SIZE / targetW, MAX_SIZE / targetH);
              targetW = Math.round(targetW * ratio);
              targetH = Math.round(targetH * ratio);
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              // Paint solid black background for transparent pixels to prevent encoder hallucination
              ctx.fillStyle = '#000000';
              ctx.fillRect(0, 0, targetW, targetH);
              ctx.drawImage(img, 0, 0, targetW, targetH);
              const optimizedUrl = options.preservePng
                ? canvas.toDataURL('image/png')
                : canvas.toDataURL('image/jpeg', 0.90);
              resolvedMimeType = options.preservePng ? 'image/png' : 'image/jpeg';
              resolvedData = optimizedUrl.split('base64,')[1];
          }
      }
    } catch (err) {
      console.warn('[GeminiService] Image downscale Guardian failed, falling back to original extracted base64.', err);
    }

    return { mimeType: resolvedMimeType, data: resolvedData };
  },

  // Helper: sanitize + reframe prompts for Gemini 3.x native image generation
  _sanitizeImagePromptForGemini(prompt: string): { prompt: string; avoidBullets: string[] } {
    let p = (prompt || '').trim();
    const avoid: string[] = [];

    // Remove MJ/SD style aspect tokens; aspect ratio is controlled via imageConfig.aspectRatio
    p = p.replace(/\s--ar\s+[^\s]+/gi, '').trim();

    // Convert `--no ...` into avoid tokens
    const noMatch = p.match(/\s--no\s([^\n]+)$/i);
    if (noMatch?.[1]) {
      avoid.push(...noMatch[1].split(',').map(s => s.trim()).filter(Boolean));
      p = p.replace(/\s--no\s[^\n]+$/i, '').trim();
    }

    // Convert the Director prompt's NEGATIVE CONSTRAINTS block into bullets
    const negBlockMatch = p.match(/\n\nNEGATIVE\s+CONSTRAINTS[\s\S]*?:\s*([\s\S]+)$/i);
    if (negBlockMatch?.[1]) {
      const negCsv = negBlockMatch[1].trim();
      p = p.replace(/\n\nNEGATIVE\s+CONSTRAINTS[\s\S]*?$/i, '').trim();
      avoid.push(...negCsv.split(',').map(s => s.trim()).filter(Boolean));
    }

    // Convert the Environment generator's ABSOLUTE FINAL NEGATIVE PROMPT block into bullets
    const absNegMatch = p.match(/ABSOLUTE\s+FINAL\s+NEGATIVE\s+PROMPT:\s*([^\n]+)/i);
    if (absNegMatch?.[1]) {
        const absCsv = absNegMatch[1].trim();
        p = p.replace(/ABSOLUTE\s+FINAL\s+NEGATIVE\s+PROMPT:\s*[^\n]+/i, '').trim();
        avoid.push(...absCsv.split(',').map(s => s.trim()).filter(Boolean));
    }

    // Deduplicate avoid bullets
    const seen = new Set<string>();
    const avoidBullets = avoid.filter(a => {
      const k = a.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Gemini 3 image prompting tends to respond better to a simple leading instruction
    // Keep original content intact; just add a short "create an image" header.
    const header = "Create a single image following ALL requirements below.";
    const finalPrompt =
      p.toLowerCase().startsWith('create ') || p.toLowerCase().startsWith('generate ')
        ? p
        : `${header}\n\n${p}`;

    return { prompt: finalPrompt.trim(), avoidBullets };
  },


  // Helper: build a safe thinkingConfig for the given model.
  // NOTE: Gemini 3.1 Flash Image supports only `minimal` (default) and `high`.
  // Passing legacy values like "low" will cause a 400.
  _buildThinkingConfigForModel(model: string, level?: string): ThinkingConfig | undefined {
    if (!level) return undefined;
    const lv = String(level).trim().toLowerCase();

    // Nano Banana 2 (Gemini 3.1 Flash Image Preview)
    if (model === "gemini-3.1-flash-image-preview") {
      // Default thinkingLevel is `minimal`; only set config when explicitly requesting High.
      if (lv === "high") return { thinkingLevel: "High" };
      return undefined;
    }

    // Nano Banana Pro (Gemini 3 Pro Image Preview) – keep conservative defaults until we confirm full enum support.
    if (model === "gemini-3-pro-image-preview") {
      if (lv === "high") return { thinkingLevel: "High" };
      return undefined;
    }

    // Fallback for other Gemini 3 models (if used elsewhere)
    if (/^gemini-3/i.test(model)) {
      if (["minimal", "low", "medium", "high"].includes(lv)) return { thinkingLevel: lv };
    }

    return undefined;
  },

  async _assertHostedCreditsAvailable(
    requestBody: Record<string, unknown>,
    options: HostedExecutionOptions = {}
  ): Promise<HostedCreditPreflightResult> {
    const billingMetadata = buildHostedBillingMetadata(requestBody, options);
    if (!supabase) return { billingMetadata, verified: false };

    const userObj = await supabase.auth.getUser();
    const userId = userObj.data?.user?.id;
    if (!userId) return { billingMetadata, verified: false };

    const currentCredits = await SupabaseAuth.fetchHostedCredits(userId);
    if (currentCredits === null) return { billingMetadata, verified: false };

    const hasEnoughCredits = currentCredits >= billingMetadata.requiredCredits;
    console.log("[Credit Preflight]", {
      currentCredits,
      requiredCredits: billingMetadata.requiredCredits,
      hasEnoughCredits,
      generationType: billingMetadata.generationType,
      resolution: billingMetadata.resolutionTier
    });

    if (!hasEnoughCredits) {
      const details: InsufficientCreditModalState = {
        requiredCredits: billingMetadata.requiredCredits,
        currentCredits,
        imageSize: getHostedRequestImageSize(requestBody, options.imageSize),
        resolutionTier: billingMetadata.resolutionTier,
        renderType: billingMetadata.generationType,
        openedAt: Date.now()
      };

      console.log("[Credit Preflight] blocked before debit");
      dispatchInsufficientHostedCredits(details);
      throw new InsufficientHostedCreditsError(details);
    }

    return { billingMetadata, verified: true };
  },

  async _executeHostedRequest(
    model: string,
    requestBody: Record<string, unknown>,
    options: HostedExecutionOptions = {},
    preflightMetadata?: HostedBillingMetadata
  ): Promise<string> {
    await assertAuthenticatedForGeneration({ billingMode: 'hosted' });

    const electronApi = (window as Window & { electronAPI?: ElectronApiWithWorkerStatus }).electronAPI;
    if (electronApi && typeof electronApi.getWorkerStatus === 'function') {
        const workerState = await electronApi.getWorkerStatus();
        if (workerState.imageWorker.status !== 'online') {
            throw new Error(`Hosted Generation is unavailable because the required background worker is not currently online. Status: ${workerState.imageWorker.status}. Reason: ${workerState.imageWorker.lastError || 'None'}`);
        }
    }

    const token = await SupabaseAuth.getValidJwt();
    const idempotencyKey = "batch_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    const billingMetadata = preflightMetadata ?? buildHostedBillingMetadata(requestBody, options);
    const payloadBodyForEdge = {
      model,
      requestBody,
      generationType: billingMetadata.generationType,
      resolutionTier: billingMetadata.resolutionTier,
      requiredCredits: billingMetadata.requiredCredits,
      creditPricingVersion: billingMetadata.creditPricingVersion
    };

    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(payloadBodyForEdge))
    );
    const executionFingerprint = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (!supabase) throw new Error('Supabase is not configured for hosted execution.');
    if (!token || token.split('.').length !== 3) {
      throw new Error('Hosted Execution Error: Missing or malformed user JWT');
    }

    if (!preflightMetadata) {
      await GeminiService._assertHostedCreditsAvailable(requestBody, options);
    }

    const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`;
    const rawResponse = await fetch(edgeUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
        Accept: 'application/json'
      },
      body: JSON.stringify({
        payload: payloadBodyForEdge,
        options,
        executionFingerprint,
        generationType: billingMetadata.generationType,
        resolutionTier: billingMetadata.resolutionTier,
        requiredCredits: billingMetadata.requiredCredits,
        creditPricingVersion: billingMetadata.creditPricingVersion
      }),
      signal: options.signal
    });

    const responseText = await rawResponse.text();

    if (rawResponse.status === 202) {
      const data = JSON.parse(responseText);
      const genId = data.generationId;
      if (!genId) throw new Error('Hosted Generation Error: Received 202 but no generationId.');

      if (options.onJobAccepted) options.onJobAccepted(genId, data.acceptedAt);
      
      if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refresh-credits'));
      }

      const defaultUiWaitMs =
        options.imageSize === '4K' ? 480000 :
        options.imageSize === '2K' ? 360000 :
        300000;
      const uiWaitWindowMs = Math.max(10000, options.uiWaitWindowMs ?? defaultUiWaitMs);
      let attempts = 0;
      const MAX_ATTEMPTS = Math.max(1, Math.ceil(uiWaitWindowMs / 2000));
      
      while (attempts < MAX_ATTEMPTS) {
        if (options.signal?.aborted) throw new Error("AbortError: Canceled by user");
        await new Promise(r => setTimeout(r, 2000));
        if (options.signal?.aborted) throw new Error("AbortError: Canceled by user");
        attempts++;
        
        const { data: pollData, error: pollErr } = await supabase
          .from('generations')
          .select('status, asset_url, error_message, failure_code')
          .eq('id', genId)
          .single();
          
        if (pollErr) {
          console.warn(`[Hosted Polling] db fetch error:`, pollErr.message);
          continue; // Soft retry
        }
        
        if (pollData) {
          if (pollData.status === 'COMPLETED') {
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refresh-credits'));
            
            if (options.expectedResponseType === 'json' || options.expectedResponseType === 'text') {
               if (!pollData.asset_url) throw new Error("Hosted Execution Error: COMPLETED but missing analysis payload.");
               return pollData.asset_url; // Returns raw string (JSON/text) placed by worker
            }

            if (!pollData.asset_url) throw new Error("Hosted Generation Error: COMPLETED but missing asset_url.");
            return pollData.asset_url;
          }
          if (pollData.status === 'FAILED') {
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refresh-credits'));
            throw new Error(`Hosted Execution Error [${pollData.failure_code || 'PROVIDER_ERROR'}]: ${pollData.error_message}`);
          }
          if (pollData.status === 'EXPIRED') {
            throw new Error("Hosted Execution Error: Asset expired and was cleaned up. Please save locally in time.");
          }
          if (pollData.status === 'CANCELED') {
            throw new Error('Hosted Execution Error: Job was canceled manually.');
          }
        }
      }
      
      const timeoutSeconds = Math.round(uiWaitWindowMs / 1000);
      const timeoutErr = new Error(`Hosted Generation Pending: Generation exceeded the current UI wait window (${timeoutSeconds}s) and may still complete in the background.`) as Error & { generationId?: string };
      timeoutErr.name = 'TimeoutError';
      timeoutErr.generationId = genId;
      throw timeoutErr;
    }

    if (!rawResponse.ok) {
      const parsedResponse = tryParseJson(responseText);
      if (rawResponse.status === 402 && isHostedInsufficientCreditsResponse(parsedResponse)) {
        const requiredCredits = Number(parsedResponse.requiredCredits ?? billingMetadata.requiredCredits);
        const currentCredits = Number(parsedResponse.currentCredits ?? 0);
        const details: InsufficientCreditModalState = {
          requiredCredits: Number.isFinite(requiredCredits) && requiredCredits > 0
            ? requiredCredits
            : billingMetadata.requiredCredits,
          currentCredits: Number.isFinite(currentCredits) ? currentCredits : 0,
          imageSize: getHostedRequestImageSize(requestBody, options.imageSize),
          resolutionTier: billingMetadata.resolutionTier,
          renderType: billingMetadata.generationType,
          openedAt: Date.now()
        };
        dispatchInsufficientHostedCredits(details);
        throw new InsufficientHostedCreditsError(details);
      }
      throw new Error(`generate-image ${rawResponse.status}: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    return data.imageUrl;
  },

  async _validatePoseCoherenceAndRetry(args: {
    imageUrl: string;
    rawPrompt: string;
    effectivePrompt: string;
    apiKey: string;
    model: string;
    referenceImages: { url: string; label: string }[];
    referenceLabels: string[];
    options: ImageGenerationOptions;
    intent?: PoseCoherenceIntent;
  }): Promise<string> {
    const { imageUrl, rawPrompt, effectivePrompt, apiKey, model, referenceImages, referenceLabels, options, intent } = args;
    const poseOption = options.poseCoherence;
    const poseEnabled = typeof poseOption === 'object' ? poseOption.enabled !== false : poseOption !== false;
    const validateAllowed = typeof poseOption === 'object' ? poseOption.validate !== false : true;
    const retryAllowed = typeof poseOption === 'object' ? poseOption.retry !== false : true;
    const alreadyRetried = (options._poseCoherenceRetryAttempt ?? 0) > 0;

    if (!poseEnabled || !validateAllowed || !shouldValidatePoseCoherence(effectivePrompt, referenceLabels)) {
      return imageUrl;
    }
    if (shouldSkipHostedQualityGate(options)) {
      console.info('[PoseCoherence] Skipping hosted quality gate to avoid additional credit charges.');
      return imageUrl;
    }

    try {
      const validationText = await GeminiService.analyzeImage(
        buildPoseCoherenceValidationPrompt(intent, effectivePrompt),
        apiKey,
        model,
        imageUrl,
        { ...withQualityGateWaitWindow(options), expectedResponseType: 'text' }
      );
      const validation = parsePoseCoherenceValidation(validationText);
      const shouldRetry =
        retryAllowed &&
        !alreadyRetried &&
        validation.requiresRetry &&
        (validation.poseCoherent === false || validation.headCoherent === false) &&
        validation.confidence >= 0.55;

      if (!shouldRetry) {
        return imageUrl;
      }

      console.warn('[PoseCoherence] Generated image failed body-axis validation; retrying once.', validation);
      const retryPrompt = buildPoseCoherenceCorrectionPrompt(rawPrompt, validation, intent);

      return await GeminiService.generateImage(
        retryPrompt,
        apiKey,
        model,
        referenceImages,
        {
          ...options,
          strictMode: true,
          poseCoherence: {
            enabled: true,
            validate: false,
            retry: false,
            intent
          },
          _poseCoherenceRetryAttempt: (options._poseCoherenceRetryAttempt ?? 0) + 1
        }
      );
    } catch (error) {
      console.warn('[PoseCoherence] Validation skipped after quality-gate error.', error);
      return imageUrl;
    }
  },

  async _validatePoseCoherenceAndRetryCustom(args: {
    imageUrl: string;
    rawPrompt: string;
    effectivePrompt: string;
    apiKey: string;
    model: string;
    referenceLabels: string[];
    options?: SharedGenerationOptions;
    intent?: PoseCoherenceIntent;
    retry: (retryPrompt: string, nextOptions: SharedGenerationOptions) => Promise<string>;
  }): Promise<string> {
    const { imageUrl, rawPrompt, effectivePrompt, apiKey, model, referenceLabels, retry, intent } = args;
    const options = args.options ?? {};
    const poseOption = options.poseCoherence;
    const poseEnabled = typeof poseOption === 'object' ? poseOption.enabled !== false : poseOption !== false;
    const validateAllowed = typeof poseOption === 'object' ? poseOption.validate !== false : true;
    const retryAllowed = typeof poseOption === 'object' ? poseOption.retry !== false : true;
    const alreadyRetried = (options._poseCoherenceRetryAttempt ?? 0) > 0;

    if (!poseEnabled || !validateAllowed || !shouldValidatePoseCoherence(effectivePrompt, referenceLabels)) {
      return imageUrl;
    }
    if (shouldSkipHostedQualityGate(options)) {
      console.info('[PoseCoherence] Skipping hosted custom quality gate to avoid additional credit charges.');
      return imageUrl;
    }

    try {
      const validationText = await GeminiService.analyzeImage(
        buildPoseCoherenceValidationPrompt(intent, effectivePrompt),
        apiKey,
        model,
        imageUrl,
        { ...withQualityGateWaitWindow(options), expectedResponseType: 'text' }
      );
      const validation = parsePoseCoherenceValidation(validationText);
      const shouldRetry =
        retryAllowed &&
        !alreadyRetried &&
        validation.requiresRetry &&
        (validation.poseCoherent === false || validation.headCoherent === false) &&
        validation.confidence >= 0.55;

      if (!shouldRetry) {
        return imageUrl;
      }

      console.warn('[PoseCoherence] Generated image failed custom body-axis validation; retrying once.', validation);
      const retryPrompt = buildPoseCoherenceCorrectionPrompt(rawPrompt, validation, intent);
      return await retry(retryPrompt, {
        ...options,
        poseCoherence: {
          enabled: true,
          validate: false,
          retry: false,
          intent
        },
        _poseCoherenceRetryAttempt: (options._poseCoherenceRetryAttempt ?? 0) + 1
      });
    } catch (error) {
      console.warn('[PoseCoherence] Custom validation skipped after quality-gate error.', error);
      return imageUrl;
    }
  },

  async _validateHeadshotWardrobeContinuityAndRetry(args: {
    imageUrl: string;
    rawPrompt: string;
    effectivePrompt: string;
    apiKey: string;
    model: string;
    referenceImages: { url: string; label: string }[];
    referenceLabels: string[];
    options: ImageGenerationOptions;
    intent?: HeadshotWardrobeContinuityIntent;
  }): Promise<string> {
    const { imageUrl, rawPrompt, effectivePrompt, apiKey, model, referenceImages, referenceLabels, options, intent } = args;
    const headshotOption = options.headshotWardrobeContinuity;
    const enabled = typeof headshotOption === 'object' ? headshotOption.enabled !== false : headshotOption !== false;
    const validateAllowed = typeof headshotOption === 'object' ? headshotOption.validate !== false : true;
    const retryAllowed = typeof headshotOption === 'object' ? headshotOption.retry !== false : true;
    const alreadyRetried = (options._headshotWardrobeRetryAttempt ?? 0) > 0;

    if (!enabled || !validateAllowed || !shouldValidateHeadshotWardrobeContinuity(effectivePrompt, referenceLabels)) {
      return imageUrl;
    }
    if (shouldSkipHostedQualityGate(options)) {
      console.info('[HeadshotWardrobeContinuity] Skipping hosted quality gate to avoid additional credit charges.');
      return imageUrl;
    }

    try {
      const validationText = await GeminiService.analyzeImage(
        buildHeadshotWardrobeValidationPrompt(effectivePrompt, intent),
        apiKey,
        model,
        imageUrl,
        { ...withQualityGateWaitWindow(options), expectedResponseType: 'text' }
      );
      const validation = parseHeadshotWardrobeValidation(validationText);
      const shouldRetry =
        retryAllowed &&
        !alreadyRetried &&
        validation.requiresRetry &&
        validation.wardrobeCoherent === false &&
        validation.confidence >= 0.55;

      if (!shouldRetry) {
        return imageUrl;
      }

      console.warn('[HeadshotWardrobeContinuity] Generated image failed headshot clothing validation; retrying once.', validation);
      const retryPrompt = buildHeadshotWardrobeCorrectionPrompt(rawPrompt, validation, intent);

      return await GeminiService.generateImage(
        retryPrompt,
        apiKey,
        model,
        referenceImages,
        {
          ...options,
          strictMode: true,
          headshotWardrobeContinuity: {
            enabled: true,
            validate: false,
            retry: false,
            intent
          },
          _headshotWardrobeRetryAttempt: (options._headshotWardrobeRetryAttempt ?? 0) + 1
        }
      );
    } catch (error) {
      console.warn('[HeadshotWardrobeContinuity] Validation skipped after quality-gate error.', error);
      return imageUrl;
    }
  },

  async _validateStyleCategoryAndRetry(args: {
    imageUrl: string;
    rawPrompt: string;
    effectivePrompt: string;
    apiKey: string;
    model: string;
    referenceImages: { url: string; label: string }[];
    referenceLabels: string[];
    options: ImageGenerationOptions;
    styleId?: string | null;
    intent?: StyleCategoryIntent;
  }): Promise<string> {
    const { imageUrl, rawPrompt, effectivePrompt, apiKey, model, referenceImages, referenceLabels, options, styleId, intent } = args;
    const styleOption = options.styleCategory;
    const enabled = typeof styleOption === 'object' ? styleOption.enabled !== false : styleOption !== false;
    const validateAllowed = typeof styleOption === 'object' ? styleOption.validate !== false : true;
    const retryAllowed = typeof styleOption === 'object' ? styleOption.retry !== false : true;
    const alreadyRetried = (options._styleCategoryRetryAttempt ?? 0) > 0;
    const resolvedStyleId = typeof styleOption === 'object' ? styleOption.styleId ?? styleId : styleId;

    if (!enabled || !validateAllowed || !shouldValidateStyleCategory(`${effectivePrompt}\n${referenceLabels.join('\n')}`, resolvedStyleId)) {
      return imageUrl;
    }
    if (shouldSkipHostedQualityGate(options)) {
      console.info('[StyleCategory] Skipping hosted quality gate to avoid additional credit charges.');
      return imageUrl;
    }

    try {
      const validationPrompt = buildStyleValidationPrompt(effectivePrompt, resolvedStyleId, intent);
      if (!validationPrompt) return imageUrl;

      const validationText = await GeminiService.analyzeImage(
        validationPrompt,
        apiKey,
        model,
        imageUrl,
        { ...withQualityGateWaitWindow(options), expectedResponseType: 'text' }
      );
      const validation = parseStyleValidation(validationText);
      const shouldRetry =
        retryAllowed &&
        !alreadyRetried &&
        validation.requiresRetry &&
        validation.styleCoherent === false &&
        validation.confidence >= 0.55;

      if (!shouldRetry) {
        return imageUrl;
      }

      console.warn('[StyleCategory] Generated image failed selected style validation; retrying once.', validation);
      const retryPrompt = buildStyleCorrectionPrompt(rawPrompt, validation, resolvedStyleId, intent);

      return await GeminiService.generateImage(
        retryPrompt,
        apiKey,
        model,
        referenceImages,
        {
          ...options,
          strictMode: true,
          styleCategory: {
            enabled: true,
            validate: false,
            retry: false,
            styleId: resolvedStyleId,
            intent
          },
          _styleCategoryRetryAttempt: (options._styleCategoryRetryAttempt ?? 0) + 1
        }
      );
    } catch (error) {
      console.warn('[StyleCategory] Validation skipped after quality-gate error.', error);
      return imageUrl;
    }
  },


  async generateImage(
    prompt: string,
    apiKey: string,
    model: string,
    referenceImages: { url: string; label: string }[] = [],
    options: ImageGenerationOptions = {}
  ): Promise<string> {
    const effectiveModel = normalizeImageGenerationModel(model);
    let hostedPreflightMetadata: HostedBillingMetadata | undefined;
    const referenceLabels = referenceImages.map((ref) => ref.label).filter(Boolean);
    const identityLockOption = options.identityLocks ?? options.identityLock;
    const promptWithIdentityLock = withBiometricIdentityLockContract(prompt, identityLockOption);
    const poseOption = options.poseCoherence;
    const poseEnabled = typeof poseOption === 'object' ? poseOption.enabled !== false : poseOption !== false;
    const poseIntent = typeof poseOption === 'object' ? poseOption.intent : undefined;
    const promptWithPoseCoherence =
      poseEnabled && shouldApplyPoseCoherence(promptWithIdentityLock, referenceLabels)
        ? withPoseCoherenceContract(promptWithIdentityLock, poseIntent)
        : promptWithIdentityLock;
    const headshotWardrobeOption = options.headshotWardrobeContinuity;
    const headshotWardrobeEnabled = typeof headshotWardrobeOption === 'object'
      ? headshotWardrobeOption.enabled !== false
      : headshotWardrobeOption !== false;
    const headshotWardrobeIntent = typeof headshotWardrobeOption === 'object'
      ? headshotWardrobeOption.intent
      : undefined;
    const promptWithGenerationContracts =
      headshotWardrobeEnabled && shouldApplyHeadshotWardrobeContinuity(promptWithPoseCoherence, referenceLabels)
        ? withHeadshotWardrobeContinuityContract(promptWithPoseCoherence, headshotWardrobeIntent)
        : promptWithPoseCoherence;
    const styleCategoryOption = options.styleCategory;
    const styleCategoryEnabled = typeof styleCategoryOption === 'object'
      ? styleCategoryOption.enabled !== false
      : styleCategoryOption !== false;
    const styleCategoryId = typeof styleCategoryOption === 'object' ? styleCategoryOption.styleId : undefined;
    const styleCategoryIntent = typeof styleCategoryOption === 'object' ? styleCategoryOption.intent : undefined;
    const promptWithStyleCategory =
      styleCategoryEnabled && shouldApplyStyleCategoryContract(promptWithGenerationContracts, styleCategoryId)
        ? withStyleCategoryContract(promptWithGenerationContracts, styleCategoryId, styleCategoryIntent)
        : promptWithGenerationContracts;
    const promptWithAnatomyIntegrity =
      shouldApplyCharacterAnatomyIntegrity(promptWithStyleCategory, referenceLabels)
        ? withCharacterAnatomyIntegrityContract(promptWithStyleCategory)
        : promptWithStyleCategory;
    const promptWithAllContracts = withSheetStyleLockContract(
      promptWithAnatomyIntegrity,
      styleCategoryId,
      {
        source: styleCategoryId ? 'user_selected' : 'auto_detected',
        selectedStyleLabel: styleCategoryIntent?.selectedStyleLabel,
        strictness: 'high'
      }
    );

    // --- API ACCESS LAYER ---
    // All features are available in both Hosted and BYOK. The only difference is API prerequisites.
    if (options.billingMode === 'hosted') {
      await assertAuthenticatedForGeneration({ billingMode: 'hosted' });
    }
    if (options.billingMode === 'byok' && !apiKey) {
      throw new Error("API Key required for BYOK generation.");
    }
    // Legacy fallback for older call-sites that don't send billing mode.
    if (!apiKey && options.billingMode !== 'hosted') {
      console.warn("No API Key. Running in simulation mode.");
      await new Promise(r => setTimeout(r, 1500));
      return `https://placehold.co/1024x576/1a1a1a/FFF?text=Demo+Mode:+${encodeURIComponent(prompt.substring(0, 20))}`;
    }

    // MULTIMODAL PIPELINE (NanoBanana 2 / Gemini 3.1)
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent`;

      const contentsParts: GeminiPart[] = [];

      if (import.meta.env.DEV) {
        console.log("Multimodal images attached:", referenceImages.length);
      }

      let host_supabase: HostedSupabaseClient | null = null;
      let host_uid: string = 'anon';
      const executionBatchId = crypto.randomUUID();
      
      if (options.billingMode === 'hosted') {
         host_supabase = supabase as HostedSupabaseClient | null;
         if (!host_supabase) throw new Error("Supabase is not configured for hosted generation.");
         
         // Use strict getUser() specifically to guarantee fresh network validity instead of local session cache
         const userObj = await host_supabase.auth.getUser();
         host_uid = userObj.data?.user?.id || 'anon';
         
         if (host_uid === 'anon') {
             throw new Error("Authentication required: You must be logged into a valid Supabase session to use Hosted Mode uploads.");
         }

         const hostedPreflight = await GeminiService._assertHostedCreditsAvailable({}, options);
         hostedPreflightMetadata = hostedPreflight.verified ? hostedPreflight.billingMetadata : undefined;
      }

      // Inject references first
      let imgIndex = 1;
      for (const ref of referenceImages) {
        if (imgIndex > 14) break;

        if (!ref.url) {
          throw new Error(`Multimodal Error: Reference image ${imgIndex} has no URL.`);
        }

        contentsParts.push({ text: `[IMAGE ${imgIndex}] ${ref.label}` });

        if (options.billingMode === 'hosted') {
            console.log(`[GeminiService] Uploading normalized ${HOSTED_REFERENCE_UPLOAD_PRIMARY_MAX_SIZE}px reference bypass: ${ref.label}`);
            
            // CRITICAL FIX: We MUST use _resolveImageData even before uploading to storage.
            // Why? Because it uses native DOM <canvas> to enforce sRGB color space, flatten transparent pngs to solid background,
            // strictly apply EXIF rotation, and limit extreme resolutions before the hosted worker reads them.
            // If we upload the Raw Blob directly, Gemini API silently fails or ignores unoptimized/rotated alpha payloads,
            // resulting in complete identity hallucinations.
            let inline = await GeminiService._resolveImageData(ref.url, HOSTED_REFERENCE_UPLOAD_PRIMARY_MAX_SIZE);
            let blob = inlineImageDataToBlob(inline);
            
            const fileExt = inline.mimeType.split('/')[1] || 'jpeg';
            const storagePath = `${host_uid}/${executionBatchId}/ref_${imgIndex}.${fileExt}`;
            
            console.log(`[Storage Proxy Pre-flight] Attempting high-fidelity bypass upload...`);
            console.log(`- Authenticated UID: ${host_uid}`);
            console.log(`- Exact Target Path: ${storagePath}`);
            console.log(`- Valid Session Detected? ${host_uid !== 'anon'}`);
            console.log(`- Normalized Upload Size: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`);
            
            try {
                await uploadHostedReferenceWithRetry({
                    client: host_supabase!,
                    storagePath,
                    blob,
                    mimeType: inline.mimeType,
                    label: ref.label,
                    signal: options.signal
                });
            } catch (error) {
                if (!(error instanceof HostedReferenceUploadError) || !error.transient) {
                    throw error;
                }

                console.warn(`[Storage Proxy Retry] High-fidelity upload stayed unstable for ${ref.label}. Retrying with ${HOSTED_REFERENCE_UPLOAD_FALLBACK_MAX_SIZE}px normalized fallback...`);
                inline = await GeminiService._resolveImageData(ref.url, HOSTED_REFERENCE_UPLOAD_FALLBACK_MAX_SIZE);
                blob = inlineImageDataToBlob(inline);
                console.log(`- Fallback Upload Size: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`);

                await uploadHostedReferenceWithRetry({
                    client: host_supabase!,
                    storagePath,
                    blob,
                    mimeType: inline.mimeType,
                    label: `${ref.label} (${HOSTED_REFERENCE_UPLOAD_FALLBACK_MAX_SIZE}px fallback)`,
                    signal: options.signal
                });
            }
            
            contentsParts.push({
                hosted_reference_path: storagePath,
                mimeType: inline.mimeType,
                label: ref.label,
                originalUrl: ref.url.substring(0, 50) + "..."
            });
        } else {
            // BYOK keeps the high fidelity 3072 local base64 pipeline
            const inline = await GeminiService._resolveImageData(ref.url, 3072);
            contentsParts.push({
              inlineData: { mimeType: inline.mimeType, data: inline.data }
            });
        }
        
        imgIndex++;
      }

      // Inject prompt last for better "instruction following" on the visual context
      // --- Prompt normalization for Gemini 3.x image models ---
      // The Nano Banana 2 model is more sensitive to prompt structure; we normalize common legacy tokens
      // and move "avoid" constraints into a short bullet list near the top for stronger compliance.
      const strictMode = options.strictMode ?? /SPATIAL PROTOCOL|NEGATIVE CONSTRAINTS|CRITICAL\s*-\s*DO NOT|NON-NEGOTIABLE|POSE COHERENCE CONTRACT|HEADSHOT WARDROBE CONTINUITY CONTRACT|STYLE CATEGORY CONTRACT|SHEET STYLE LOCK|CHARACTER ANATOMY INTEGRITY CONTRACT/i.test(promptWithAllContracts);

      const sanitized = GeminiService._sanitizeImagePromptForGemini(promptWithAllContracts);
      let finalPrompt = sanitized.prompt;

      if (strictMode && sanitized.avoidBullets.length > 0) {
        const avoidBlock =
          `NON-NEGOTIABLE (DO NOT INCLUDE):\n` +
          sanitized.avoidBullets.map(a => `- ${a}`).join('\n') +
          `\n\nIf any requirement conflicts, follow NON-NEGOTIABLE first.`;

        // Insert avoid block near the top (after the first paragraph) to improve compliance.
        const firstBreak = finalPrompt.indexOf('\n\n');
        if (firstBreak !== -1) {
          finalPrompt = finalPrompt.slice(0, firstBreak + 2) + avoidBlock + '\n\n' + finalPrompt.slice(firstBreak + 2);
        } else {
          finalPrompt = finalPrompt + '\n\n' + avoidBlock;
        }
      }

      contentsParts.push({ text: finalPrompt });

      const useGrounding =
        (options.googleGrounding !== false) && !strictMode && referenceImages.length === 0;

      const rawThinking =
        typeof options.thinkingLevel === 'string'
          ? options.thinkingLevel
          : options.thinkingLevel === true
            ? 'high'
            : undefined;

      // For strict prompts we default to higher thinking to improve instruction-following.
      // (Gemini 3.1 Flash Image default is `minimal`; `high` usually helps with long, rule-heavy prompts.)
      const desiredThinkingLevel = rawThinking ?? (strictMode ? 'high' : undefined);

      // Map extended UI aspect ratios to the strict subset supported natively by Gemini Image API
      let finalAspectRatio = options.aspectRatio || "16:9";
      if (finalAspectRatio === "4:5") finalAspectRatio = "3:4";
      else if (finalAspectRatio === "3:2") finalAspectRatio = "4:3";
      else if (finalAspectRatio === "21:9") finalAspectRatio = "16:9";

      const requestBody: {
        contents: Array<{ parts: GeminiPart[] }>;
        generationConfig: {
          responseModalities: string[];
          candidateCount: number;
          imageConfig: { aspectRatio: string; imageSize?: '1K' | '2K' | '4K' };
          thinkingConfig?: ThinkingConfig;
        };
        tools?: Array<{
          googleSearch: {
            searchTypes: {
              webSearch: Record<string, never>;
              imageSearch: Record<string, never>;
            };
          };
        }>;
      } = {
        contents: [{ parts: contentsParts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          candidateCount: 1,
          imageConfig: {
            aspectRatio: finalAspectRatio,
            ...(options.imageSize && { imageSize: options.imageSize })
          }
        },
        ...(useGrounding ? {
          tools: [
            {
              googleSearch: {
                searchTypes: {
                  webSearch: {},
                  imageSearch: {}
                }
              }
            }
          ]
        } : {})
      };

      const thinkingConfig = GeminiService._buildThinkingConfigForModel(effectiveModel, desiredThinkingLevel);
      if (thinkingConfig) {
        requestBody.generationConfig.thinkingConfig = thinkingConfig;
      }
      if (options.billingMode === 'hosted') {
        const hostedImageUrl = await GeminiService._executeHostedRequest(effectiveModel, requestBody, options, hostedPreflightMetadata);
        const poseCheckedUrl = await GeminiService._validatePoseCoherenceAndRetry({
          imageUrl: hostedImageUrl,
          rawPrompt: prompt,
          effectivePrompt: promptWithAllContracts,
          apiKey,
          model,
          referenceImages,
          referenceLabels,
          options,
          intent: poseIntent
        });
        return await GeminiService._validateHeadshotWardrobeContinuityAndRetry({
          imageUrl: poseCheckedUrl,
          rawPrompt: prompt,
          effectivePrompt: promptWithAllContracts,
          apiKey,
          model,
          referenceImages,
          referenceLabels,
          options,
          intent: headshotWardrobeIntent
        }).then((headshotCheckedUrl) => GeminiService._validateStyleCategoryAndRetry({
          imageUrl: headshotCheckedUrl,
          rawPrompt: prompt,
          effectivePrompt: promptWithAllContracts,
          apiKey,
          model,
          referenceImages,
          referenceLabels,
          options,
          styleId: styleCategoryId,
          intent: styleCategoryIntent
        }));
      }
      // ===============================================

      let response = await fetch(`${baseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        let errText = await response.text();
        console.error("Gemini API Error Response:", errText);
        let cleanMsg = errText;
        try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }

        // If a model rejects our thinkingLevel, retry once without thinkingConfig (falls back to model default).
        const thinkingRejected =
          response.status === 400 &&
          /thinking level/i.test(cleanMsg) &&
          /not supported/i.test(cleanMsg) &&
          requestBody?.generationConfig?.thinkingConfig;

        if (thinkingRejected) {
          console.warn("Gemini: thinkingLevel rejected by model; retrying without thinkingConfig.");
          delete requestBody.generationConfig.thinkingConfig;

          response = await fetch(`${baseUrl}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
            errText = await response.text();
            console.error("Gemini API Error Response (retry):", errText);
            cleanMsg = errText;
            try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
            throw new Error(`Gemini Error (${response.status}): ${cleanMsg}`);
          }
        } else {
          throw new Error(`Gemini Error (${response.status}): ${cleanMsg}`);
        }
      }

      const result = await response.json() as GeminiGenerateContentResult;
      const imgData = extractInlineImageData(result);
      if (!imgData) throw new Error("No image returned from Gemini.");
      const generatedImageUrl = `data:image/png;base64,${imgData}`;
      const poseCheckedUrl = await GeminiService._validatePoseCoherenceAndRetry({
        imageUrl: generatedImageUrl,
        rawPrompt: prompt,
        effectivePrompt: promptWithAllContracts,
        apiKey,
        model,
        referenceImages,
        referenceLabels,
        options,
        intent: poseIntent
      });
      return await GeminiService._validateHeadshotWardrobeContinuityAndRetry({
        imageUrl: poseCheckedUrl,
        rawPrompt: prompt,
        effectivePrompt: promptWithAllContracts,
        apiKey,
        model,
        referenceImages,
        referenceLabels,
        options,
        intent: headshotWardrobeIntent
      }).then((headshotCheckedUrl) => GeminiService._validateStyleCategoryAndRetry({
        imageUrl: headshotCheckedUrl,
        rawPrompt: prompt,
        effectivePrompt: promptWithAllContracts,
        apiKey,
        model,
        referenceImages,
        referenceLabels,
        options,
        styleId: styleCategoryId,
        intent: styleCategoryIntent
      }));
  },

  // Vision/Text-only analysis from a single image (returns model text)
  async analyzeImage(
    prompt: string,
    apiKey: string | null | undefined,
    _model: string,
    imageUrl: string,
    options: SharedGenerationOptions = {}
  ): Promise<string> {
    if (options.billingMode === 'hosted') {
      await assertAuthenticatedForGeneration({ billingMode: 'hosted' });
    }
    if (!apiKey && options.billingMode !== 'hosted') throw new Error("No API Key provided.");
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : (apiKey || '');
    // Force a vision-text model for analysis to avoid modality errors with generation models
    const useModel = 'gemini-2.5-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    const inline = await GeminiService._resolveImageData(imageUrl, 1024);
    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: inline.mimeType, data: inline.data } }
        ]
      }]
    };

    if (options.billingMode === 'hosted') {
        const hostedDataUrl = await GeminiService._executeHostedRequest(useModel, requestBody, options);
        if (hostedDataUrl && hostedDataUrl.startsWith('data:application/json')) {
            return decodeURIComponent(hostedDataUrl.split(',')[1]);
        }
        return hostedDataUrl;
    }

    const response = await fetch(`${baseUrl}?key=${effectiveKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = errText;
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
      throw new Error(`Gemini Analyze Error: ${cleanMsg}`);
    }

    const result = await response.json() as GeminiGenerateContentResult;
    const parts = result.candidates?.[0]?.content?.parts || [];
    const textOut = parts
      .map((p) => p.text)
      .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
      .join("\n")
      .trim();
    if (!textOut) throw new Error("No text returned from analysis.");
    return textOut;
  },

  // Multi-frame reasoning for Motion Director (Start + End frames)
  async analyzeMultiFrame(
    prompt: string,
    apiKey: string | null | undefined,
    _model: string,
    frames: { url: string; label: string }[],
    options: SharedGenerationOptions = {}
  ): Promise<string> {
    if (options.billingMode === 'hosted') {
      await assertAuthenticatedForGeneration({ billingMode: 'hosted' });
    }
    if (!apiKey && options.billingMode !== 'hosted') throw new Error("No API Key provided.");
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : (apiKey || '');
    // Multi-frame reasoning requires a vision-capable text model
    const useModel = 'gemini-2.5-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    const parts: GeminiPart[] = [];

    // 1. Inject frames with labels
    let idx = 1;
    for (const frame of frames) {
      parts.push({ text: `[FRAME ${idx}: ${frame.label}]` });
      const inline = await GeminiService._resolveImageData(frame.url, 1024);
      parts.push({ inlineData: { mimeType: inline.mimeType, data: inline.data } });
      idx++;
    }

    // 2. Inject the reasoning prompt
    parts.push({ text: prompt });

    const requestBody = {
      contents: [{ parts }]
    };

    if (options.billingMode === 'hosted') {
        const rawResultText = await GeminiService._executeHostedRequest(useModel, requestBody, { ...options, expectedResponseType: 'text' });
        
        // Backwards compatibility purely for legacy payloads already queued
        if (rawResultText && rawResultText.startsWith('data:application/json')) {
            return decodeURIComponent(rawResultText.split(',')[1]);
        }
        return rawResultText;
    }

    const response = await fetch(`${baseUrl}?key=${effectiveKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = errText;
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
      throw new Error(`Gemini Multi-Frame Error: ${cleanMsg}`);
    }

    const result = await response.json() as GeminiGenerateContentResult;
    const textOut = extractTextParts(result, '');
    if (!textOut) throw new Error("No reasoning generated.");
    return textOut;
  },

  async analyzeMultiFrameJson<T>(
    prompt: string,
    apiKey: string | null | undefined,
    model: string,
    frames: { url: string; label: string }[],
    options: SharedGenerationOptions = {}
  ): Promise<T> {
    const strictPrompt = `
       ${prompt}
       
       CRITICAL INSTRUCTION: Return ONLY valid JSON. No markdown formatting. No code fences. No commentary.
     `;

    // Reuse the underlying fetch logic or just call analyzeMultiFrame if acceptable. 
    // For safety/types, let's call the base method since it returns string.
    // Request explicit JSON payload typing for Edge normalization
    const rawText = await GeminiService.analyzeMultiFrame(strictPrompt, apiKey, model, frames, { ...options, expectedResponseType: 'json' });

    try {
      // Clean potentially messy output (e.g. ```json ... ```)
      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

      // Handle cases where model adds text before/after JSON
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error("No JSON object found in response.");
      }

      const jsonString = cleaned.substring(firstBrace, lastBrace + 1);
      return JSON.parse(jsonString) as T;
    } catch {
      console.error("JSON Parse Error on:", rawText);
      throw new Error("Gemini failed to return valid JSON. Please try again.");
    }
  },



  /**
   * Style Transfer Pipeline: Phase 1
   * Analyzes a character image to extract aesthetic style descriptors.
   */
  async analyzeCharacterStyle(
    imageUrl: string,
    apiKey: string | null | undefined,
    model: string = 'gemini-2.5-flash', // Defaulting to the fast multimodal model
    options: SharedGenerationOptions = {}
  ): Promise<ExtractedStyle> {
    if (!apiKey && options.billingMode !== 'hosted') throw new Error("No API Key provided for style analysis.");
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : (apiKey || '');

    const prompt = `Analyze this character image. Return a JSON object describing their exact artistic medium, color palette, mood, and inferred setting details based on their wardrobe/prop vocabulary.

    AESTHETICS:
    Do NOT describe the character's physical features or clothing. Only describe the aesthetic style (e.g., 3D animated, CG animated, pastel colors, cel-shaded, gritty cinematic, etc.). Return only style descriptors. No full sentences.

    CRITICAL LIGHTING RULE: Do NOT include character-specific or studio lighting descriptors (e.g., "soft studio lighting", "portrait lighting", "beauty lighting", "rim lighting", "flat"). These will conflict with environment generation later. If you describe lighting, keep it broad and environment-safe (e.g., "volumetric", "cinematic", "moody", or prioritize "mood").

    SETTING / WORLD INFERENCE:
    Look at the character's wardrobe, props, and silhouette. Infer the probable time period (e.g. Ancient, Biblical, Medieval, Cyberpunk, 1920s), world type (e.g. Desert village, Sci-Fi metropolis, High Fantasy castle), and derived architecture hints. Also note what environmental aesthetics would contradict the clothing.

    Return EXACTLY this JSON structure:
{
  "medium": "string (e.g., '3D render', 'Digital painting', 'Photograph')",
  "palette": "string (e.g., 'Cyberpunk neon', 'Muted earth tones')",
  "lighting": "string (e.g., 'Volumetric', 'Flat cel-shaded')",
  "renderStyle": "string (e.g., 'Unreal Engine 5', 'Anime')",
  "mood": "string (e.g., 'Gritty', 'Whimsical')",
  "styleSummary": "string (A comma-separated list of the best aesthetic descriptors)",
  "impliedEra": "string (e.g., 'Ancient/Pre-modern', 'Sci-Fi')",
  "impliedWorld": "string (e.g., 'Biblical town', 'Space station')",
  "architectureHints": "string (e.g., 'Stone and plaster, no modern glass')",
  "environmentMustAvoid": "string (A comma-separated list of things that contradict the era)"
}
    `;

    try {
      // Reuse the JSON generation logic with the image attached
      const result = await this.analyzeMultiFrameJson<ExtractedStyle>(
        prompt,
        effectiveKey,
        model,
        [{ url: imageUrl, label: 'Character Asset' }],
        options
      );
      
      if (!result || !result.styleSummary) {
          throw new Error("Invalid style analysis payload returned.");
      }

      return result;
    } catch (err: unknown) {
      console.error("[GeminiService.analyzeCharacterStyle] Failed:", err);
      throw new Error("Failed to extract style from character. Please try again.");
    }
  },


  /**
   * NanoBanana-style local edit using a binary mask.
   * - baseImageUrl: the image to edit
   * - maskDataUrl: black/white mask (white = edit, black = protect)
   * - instruction: what to do in the masked region
   *
   * Note: This uses Gemini image-capable models. If you pass Imagen model, call-site should route to a Gemini model.
   */
  async editImageWithMask(
    baseImageUrl: string,
    maskDataUrl: string,
    instruction: string,
    apiKey: string | null | undefined,
    model: string,
    referenceImages: { url: string; label: string }[] = [],
    options: { aspectRatio?: string, imageSize?: HostedImageSize, creditRenderType?: HostedCreditRenderType, billingMode?: BillingMode, entitlements?: GenerationEntitlements, expectedResponseType?: 'image', targetDimensions?: { width: number; height: number } } = {}
  ): Promise<string> {
    if (options.billingMode === 'hosted') {
      await assertAuthenticatedForGeneration({ billingMode: 'hosted' });
    }
    if (!apiKey && options.billingMode !== 'hosted') throw new Error("No API Key provided.");
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : (apiKey || '');
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const resolveMaxSize = options.targetDimensions
      ? Math.max(2048, Math.min(4096, Math.max(options.targetDimensions.width, options.targetDimensions.height)))
      : 2048;

    const base = await GeminiService._resolveImageData(baseImageUrl, resolveMaxSize);
    const mask = await GeminiService._resolveImageData(maskDataUrl, resolveMaxSize, { preservePng: true });

    const parts: GeminiPart[] = [];

    // 1) Base image and edit mask
    parts.push({ inlineData: { mimeType: base.mimeType, data: base.data } });
    parts.push({ inlineData: { mimeType: mask.mimeType, data: mask.data } });

    // 2) Optional reference images
    for (const ref of referenceImages) {
      const r = await GeminiService._resolveImageData(ref.url);
      parts.push({ text: `[REFERENCE SOURCE] ${ref.label}` });
      parts.push({ inlineData: { mimeType: r.mimeType, data: r.data } });
    }

    // 3) Instruction prompt
    const targetDimensionInstruction = options.targetDimensions
      ? `Target output dimensions: ${options.targetDimensions.width} x ${options.targetDimensions.height}. Preserve this exact source aspect ratio.`
      : options.aspectRatio
        ? `Target aspect ratio: ${options.aspectRatio}.`
        : 'Preserve the source image dimensions and aspect ratio.';
    parts.push({
      text: `
You are a precision image editor.

[IMAGE 1] is the BASE IMAGE.
[IMAGE 2] is the EDIT MASK.

MASK RULES:
- WHITE = editable region
- BLACK = locked region

Perform the requested edit ONLY inside the white region.
Preserve all black-region pixels exactly.

Instruction: ${instruction}
${targetDimensionInstruction}

Hard constraints:
- Remove only the targeted non-anatomical object or material inside the white region.
- Preserve any nearby visible human anatomy exactly, including hands, fingers, face, hair, ears, neck, and exposed skin.
- Do not delete, repaint, deform, shorten, merge, blur, or replace human anatomy adjacent to the mask.
- If the masked object overlaps anatomy, remove the non-anatomical object only and reconstruct the obscured anatomy naturally.
- Do not change composition.
- Do not move or rescale subjects.
- Do not alter any unmasked region.
- Do not introduce new objects outside the white region.
- Do not change identity, face, hair, wardrobe, or body unless explicitly requested inside the mask.
- Match surrounding texture, lighting, and realism seamlessly.
- No text, no watermark, no extra artifacts.
`
    });

    let finalAspectRatio = options.aspectRatio || "16:9";
    if (finalAspectRatio === "4:5") finalAspectRatio = "3:4";
    else if (finalAspectRatio === "3:2") finalAspectRatio = "4:3";
    else if (finalAspectRatio === "21:9") finalAspectRatio = "16:9";

    const imageConfig = options.targetDimensions
      ? undefined
      : {
          aspectRatio: finalAspectRatio,
          ...(options.imageSize && { imageSize: options.imageSize })
        };

    const requestBody = {
        contents: [{ parts }],
        generationConfig: {
            responseModalities: ["IMAGE"],
            candidateCount: 1,
            ...(imageConfig && { imageConfig }),
            temperature: 0.2
        }
    };

    if (options.billingMode === 'hosted') {
        let payload = await GeminiService._executeHostedRequest(model, requestBody, options);

        if (payload && typeof payload === 'object') {
            try {
                payload = JSON.stringify(payload);
            } catch {
                throw new Error('Hosted payload failure: could not serialize non-string response.');
            }
        }

        if (!payload || typeof payload !== 'string') {
            throw new Error(`Hosted payload failure. Expected string, got ${typeof payload}`);
        }

        const trimmed = payload.trim();

        // Case 1: Hosted worker already returned a usable image/data URL
        if (
            trimmed.startsWith('http://') ||
            trimmed.startsWith('https://') ||
            trimmed.startsWith('blob:') ||
            trimmed.startsWith('data:image/')
        ) {
            return trimmed;
        }

        // Case 2: Hosted worker returned raw Gemini JSON instead of finalized asset URL
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed) as GeminiGenerateContentResult;
                const extracted = extractInlineImageData(parsed);

                if (extracted && typeof extracted === 'string' && extracted.length > 100) {
                    return `data:image/png;base64,${extracted}`;
                }

                if (parsed.candidates?.[0]?.finishReason === 'SAFETY') {
                    throw new Error('Gemini refused the edit region due to safety constraints.');
                }

                throw new Error('Completed, but payload JSON did not contain usable image data.');
            } catch (e: unknown) {
                throw new Error(`Failed to parse hosted edit payload JSON: ${getErrorMessage(e)}`);
            }
        }

        // Case 3: Raw base64
        if (trimmed.length > 500) {
            return `data:image/png;base64,${trimmed}`;
        }

        // Anything else is invalid and should never hit the UI
        throw new Error(`Hosted payload failure. Received non-image text: ${trimmed}`);
    }

    const response = await fetch(`${baseUrl}?key=${effectiveKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = errText;
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
      throw new Error(`Gemini Mask Edit Error: ${cleanMsg}`);
    }

    const result = await response.json() as GeminiGenerateContentResult;
    const imgData = extractInlineImageData(result);

    if (!imgData) throw new Error('No edited image returned from Gemini.');

    return `data:image/png;base64,${imgData}`;
  },

  async refineCompositeFromLayout(args: {
    apiKey: string;
    model?: string;
    sourceImageUrl: string;
    protectionMaskUrl?: string | null;
    editMaskUrl?: string | null;
    instructions: string;
  }): Promise<string> {
    const { apiKey, model, sourceImageUrl, protectionMaskUrl, editMaskUrl, instructions } = args;
    const effectiveModel = normalizeImageGenerationModel(model);
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent`;

    const base = await GeminiService._resolveImageData(sourceImageUrl);
    const parts: GeminiPart[] = [];
    
    parts.push({ inlineData: { mimeType: base.mimeType, data: base.data } });
    parts.push({ text: `[IMAGE 1] BASE IMAGE.` });

    let promptEnforcement = `Instruction: ${instructions}\n\n`;

    if (protectionMaskUrl) {
      const pMask = await GeminiService._resolveImageData(protectionMaskUrl);
      parts.push({ inlineData: { mimeType: pMask.mimeType, data: pMask.data } });
      parts.push({ text: `[IMAGE 2] PROTECTION MASK. WHITE = MUST PRESERVE/PROTECT EXACTLY. BLACK = UNPROTECTED.` });
      promptEnforcement += `- Strictly preserve all white pixels shown in the PROTECTION MASK without altering them.\n`;
    }

    if (editMaskUrl) {
      const eMask = await GeminiService._resolveImageData(editMaskUrl);
      parts.push({ inlineData: { mimeType: eMask.mimeType, data: eMask.data } });
      const imgIdx = protectionMaskUrl ? 3 : 2;
      parts.push({ text: `[IMAGE ${imgIdx}] EDIT ALLOWANCE MASK. WHITE = PREFERRED EDITABLE REGION. BLACK = DO NOT EDIT.` });
      promptEnforcement += `- Confine requested edits predominantly to the white pixels shown in the EDIT ALLOWANCE MASK.\n`;
    }

    if (!protectionMaskUrl && !editMaskUrl) {
      promptEnforcement += `- Perform a cautious, holistic refinement prioritizing the existing composition.\n`;
    }

    parts.push({
      text: `
You are a precision Scene Compositor.
${promptEnforcement}

Hard constraints:
- No new primary objects or characters.
- No morphing of faces/hair/body.
- No style drift.
- No extra text/watermarks.
`
    });

    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2 }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = errText;
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
      throw new Error(`Gemini Refine Error: ${cleanMsg}`);
    }

    const result = await response.json() as GeminiGenerateContentResult;
    const imgData = extractInlineImageData(result);

    if (!imgData) throw new Error('No refined image returned from Gemini.');

    return `data:image/png;base64,${imgData}`;
  },

  /**
   * Calculates the Levenshtein distance between two strings.
   * @param a The first string.
   * @param b The second string.
   * @returns The Levenshtein distance.
   */
  getLevenshteinDistance(a: string, b: string): number {
    const an = a.length;
    const bn = b.length;

    if (an === 0) return bn;
    if (bn === 0) return an;

    const matrix: number[][] = [];

    // Initialize first row and column
    for (let i = 0; i <= an; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= bn; j++) {
      matrix[0][j] = j;
    }

    // Fill the matrix
    for (let i = 1; i <= an; i++) {
      for (let j = 1; j <= bn; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // Deletion
          matrix[i][j - 1] + 1,      // Insertion
          matrix[i - 1][j - 1] + cost // Substitution
        );
      }
    }

    return matrix[an][bn];
  },

  /**
   * Semantic scene intent parser using Gemini LLM (with rule-based fallback)
   */
  async analyzeSceneIntent(
    prompt: string, 
    apiKey: string | null | undefined,
    model: string = 'gemini-2.5-flash',
    options: SharedGenerationOptions = {}
  ): Promise<SceneIntent> {
    const p = prompt.toLowerCase();
    const words = p.replace(/[.,!?]/g, '').split(/\s+/);
    
    const intent: SceneIntent = {
      furniture: [],
      propContext: [],
      mustInclude: [],
      summary: prompt.trim()
    };

    if (!prompt.trim()) return intent;

    // Use dummy apiKey if hosted mode is active
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : apiKey;

    if (effectiveKey) {
      try {
        const strictPrompt = `
Analyze this scene description for a background plate generator.
Description: "${prompt}"

Extract the following details if present:
- location: The specific physical place or setting. Do NOT return null if a place is implied. If it's a compound noun like 'theme park', extract 'theme park'. If it's vague, describe the setting context (e.g. 'sky', 'space', 'abstract void').
- action: The implied activity (e.g., sitting, flying, reading, standing).
- furniture: Any necessary support furniture (e.g., bench, table, chair, couch, desk).
- propContext: Any necessary props (e.g., coffee, book, laptop).
- mood: The atmospheric vibe (optional).
- recommendedCamera: Infer the best camera framing for this action (e.g., 'Close-Up', 'Medium Full', 'Wide Angle', 'Establishing Shot'). Choose Medium Full or Wide if standing/walking, Close-Up or Medium if sitting/details.
- recommendedLighting: Infer the most natural cinematic lighting style (e.g., 'Cinematic Dark', 'Natural Window', 'Overcast', 'Golden Hour').

Return ONLY valid JSON without markdown formatting. Exact schema:
{
  "location": "string",
  "action": "string",
  "furniture": ["array of strings"],
  "propContext": ["array of strings"],
  "mood": "string",
  "recommendedCamera": "string",
  "recommendedLighting": "string"
}
`;
        const parsed = await this.analyzeMultiFrameJson<SceneIntent>(
          strictPrompt,
          effectiveKey,
          model,
          [],
          options
        );

        return {
          location: parsed.location || prompt.trim(), 
          action: parsed.action || undefined,
          furniture: Array.isArray(parsed.furniture) ? parsed.furniture : [],
          propContext: Array.isArray(parsed.propContext) ? parsed.propContext : [],
          mood: parsed.mood || undefined,
          recommendedCamera: parsed.recommendedCamera || undefined,
          recommendedLighting: parsed.recommendedLighting || undefined,
          mustInclude: [
            ...(parsed.location ? [parsed.location] : []),
            ...(parsed.action ? [parsed.action] : []),
            ...(Array.isArray(parsed.furniture) ? parsed.furniture : []),
            ...(Array.isArray(parsed.propContext) ? parsed.propContext : [])
          ],
          summary: prompt.trim()
        };
      } catch (e: unknown) {
        console.warn('LLM intent analysis failed, falling back to rule-based parser.', e);
      }
    }

    // Helper to check for exact or fuzzy match (allow 1 typo for words length > 3, 2 for > 5)
    // Also allows checking multi-word phrases exact match
    const hasMatch = (triggers: string[]) => {
        for (const t of triggers) {
            if (p.includes(t)) return true; // exact phrase match
            
            // fuzzy match single words
            if (!t.includes(' ')) {
                const maxDist = t.length > 5 ? 2 : (t.length > 3 ? 1 : 0);
                for (const w of words) {
                    if (Math.abs(w.length - t.length) <= maxDist) {
                        if (this.getLevenshteinDistance(w, t) <= maxDist) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    };

    // Hard Locations (with common typos)
    const locations = [
      { id: 'cafe', triggers: ['cafe', 'cfe', 'caffe', 'coffee shop', 'coffeeshop'] },
      { id: 'office', triggers: ['office', 'ofice', 'offce'] },
      { id: 'bedroom', triggers: ['bedroom', 'bed room'] },
      { id: 'park', triggers: ['park'] },
      { id: 'room', triggers: ['room'] },
      { id: 'street', triggers: ['street'] },
      { id: 'alley', triggers: ['alley'] },
      { id: 'tavern', triggers: ['tavern', 'bar', 'pub'] },
      { id: 'dungeon', triggers: ['dungeon'] },
      { id: 'kitchen', triggers: ['kitchen'] },
      { id: 'studio', triggers: ['studio'] }
    ];
    for (const loc of locations) {
      if (hasMatch(loc.triggers)) {
        intent.location = loc.id;
        intent.mustInclude!.push(loc.id);
        break; // take first primary location
      }
    }

    // Hard Actions
    const actions = [
      { id: 'sitting', triggers: ['sitting', 'sit', 'seated', 'sited', 'siting'] },
      { id: 'standing', triggers: ['standing', 'stand'] },
      { id: 'leaning', triggers: ['leaning', 'lean'] },
      { id: 'waiting', triggers: ['waiting', 'wait'] },
      { id: 'reading', triggers: ['reading', 'read'] },
      { id: 'sleeping', triggers: ['sleeping', 'sleep', 'asleep'] },
      { id: 'drinking', triggers: ['drinking', 'drink'] },
      { id: 'walking', triggers: ['walking', 'walk'] },
      { id: 'running', triggers: ['running', 'run'] }
    ];
    for (const act of actions) {
      if (hasMatch(act.triggers)) {
        intent.action = act.id;
        intent.mustInclude!.push(act.id);
        break; 
      }
    }

    // Hard Furniture / Support Context
    const furnitureTokens = [
      { id: 'bench', triggers: ['bench'] },
      { id: 'table', triggers: ['table', 'tabel'] },
      { id: 'bed', triggers: ['bed'] },
      { id: 'couch', triggers: ['couch', 'sofa'] },
      { id: 'desk', triggers: ['desk'] },
      { id: 'chair', triggers: ['chair', 'seat', 'stool'] }
    ];
    for (const f of furnitureTokens) {
      if (hasMatch(f.triggers)) {
        intent.furniture!.push(f.id);
        intent.mustInclude!.push(f.id);
      }
    }

    // Hard Props
    const propTokens = [
      { id: 'coffee', triggers: ['coffee', 'cofee', 'caffee', 'latte', 'espresso'] },
      { id: 'book', triggers: ['book'] },
      { id: 'laptop', triggers: ['laptop', 'computer', 'macbook'] },
      { id: 'phone', triggers: ['phone', 'cellphone', 'mobile'] },
      { id: 'window', triggers: ['window'] },
      { id: 'mug', triggers: ['mug', 'cup', 'glass'] }
    ];
    // Deduplicate props if they overlap with location
    for (const pr of propTokens) {
      if (hasMatch(pr.triggers)) {
        if (!intent.propContext!.includes(pr.id)) {
            intent.propContext!.push(pr.id);
            intent.mustInclude!.push(pr.id);
        }
      }
    }

    return intent;
  },

  async generateText(prompt: string, apiKey: string, options: Pick<SharedGenerationOptions, 'billingMode' | 'entitlements'> = {}): Promise<string> {
    if (options.billingMode === 'hosted') {
      await assertAuthenticatedForGeneration({ billingMode: 'hosted' });
    }
    if (!apiKey && options.billingMode !== 'hosted') throw new Error("No API Key provided.");
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : (apiKey || '');
    const useModel = 'gemini-2.5-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    if (options.billingMode === 'hosted') {
        const rawResultText = await GeminiService._executeHostedRequest(useModel, requestBody, { ...options, expectedResponseType: 'text' });
        if (rawResultText && rawResultText.startsWith('data:application/json')) {
            return decodeURIComponent(rawResultText.split(',')[1]);
        }
        return rawResultText;
    }

    const response = await fetch(`${baseUrl}?key=${effectiveKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = errText;
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
      throw new Error(`Gemini Text Error: ${cleanMsg}`);
    }

    const result = await response.json() as GeminiGenerateContentResult;
    const textOut = extractTextParts(result, '');
    if (!textOut) throw new Error("No text generated.");
    return textOut;
  },

  async generateJson<T>(prompt: string, apiKey: string, options: Pick<SharedGenerationOptions, 'billingMode' | 'entitlements'> = {}): Promise<T> {
    const strictPrompt = `${prompt}\n\nCRITICAL INSTRUCTION: Return ONLY valid JSON. No markdown formatting. No code fences. No commentary.`;

    let rawText = await this.generateText(strictPrompt, apiKey, options);

    const tryParse = (text: string) => {
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) throw new Error("No JSON object found.");
      return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)) as T;
    };

    try {
      return tryParse(rawText);
    } catch {
      console.warn("First JSON parse failed, attempting repair... Raw text was:", rawText);
      const repairPrompt = `The following text was supposed to be valid JSON but failed to parse. Please fix it and return ONLY valid JSON.\n\n${rawText}`;
      rawText = await this.generateText(repairPrompt, apiKey, options);
      try {
        return tryParse(rawText);
      } catch {
        throw new Error("Gemini failed to return valid JSON even after repair.");
      }
    }
  },

  async generateVeoFivePartDraft(concept: string, apiKey: string, optionalContext?: string, options: Pick<SharedGenerationOptions, 'billingMode' | 'entitlements'> = {}): Promise<VeoFivePartDraftResponse> {
    if (!apiKey && options.billingMode !== 'hosted') {
      console.warn("No API Key. Returning mocked Veo prompt.");
      await new Promise(r => setTimeout(r, 1000));
      return {
        cinematography: "A wide establishing shot, 4k resolution, cinematic lighting.",
        subject: "A highly detailed robot standing in a neon-lit alley.",
        action: "The robot slowly turns its head towards the camera.",
        context: "Rain is pouring down, reflecting neon signs.",
        styleAmbiance: "Cyberpunk aesthetic, moody, dystopian.",
        negativePrompt: "morphing, extra limbs, extra objects, unwanted props, text, watermarks, deformed faces",
        audio: {
          sfx: "heavy rain falling, distant siren"
        }
      };
    }

    const prompt = `
You are an expert AI video director crafting prompts for Veo 3.1.
Convert the following user concept into a highly structured 5-part prompt draft.

User concept: "${concept}"
${optionalContext ? `Additional context: "${optionalContext}"` : ''}

Output a JSON object exactly matching this structure:
{
  "cinematography": "Camera angle, movement, focal length, lighting style",
  "subject": "Detailed description of the main subject/characters",
  "action": "Specific movement and dynamics. IMPORTANT: If the camera pans away and returns, explicitly state that the prop remains identical to enforce object permanence.",
  "context": "Background, environment, and setting elements",
  "styleAmbiance": "Overall visual style, mood, color palette, rendering engine details",
  "negativePrompt": "MANDATORY: A heavy, comma-separated list of extreme negative constraints to strictly prevent: morphing, changing props into different objects, mutating subjects, unwanted extra props, extra limbs, bad anatomy, deformed hands, missing hands, or style drift. CRITICAL: Include 'prop substitution, loss of object permanence, hallucinating new props'. Be very aggressive.",
  "audio": {
    "dialogue": "Spoken dialogue if requested",
    "sfx": "Sound effects if requested",
    "ambience": "Background audio ambience if requested",
    "music": "Musical style/cues if requested"
  }
}
Note: Leave audio fields out if not applicable. The core 5 parts are required.
`;

    return await this.generateJson<VeoFivePartDraftResponse>(prompt, apiKey, options);
  },

  /**
   * Layout-driven composite generator (Director Canvas Phase 2)
   */
  async generateCompositeFromLayout(args: {
    apiKey: string;
    model: string;
    aspectRatio?: string;
    imageSize?: '1K' | '2K' | '4K';
    backgroundUrl?: string;
    blueprintUrl?: string | null;
    protectionMaskUrl?: string | null;
    elements: Array<{
      id: string;
      url: string;
      label: string;
      type: 'actor' | 'prop';
      preserveIdentity?: boolean;
      preserveWardrobe?: boolean;
      groundingMode?: string;
      notes?: string;
    }>;
    actorIdentitySets?: ActorIdentityReferenceSet[];
    instructions: string;
    poseCoherenceAttempt?: number;
  }): Promise<string> {
    const { apiKey, model, aspectRatio, imageSize, backgroundUrl, blueprintUrl, protectionMaskUrl, elements, actorIdentitySets, instructions } = args;

    if (!apiKey) {
      console.warn("No API Key. Returning mock composite.");
      await new Promise(r => setTimeout(r, 1500));
      return `https://placehold.co/1024x576/1a1a1a/FFF?text=Mock+Composite:+${elements.length}+Elements`;
    }

    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const contentsParts: GeminiPart[] = [];
    const compositePrompt = shouldApplyPoseCoherence(instructions, elements.map((element) => element.label))
      ? withPoseCoherenceContract(instructions, {
        strictness: 'scene',
        subjectScope: 'visible_body',
        stanceType: 'anchor_preserved',
        footingMode: 'anchor_preserved'
      })
      : instructions;

    // 1. Text Instructions
    contentsParts.push({ text: compositePrompt });

    // 2. Base Background
    if (backgroundUrl) {
      contentsParts.push({ text: `[BACKGROUND PLATE]` });
      const bg = await GeminiService._resolveImageData(backgroundUrl);
      contentsParts.push({ inlineData: { mimeType: bg.mimeType, data: bg.data } });
    }

    // 3. Layout Blueprint
    if (blueprintUrl) {
      contentsParts.push({ text: `[LAYOUT BLUEPRINT]` });
      const bp = await GeminiService._resolveImageData(blueprintUrl);
      contentsParts.push({ inlineData: { mimeType: bp.mimeType, data: bp.data } });
    }

    // 4. Elements in z-order
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el.url) continue;
      
      const identityText = el.preserveIdentity ? ' (PRESERVE IDENTITY)' : '';
      const wardrobeText = el.preserveWardrobe ? ' (PRESERVE WARDROBE)' : '';
      
      contentsParts.push({ text: `[ELEMENT ${i + 1}: ${el.label}] Type: ${el.type}${identityText}${wardrobeText}` });
      const elData = await GeminiService._resolveImageData(el.url);
      contentsParts.push({ inlineData: { mimeType: elData.mimeType, data: elData.data } });
    }

    // 5. Protection Mask
    if (protectionMaskUrl) {
      contentsParts.push({ text: `[PROTECTION MASK] (White = Editable, Black = Protected)` });
      const mask = await GeminiService._resolveImageData(protectionMaskUrl);
      contentsParts.push({ inlineData: { mimeType: mask.mimeType, data: mask.data } });
    }

    // 6. Actor References (Face Fidelity Identity Anchors)
    if (actorIdentitySets && actorIdentitySets.length > 0) {
      for (const set of actorIdentitySets) {
        if (!hasStrongFaceAnchor(set)) {
           console.warn(`[IdentityLock] Missing face anchor for generation request`, { actorId: set.actorId, path: 'composite-from-layout' });
        }
        const orderedUrls = buildOrderedActorIdentityInputs(set);
        for (let i = 0; i < orderedUrls.length; i++) {
           const refData = await GeminiService._resolveImageData(orderedUrls[i]);
           contentsParts.push({ inlineData: { mimeType: refData.mimeType, data: refData.data } });
        }
      }
    }

    // Force strict structure behavior and Google grounding disabled for tight compositing
    const generationConfig: {
      responseModalities: string[];
      candidateCount: number;
      imageConfig: { aspectRatio: string; imageSize?: '1K' | '2K' | '4K' };
      thinkingConfig?: ThinkingConfig;
    } = {
      responseModalities: ["IMAGE"],
      candidateCount: 1,
      imageConfig: {
        aspectRatio: aspectRatio || "16:9",
        ...(imageSize && { imageSize })
      },
       // High thinking helps Gemini organize strict layouts better
      thinkingConfig: GeminiService._buildThinkingConfigForModel(model, "high")
    };

    let response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: contentsParts }],
        generationConfig
      })
    });

    if (!response.ok) {
       let errText = await response.text();
       let cleanMsg = errText;
       try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch {}

       // Fallback without thinking config if model rejects it
       const thinkingRejected = response.status === 400 && /thinking level/i.test(cleanMsg) && generationConfig.thinkingConfig;
       
       if (thinkingRejected) {
         delete generationConfig.thinkingConfig;
         response = await fetch(`${baseUrl}?key=${apiKey}`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ contents: [{ parts: contentsParts }], generationConfig })
         });
         
         if (!response.ok) {
            errText = await response.text();
            cleanMsg = errText;
            try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch {}
            throw new Error(`Composite Generation Error (Retry): ${cleanMsg}`);
         }
       } else {
         throw new Error(`Composite Generation Error: ${cleanMsg}`);
       }
    }

    const result = await response.json() as GeminiGenerateContentResult;
    const imgData = extractInlineImageData(result);
    
    if (!imgData) throw new Error("No image returned from generation.");
    
    return await GeminiService._validatePoseCoherenceAndRetryCustom({
      imageUrl: `data:image/png;base64,${imgData}`,
      rawPrompt: instructions,
      effectivePrompt: compositePrompt,
      apiKey,
      model,
      referenceLabels: elements.map((element) => element.label),
      intent: {
        strictness: 'scene',
        subjectScope: 'visible_body',
        stanceType: 'anchor_preserved',
        footingMode: 'anchor_preserved',
        twistAllowed: false,
        twistIntensity: 0
      },
      options: {
        _poseCoherenceRetryAttempt: args.poseCoherenceAttempt ?? 0,
        poseCoherence: {
          enabled: true,
          validate: true,
          retry: true,
          intent: {
            strictness: 'scene',
            subjectScope: 'visible_body',
            stanceType: 'anchor_preserved',
            footingMode: 'anchor_preserved',
            twistAllowed: false,
            twistIntensity: 0
          }
        }
      },
      retry: (retryPrompt) => GeminiService.generateCompositeFromLayout({
        ...args,
        instructions: retryPrompt,
        poseCoherenceAttempt: (args.poseCoherenceAttempt ?? 0) + 1
      })
    });
  },

  /**
   * Generates a preview shot variation
   */
  async generateShotPreview(args: {
    anchorImageUrl: string;
    shotBlueprintUrl?: string;
    actorIdentitySets?: ActorIdentityReferenceSet[];
    prompt: string;
    aspectRatio?: string;
    apiKey: string;
    model: string;
    sceneTruth?: import('../types/shots').SceneTruthSnapshot;
    presetId?: string;
    hasSubjectStyleAnalysis?: boolean;
    options?: SharedGenerationOptions;
  }): Promise<string> {
    const { anchorImageUrl, shotBlueprintUrl, actorIdentitySets = [], prompt, aspectRatio, apiKey, model, sceneTruth, presetId, hasSubjectStyleAnalysis } = args;
    if (args.options?.billingMode === 'hosted') {
      await assertAuthenticatedForGeneration({ billingMode: 'hosted' });
    }
    const shotPoseIntent: PoseCoherenceIntent = {
      strictness: 'scene',
      subjectScope: 'visible_body',
      stanceType: 'anchor_preserved',
      footingMode: 'anchor_preserved',
      twistAllowed: false,
      twistIntensity: 0
    };
    const shotPrompt = shouldApplyPoseCoherence(prompt, actorIdentitySets.map((set) => set.actorId))
      ? withPoseCoherenceContract(prompt, shotPoseIntent)
      : prompt;
    
    if (import.meta.env.DEV && sceneTruth) {
      console.log(`[GeminiService:generateShotPreview] Metadata Dump:`, {
         actorCount: sceneTruth.expectedActorCount,
         orderedActors: sceneTruth.actors.slice().sort((a,b)=> a.leftToRightIndex - b.leftToRightIndex).map(a => a.actorLabel),
         presetId,
         cameraConstraints: sceneTruth.cameraConstraints,
         styleAnalysisDemoted: hasSubjectStyleAnalysis === false
      });
    }
    
    if (args.options?.billingMode !== 'hosted' && !apiKey) throw new Error("No API Key provided for shot generation");
    
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const parts: GeminiPart[] = [];
    
    // 1. Primary scene anchor (MUST BE FIRST)
    const anchor = await GeminiService._resolveImageData(anchorImageUrl);
    parts.push({ text: `[AUTHORITATIVE SCENE AND LAYOUT ANCHOR]` });
    parts.push({ inlineData: { mimeType: anchor.mimeType, data: anchor.data } });
    parts.push({
      text:
        `[HARD ENVIRONMENT LOCK: Keep the exact same location, architecture, and environmental context from the anchor image. ` +
        `Do not relocate to a different setting. Do not switch indoor/outdoor. Do not change time-of-day/weather/era.]`
    });

    // 2. Camera Instruction Blueprint (MUST BE SECOND)
    if (shotBlueprintUrl) {
        const blueprint = await GeminiService._resolveImageData(shotBlueprintUrl);
        parts.push({ text: `[CAMERA INSTRUCTION BLUEPRINT: Adhere to the teal framing guide, printed camera designation labels, direction arrows, and occlusion overlays. The final image must visibly satisfy that camera designation.]` });
        parts.push({ inlineData: { mimeType: blueprint.mimeType, data: blueprint.data } });
    }
    
    // 3. Supplemental identity anchors (MUST BE THIRD)
    for (const set of actorIdentitySets) {
        if (!hasStrongFaceAnchor(set)) {
            console.warn(`[IdentityLock] Missing face anchor for generation request`, { actorId: set.actorId, path: 'shots-preview' });
        }
        let orderedUrls = buildOrderedActorIdentityInputs(set);
        
        // Hard cap: aggressively limit actor references if hosted to avoid 502 oversized payload errors
        if (args.options?.billingMode === 'hosted') {
            orderedUrls = orderedUrls.slice(0, 1);
        }

        for (let i = 0; i < orderedUrls.length; i++) {
            const ref = await GeminiService._resolveImageData(orderedUrls[i]);
            parts.push({ text: `[ACTOR REFERENCE ${i + 1}]` });
            parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
        }
    }
    
    // Shot Prompt
    parts.push({ text: shotPrompt });
    
    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        candidateCount: 1,
        imageConfig: {
          aspectRatio: aspectRatio || "16:9",
          imageSize: "1K" // preview quality
        }
      }
    };
    
    if (args.options?.billingMode === 'hosted') {
        const serialized = JSON.stringify(payload);
        console.log("[generateShotPreview] payload bytes =", new Blob([serialized]).size);

        const hostedArgs = { ...args.options };
        if (!hostedArgs.expectedResponseType) hostedArgs.expectedResponseType = 'image';
        const hostedImageUrl = await GeminiService._executeHostedRequest(model, payload, hostedArgs);
        return await GeminiService._validatePoseCoherenceAndRetryCustom({
          imageUrl: hostedImageUrl,
          rawPrompt: prompt,
          effectivePrompt: shotPrompt,
          apiKey,
          model,
          referenceLabels: actorIdentitySets.map((set) => set.actorId),
          options: hostedArgs,
          intent: shotPoseIntent,
          retry: (retryPrompt, nextOptions) => GeminiService.generateShotPreview({
            ...args,
            prompt: retryPrompt,
            options: nextOptions
          })
        });
    }
    
    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: args.options?.signal
    });
    
    if (!response.ok) {
      const err = await response.text();
      let cleanMsg = err;
      try { cleanMsg = JSON.parse(err).error?.message || cleanMsg; } catch {}
      throw new Error(`Shot Preview Generation Error: ${cleanMsg}`);
    }
    
    const result = await response.json() as GeminiGenerateContentResult;
    const data = extractInlineImageData(result);
    if (!data) throw new Error("No image data in shot preview response.");
    
    return await GeminiService._validatePoseCoherenceAndRetryCustom({
      imageUrl: `data:image/png;base64,${data}`,
      rawPrompt: prompt,
      effectivePrompt: shotPrompt,
      apiKey,
      model,
      referenceLabels: actorIdentitySets.map((set) => set.actorId),
      options: args.options,
      intent: shotPoseIntent,
      retry: (retryPrompt, nextOptions) => GeminiService.generateShotPreview({
        ...args,
        prompt: retryPrompt,
        options: nextOptions
      })
    });
  },

  /**
   * Re-renders a selected shot variation at final quality (4K)
   */
  async rerenderShotFinal(args: {
    sourceResultUrl: string;
    selectedShotPreviewUrl: string;
    actorIdentitySets?: ActorIdentityReferenceSet[];
    prompt: string;
    aspectRatio?: string;
    apiKey: string;
    model: string;
    sceneTruth?: import('../types/shots').SceneTruthSnapshot;
    presetId?: string;
    options?: SharedGenerationOptions;
  }): Promise<string> {
    const { sourceResultUrl, selectedShotPreviewUrl, actorIdentitySets = [], prompt, aspectRatio, apiKey, model, sceneTruth, presetId, options } = args;
    if (options?.billingMode === 'hosted') {
      await assertAuthenticatedForGeneration({ billingMode: 'hosted' });
    }
    const finalShotPoseIntent: PoseCoherenceIntent = {
      strictness: 'scene',
      subjectScope: 'visible_body',
      stanceType: 'anchor_preserved',
      footingMode: 'anchor_preserved',
      twistAllowed: false,
      twistIntensity: 0
    };
    const finalShotPrompt = shouldApplyPoseCoherence(prompt, actorIdentitySets.map((set) => set.actorId))
      ? withPoseCoherenceContract(prompt, finalShotPoseIntent)
      : prompt;
    
    if (import.meta.env.DEV && sceneTruth) {
      console.log(`[GeminiService:rerenderShotFinal] Metadata Dump:`, {
         actorCount: sceneTruth.expectedActorCount,
         orderedActors: sceneTruth.actors.slice().sort((a,b)=> a.leftToRightIndex - b.leftToRightIndex).map(a => a.actorLabel),
         presetId,
         cameraConstraints: sceneTruth.cameraConstraints
      });
    }
    
    if (options?.billingMode !== 'hosted' && !apiKey) throw new Error("No API Key provided for shot generation");
    
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const parts: GeminiPart[] = [];
    
    // 1. Supplemental identity anchors
    for (const set of actorIdentitySets) {
        if (!hasStrongFaceAnchor(set)) {
            console.warn(`[IdentityLock] Missing face anchor for generation request`, { actorId: set.actorId, path: 'shots-final' });
        }
        const orderedUrls = buildOrderedActorIdentityInputs(set);
        for (let i = 0; i < orderedUrls.length; i++) {
            const ref = await GeminiService._resolveImageData(orderedUrls[i]);
            parts.push({ text: `[ACTOR REFERENCE ${i + 1}]` });
            parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
        }
    }
    
    // 2. Primary framing anchor (the selected preview shot)
    const previewAnchor = await GeminiService._resolveImageData(selectedShotPreviewUrl);
    parts.push({ text: `[COMPOSITION ANCHOR - MATCH FRAMING AND PERSPECTIVE ONLY]` });
    parts.push({ inlineData: { mimeType: previewAnchor.mimeType, data: previewAnchor.data } });

    // 3. Supporting scene anchor (the original staged result)
    const sceneAnchor = await GeminiService._resolveImageData(sourceResultUrl);
    parts.push({ text: `[AUTHORITATIVE SCENE AND LAYOUT TRUTH ANCHOR - PRESERVE EXACT ROOM AND ACTOR COUNT]` });
    parts.push({ inlineData: { mimeType: sceneAnchor.mimeType, data: sceneAnchor.data } });
    parts.push({
      text:
        `[HARD ENVIRONMENT LOCK: Preserve the exact source environment from the staged anchor. ` +
        `No relocation, no indoor/outdoor conversion, no time-of-day/weather/era drift.]`
    });
    
    // Shot Prompt
    parts.push({ text: finalShotPrompt });
    
    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        candidateCount: 1,
        imageConfig: {
          aspectRatio: aspectRatio || "16:9",
          imageSize: "4K" // final quality target
        }
      }
    };
    
    if (options?.billingMode === 'hosted') {
        const hostedArgs = { ...options };
        if (!hostedArgs.expectedResponseType) hostedArgs.expectedResponseType = 'image';
        const hostedImageUrl = await GeminiService._executeHostedRequest(model, payload, hostedArgs);
        return await GeminiService._validatePoseCoherenceAndRetryCustom({
          imageUrl: hostedImageUrl,
          rawPrompt: prompt,
          effectivePrompt: finalShotPrompt,
          apiKey,
          model,
          referenceLabels: actorIdentitySets.map((set) => set.actorId),
          options: hostedArgs,
          intent: finalShotPoseIntent,
          retry: (retryPrompt, nextOptions) => GeminiService.rerenderShotFinal({
            ...args,
            prompt: retryPrompt,
            options: nextOptions
          })
        });
    }
    
    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: options?.signal
    });
    
    if (!response.ok) {
      const err = await response.text();
      let cleanMsg = err;
      try { cleanMsg = JSON.parse(err).error?.message || cleanMsg; } catch {}
      throw new Error(`Shot Final Rerender Error: ${cleanMsg}`);
    }
    
    const result = await response.json() as GeminiGenerateContentResult;
    const data = extractInlineImageData(result);
    if (!data) throw new Error("No image data in shot final response.");
    
    return await GeminiService._validatePoseCoherenceAndRetryCustom({
      imageUrl: `data:image/png;base64,${data}`,
      rawPrompt: prompt,
      effectivePrompt: finalShotPrompt,
      apiKey,
      model,
      referenceLabels: actorIdentitySets.map((set) => set.actorId),
      options,
      intent: finalShotPoseIntent,
      retry: (retryPrompt, nextOptions) => GeminiService.rerenderShotFinal({
        ...args,
        prompt: retryPrompt,
        options: nextOptions
      })
    });
  }

};
