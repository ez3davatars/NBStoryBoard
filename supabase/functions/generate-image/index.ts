// @ts-nocheck
// Disables IDE Node.js compiler errors for Deno-specific globals (Deno, https imports)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
};

const withTimeout = (promise: Promise<any>, ms: number, name: string) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`DIAGNOSTIC HANG DETECTED: [${name}] timed out after ${ms}ms`)), ms))
    ]);
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

  let job: any = null;
  let supabaseService: any = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    // Auth-derived client ONLY for auth.getUser()
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const jwt = authHeader.replace(/^Bearer /i, '').trim();
    const { data: userData, error: userError } = await withTimeout(supabaseAuth.auth.getUser(jwt), 5000, "auth.getUser");
    
    if (userError || !userData?.user) {
      const debugInfo = {
        has_supabase_url: !!Deno.env.get('SUPABASE_URL'),
        has_anon_key: !!Deno.env.get('SUPABASE_ANON_KEY'),
        url_preview: Deno.env.get('SUPABASE_URL')?.substring(0, 30),
        auth_header_preview: authHeader.substring(0, 25) + '...',
        jwt_segments: authHeader.replace(/^Bearer /i, '').split('.').length,
        userError_message: userError?.message || "User data missing"
      };
      console.log("[AUTH DEBUG]:", debugInfo);
      throw new Error(`Unauthorized. Debug: ${JSON.stringify(debugInfo)}`);
    }

    // Service-role client for billing RPCs (Phase 1 security model)
    supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payloadRaw = await withTimeout(req.json(), 3000, "req.json");
    const { payload, options, executionFingerprint } = payloadRaw;
    
    const idempotencyKey = req.headers.get('x-idempotency-key');
    if (!idempotencyKey) throw new Error("Missing X-Idempotency-Key header");

    const userId = userData.user.id;

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
    let job = jobData;

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

  } catch (err: any) {
    console.error("Generate Image Orchestration Error:", err.message);
    
    let status = 400;
    if (err.message?.includes('Unauthorized')) status = 403;

    // fail_generation relies on generation payload isolation
    return new Response(JSON.stringify({ error: err.message, code: 'INTERNAL_ERROR' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });
  }
});
