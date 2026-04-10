import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('[CleanupCron] FATAL: Missing essential environment credentials. Cleanup worker standing down.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
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
      .eq('asset_persistence', 'temporary')
      .not('asset_storage_path', 'is', null)
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

    console.log(`[CleanupWorker] Found ${expiredJobs.length} expired rows to process.`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const job of expiredJobs) {
      if (job.asset_storage_path) {
        try {
          await r2.send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: job.asset_storage_path,
            })
          );
          console.log(`[CleanupWorker] R2 Deleted successfully: ${job.asset_storage_path}`);
        } catch (s3Err: any) {
          console.error(`[CleanupWorker] Failed R2 deletion for ${job.asset_storage_path}:`, s3Err.message);
          failCount++;
          continue; // Skip DB update if delete failed so we can retry later safely
        }
      } else {
        console.log(`[CleanupWorker] Skipped row ${job.id} - missing asset_storage_path`);
        skippedCount++;
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
         console.error(`[CleanupWorker] Failed DB expiration update for ${job.id}:`, updateErr.message);
         failCount++;
      } else {
         console.log(`[CleanupWorker] Successful DB expiration update. ${job.id} marked as EXPIRED.`);
         successCount++;
      }
    }
    
    console.log(`[CleanupWorker] Pass complete. Success/DB Nullified: ${successCount}. R2/DB Fails: ${failCount}. Skipped: ${skippedCount}.`);
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
