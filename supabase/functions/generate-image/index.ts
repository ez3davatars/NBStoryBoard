import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

const CREDIT_PRICING_VERSION = '1-2-6';

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

const withTimeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`DIAGNOSTIC HANG DETECTED: [${name}] timed out after ${ms}ms`)), ms))
    ]) as Promise<T>;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
    
    const userId = userData.user.id;

    const payloadRaw = await withTimeout(req.json() as Promise<unknown>, 15000, "req.json");
    const requestBody = (payloadRaw ?? {}) as GenerateImageRequestBody;
    const { payload, executionFingerprint } = requestBody;
    if (!payload?.model || !executionFingerprint) {
      throw new Error("Invalid request payload: missing payload.model or executionFingerprint");
    }

    const creditMetadata = readHostedCreditMetadata(requestBody);

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

    if (currentCredits < creditMetadata.requiredCredits) {
      throw new HttpError(
        402,
        'INSUFFICIENT_CREDITS',
        `Insufficient hosted credits: this render needs ${creditMetadata.requiredCredits}, current balance is ${currentCredits}.`
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
            p_provider_model: payload.model
        }),
        10000, "start_generation_rpc"
    );

    if (startErr) {
      if (/insufficient|credit/i.test(startErr.message)) {
        throw new HttpError(402, 'INSUFFICIENT_CREDITS', `start_generation rejected hosted credits: ${startErr.message}`);
      }
      throw new Error(`start_generation failed: ${startErr.message}`);
    }
    const job = jobData as GenerationJob | null;
    if (!job) throw new Error("start_generation returned no job");

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

    // 3. Persist the Exact Generative Payload Request to the DB Queue (Required for Background Delegate)
    const { error: payloadErr } = await supabaseService
        .from('generations')
        .update({ 
             request_payload: payload.requestBody,
             provider_model: payload.model
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

    // 4. Return instant HTTP 202 
    return new Response(JSON.stringify({ generationId: job.id, status: 'PENDING', acceptedAt: Date.now() }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    console.error("Generate Image Orchestration Error:", errMessage, errStack);
    
    let status = 500;
    let publicMessage = 'Generation request failed';
    let code = 'INTERNAL_ERROR';
    if (err instanceof HttpError) {
      status = err.status;
      publicMessage = err.message;
      code = err.code;
    } else if (errMessage.includes('Unauthorized') || errMessage.includes('Missing Authorization header')) {
      status = 401;
      publicMessage = 'Unauthorized';
      code = 'UNAUTHORIZED';
    } else if (errMessage.includes('Idempotency')) {
      status = 409;
      publicMessage = errMessage;
      code = 'IDEMPOTENCY_CONFLICT';
    } else if (
      errMessage.includes('Missing X-Idempotency-Key header') ||
      errMessage.startsWith('Invalid request payload')
    ) {
      status = 400;
      publicMessage = errMessage;
      code = 'INVALID_REQUEST';
    } else if (errMessage.includes('req.json')) {
      status = 400;
      publicMessage = 'Invalid request body';
      code = 'INVALID_JSON';
    }

    // fail_generation relies on generation payload isolation
    return new Response(JSON.stringify({ error: publicMessage, code }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });
  }
});
