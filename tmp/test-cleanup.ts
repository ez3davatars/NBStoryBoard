import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL! || process.env.SUPABASE_URL!;
process.env.SUPABASE_URL = SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function runTest() {
  const { data: jobs } = await supabase.from('generations').select('id, asset_storage_path').eq('status', 'COMPLETED').not('asset_storage_path', 'is', null).limit(1);
  if (!jobs || jobs.length === 0) {
    console.log('No existing completed jobs with storage path to mock. Skipping DB prep.');
    process.exit(1);
  }

  const testId = jobs[0].id;
  const testKey = jobs[0].asset_storage_path;

  console.log('--- TEST PREPARATION ---');
  console.log(`[TEST] Using existing DB row: ${testId}`);
  console.log(`[TEST] Creating dummy file in R2 at its path: ${testKey} to simulate an existing active asset...`);
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: testKey,
      Body: Buffer.from('test-image-data-stub'),
      ContentType: 'image/png',
    })
  );

  console.log(`[TEST] Updating DB row to 'expired'...`);
  const offsetExpiresAt = new Date(Date.now() - 1000).toISOString(); // Expired 1 second ago
  const { error: updateErr } = await supabase.from('generations').update({
    asset_persistence: 'temporary',
    asset_expires_at: offsetExpiresAt,
  }).eq('id', testId);

  if (updateErr) {
    console.error('Failed to prepare test db row:', updateErr.message);
    process.exit(1);
  }

  console.log('[TEST] Preparation complete. Target is staged and expired.');
  console.log('\n--- SIMULATING SCHEDULED CLEANUP RUN ---');

  // Dynamically import the local dev cleanup cron equivalent script which mirrors Edge Function
  require('../supabase/workers/cleanup-cron/index');
}

runTest();
