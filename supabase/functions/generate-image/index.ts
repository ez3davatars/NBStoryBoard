import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
};

const withTimeout = async <T>(promise: PromiseLike<T>, ms: number, name: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`DIAGNOSTIC HANG DETECTED: [${name}] timed out after ${ms}ms`)), ms))
    ]) as Promise<T>;
};

type GenerationJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | string;

type GenerationJob = {
  id: string;
  status: GenerationJobStatus;
  request_fingerprint: string;
  asset_url?: string | null;
};

type RpcResponse<T> = {
  data: T;
  error: { message: string } | null;
};

type GenerateImageRequest = {
  payload: {
    model: string;
    requestBody: unknown;
  };
  executionFingerprint: string;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const getErrorStack = (error: unknown): string | null => {
  if (error instanceof Error && error.stack) return error.stack;
  return null;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    const requestedHeaders = req.headers.get('Access-Control-Request-Headers');
    return new Response('ok', { 
        headers: {
            ...corsHeaders,
            'Access-Control-Allow-Headers': requestedHeaders || corsHeaders['Access-Control-Allow-Headers']
        } 
    });
  }

  let job: GenerationJob | null = null;

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
      const debugInfo = {
        has_supabase_url: !!supabaseUrl,
        has_anon_key: !!supabaseAnonKey,
        has_secret_key: !!Deno.env.get('SUPABASE_SECRET_KEY'),
        has_service_role_key: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        url_preview: supabaseUrl.substring(0, 30),
        auth_header_preview: authHeader.substring(0, 25) + '...',
        jwt_segments: jwt.split('.').length,
        userError_message: userError?.message || "User data missing"
      };
      console.log("[AUTH DEBUG]:", debugInfo);
      throw new Error(`Unauthorized. Debug: ${JSON.stringify(debugInfo)}`);
    }

    // Service client ONLY
    const supabaseService = createClient(supabaseUrl, supabaseServerKey);
    
    const userId = userData.user.id;

    const payloadRaw = await withTimeout(req.json(), 15000, "req.json");
    const { payload, executionFingerprint } = payloadRaw as GenerateImageRequest;
    
    const idempotencyKey = req.headers.get('x-idempotency-key');
    if (!idempotencyKey) throw new Error("Missing X-Idempotency-Key header");

    // 1. Transaction Lock / Ownership Handshake
    const startGenerationPromise = supabaseService.rpc('start_generation', {
            p_user_id: userId,
            p_request_idempotency_key: idempotencyKey,
            p_request_fingerprint: executionFingerprint,
            p_generation_type: 'image',
            p_cost: 1,
            p_is_byok: false,
            p_provider: 'gemini',
            p_provider_model: payload.model
        }) as unknown as Promise<RpcResponse<GenerationJob>>;

    const { data: jobData, error: startErr } = await withTimeout(
      startGenerationPromise,
      10000,
      "start_generation_rpc"
    );

    if (startErr) throw new Error(`start_generation failed: ${startErr.message}`);
    job = jobData as GenerationJob;

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

    // 4. Return instant HTTP 202 
    return new Response(JSON.stringify({ generationId: job.id, status: 'PENDING', acceptedAt: Date.now() }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: unknown) {
    const message = getErrorMessage(err);
    const stack = getErrorStack(err);
    console.error("Generate Image Orchestration Error:", message, stack);
    
    let status = 400;
    if (message.includes('Unauthorized')) status = 401;
    if (message.includes('Idempotency')) status = 409;
    if (message.includes('Missing X-Idempotency-Key header')) status = 400;
    if (message.includes('req.json')) status = 400; // Json parse timeouts/errors

    // fail_generation relies on generation payload isolation
    return new Response(JSON.stringify({ error: message, code: 'INTERNAL_ERROR', stack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });
  }
});
