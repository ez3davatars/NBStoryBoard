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
  };
  executionFingerprint?: string;
  options?: unknown;
};

const withTimeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`DIAGNOSTIC HANG DETECTED: [${name}] timed out after ${ms}ms`)), ms))
    ]) as Promise<T>;
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
    const { payload, executionFingerprint } = (payloadRaw ?? {}) as GenerateImageRequestBody;
    if (!payload?.model || !executionFingerprint) {
      throw new Error("Invalid request payload: missing payload.model or executionFingerprint");
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
            p_cost: 1,
            p_is_byok: false,
            p_provider: 'gemini',
            p_provider_model: payload.model
        }),
        10000, "start_generation_rpc"
    );

    if (startErr) throw new Error(`start_generation failed: ${startErr.message}`);
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
    if (errMessage.includes('Unauthorized') || errMessage.includes('Missing Authorization header')) {
      status = 401;
      publicMessage = 'Unauthorized';
    } else if (errMessage.includes('Idempotency')) {
      status = 409;
      publicMessage = errMessage;
    } else if (
      errMessage.includes('Missing X-Idempotency-Key header') ||
      errMessage.startsWith('Invalid request payload')
    ) {
      status = 400;
      publicMessage = errMessage;
    } else if (errMessage.includes('req.json')) {
      status = 400;
      publicMessage = 'Invalid request body';
    }

    // fail_generation relies on generation payload isolation
    return new Response(JSON.stringify({ error: publicMessage, code: 'INTERNAL_ERROR' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });
  }
});
