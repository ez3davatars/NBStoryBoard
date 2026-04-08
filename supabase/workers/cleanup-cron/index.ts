import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wtgkeytabshxtspjoegb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_12qAUYx1gzluIF0kxQqPNw_zMGtwwVr';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '6c36be70912cdcabc7b26eb790314e2c';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '2285c183d3af0f4c3a30e9636c5c7562';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '12befab0e645e9becb47bffdefc32b399b1671c5922d8efb43c2ed8f28ad2b53';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'cd-generations';

if (!SUPABASE_SERVICE_ROLE_KEY || !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('FATAL: Missing essential credentials. Cleanup worker standing down.');
  process.exit(1);
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

async function runCleanup() {
  console.log('[CleanupWorker] Starting expired assets cleanup pass...');
  try {
    const { data: expiredJobs, error: fetchErr } = await supabase
      .from('generations')
      .select('id, asset_storage_path')
      .eq('status', 'COMPLETED')
      .lt('asset_expires_at', new Date().toISOString())
      .limit(50); // Batch limit

    if (fetchErr) {
      console.error('[CleanupWorker] DB Fetch error:', fetchErr.message);
      return;
    }

    if (!expiredJobs || expiredJobs.length === 0) {
      console.log('[CleanupWorker] No expired assets found in this pass.');
      return;
    }

    console.log(`[CleanupWorker] Found ${expiredJobs.length} expired assets to process.`);

    for (const job of expiredJobs) {
      if (job.asset_storage_path) {
        try {
          await r2.send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: job.asset_storage_path,
            })
          );
          console.log(`[CleanupWorker] R2 Deleted: ${job.asset_storage_path}`);
        } catch (s3Err: any) {
          console.error(`[CleanupWorker] Failed to delete ${job.asset_storage_path} from R2:`, s3Err.message);
          continue; // Skip DB update if delete failed so we can retry later safely
        }
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
         console.error(`[CleanupWorker] Failed to update DB status for ${job.id}:`, updateErr.message);
      } else {
         console.log(`[CleanupWorker] Generation ${job.id} marked as EXPIRED.`);
      }
    }
  } catch (err: any) {
    console.error('[CleanupWorker] Error during cleanup pass:', err.message);
  } finally {
    // Re-schedule based on load or a fixed interval
    setTimeout(runCleanup, 60 * 1000 * 15); // Check every 15 minutes
  }
}

// Start cron
console.log('[CleanupWorker] Booted.');
runCleanup();
