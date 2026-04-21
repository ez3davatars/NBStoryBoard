import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { DeleteObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.1024.0";

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CLEANUP_INVOCATION_SECRET = Deno.env.get('CLEANUP_INVOCATION_SECRET');

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

serve(async (req) => {
  try {
    // Basic service-role enforcement
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401 });
    }
    const token = authHeader.replace(/^Bearer /i, '').trim();
    if (!CLEANUP_INVOCATION_SECRET || token !== CLEANUP_INVOCATION_SECRET) {
      console.error('[CleanupEdge] Invalid or missing CLEANUP_INVOCATION_SECRET');
      return new Response("Forbidden", { status: 403 });
    }

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing edge environment variables" }), { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    console.log('[CleanupEdge] Booting expired assets cleanup pass...');

    const { data: expiredJobs, error: fetchErr } = await supabase
      .from('generations')
      .select('id, asset_storage_path')
      .eq('status', 'COMPLETED')
      .eq('asset_persistence', 'temporary')
      .not('asset_storage_path', 'is', null)
      .lt('asset_expires_at', new Date().toISOString())
      .limit(100);

    if (fetchErr) {
       console.error('[CleanupEdge] DB Fetch error:', fetchErr.message);
       return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
    }

    if (!expiredJobs || expiredJobs.length === 0) {
      console.log('[CleanupEdge] No expired assets found in this pass.');
      return new Response(JSON.stringify({ message: "No expired assets", count: 0 }), { status: 200 });
    }

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const job of expiredJobs) {
      if (!job.asset_storage_path) {
        skippedCount++;
        continue;
      }

      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: job.asset_storage_path,
          })
        );
      } catch (s3Err: unknown) {
        console.error(`[CleanupEdge] Failed R2 deletion for ${job.asset_storage_path}:`, getErrorMessage(s3Err));
        failCount++;
        continue; // Leave the row intact so it gets picked up on retry
      }

      const { error: updateErr } = await supabase
        .from('generations')
        .update({
          status: 'EXPIRED',
          asset_url: null,
          asset_storage_path: null
        })
        .eq('id', job.id);

      if (updateErr) {
         console.error(`[CleanupEdge] Failed DB expiration update for ${job.id}:`, updateErr.message);
         failCount++;
      } else {
         successCount++;
      }
    }

    const metrics = { found: expiredJobs.length, success: successCount, failed: failCount, skipped: skippedCount };
    console.log(`[CleanupEdge] Run metrics:`, metrics);

    return new Response(JSON.stringify(metrics), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
    });

  } catch (err: unknown) {
    const message = getErrorMessage(err);
    console.error("Cleanup Run Error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
