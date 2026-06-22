#!/usr/bin/env node
/**
 * Local Stripe-webhook integration check (test mode only).
 *
 * Signs synthetic Stripe events with the LOCAL STRIPE_WEBHOOK_SECRET and posts
 * them to the locally-served stripe-webhook function, to prove subscription
 * synchronization + credit-grant idempotency end to end. Secret-free: the
 * signing secret and user ids are read from the environment, never hard-coded.
 *
 * Required env:
 *   STRIPE_WEBHOOK_SECRET   local webhook signing secret
 *   STARTER_USER_ID         auth.users id used for the Starter checks
 *   PRO_USER_ID             auth.users id used for the Pro checks
 * Optional:
 *   SUPABASE_URL            default http://127.0.0.1:54321
 *
 * It prints each webhook response; assert balances/rows separately via SQL.
 */
import { createHmac } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STARTER_USER_ID = process.env.STARTER_USER_ID;
const PRO_USER_ID = process.env.PRO_USER_ID;

if (!SECRET || !STARTER_USER_ID || !PRO_USER_ID) {
  console.error('Missing STRIPE_WEBHOOK_SECRET / STARTER_USER_ID / PRO_USER_ID — skipping.');
  process.exit(0);
}

const WEBHOOK = `${SUPABASE_URL}/functions/v1/stripe-webhook`;
const nowSec = Math.floor(Date.now() / 1000);
const periodEnd = nowSec + 30 * 24 * 60 * 60;

function sign(payload) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', SECRET).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

async function post(event) {
  const payload = JSON.stringify(event);
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': sign(payload) },
    body: payload
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function invoicePaid(plan, userId) {
  const productKey = plan === 'pro' ? 'subscription_pro' : 'subscription_starter';
  return {
    id: `evt_inv_${plan}`,
    type: 'invoice.paid',
    data: {
      object: {
        object: 'invoice',
        id: `in_live_test_${plan}_1`,
        subscription: `sub_live_test_${plan}`,
        customer: `cus_live_${plan}`,
        status: 'paid',
        billing_reason: 'subscription_create',
        amount_paid: plan === 'pro' ? 11900 : 5900,
        currency: 'usd',
        subscription_details: {
          metadata: { purchase_kind: 'HOSTED_SUBSCRIPTION', product_key: productKey, user_id: userId }
        },
        lines: { data: [{ price: { id: `price_${plan}` }, period: { start: nowSec, end: periodEnd } }] }
      }
    }
  };
}

function subscriptionEvent(type, plan, userId, status) {
  const productKey = plan === 'pro' ? 'subscription_pro' : 'subscription_starter';
  return {
    id: `evt_${type}_${plan}`,
    type,
    data: {
      object: {
        object: 'subscription',
        id: `sub_live_test_${plan}`,
        customer: `cus_live_${plan}`,
        status,
        current_period_start: nowSec,
        current_period_end: periodEnd,
        cancel_at_period_end: type === 'customer.subscription.deleted',
        canceled_at: type === 'customer.subscription.deleted' ? nowSec : null,
        items: { data: [{ price: { id: `price_${plan}` } }] },
        metadata: { purchase_kind: 'HOSTED_SUBSCRIPTION', product_key: productKey, user_id: userId }
      }
    }
  };
}

function paymentFailed(plan, userId) {
  const e = invoicePaid(plan, userId);
  e.id = `evt_inv_failed_${plan}`;
  e.type = 'invoice.payment_failed';
  e.data.object.id = `in_live_test_${plan}_failed`;
  e.data.object.status = 'open';
  e.data.object.billing_reason = 'subscription_cycle';
  return e;
}

const log = (label, r) => console.log(`  ${label}: HTTP ${r.status} ${JSON.stringify(r.body)}`);

async function main() {
  console.log('Stripe webhook local check against', WEBHOOK);

  for (const [plan, userId] of [['starter', STARTER_USER_ID], ['pro', PRO_USER_ID]]) {
    console.log(`\n[${plan}]`);
    log('invoice.paid (1st)', await post(invoicePaid(plan, userId)));
    log('invoice.paid (replay)', await post(invoicePaid(plan, userId)));
    log('subscription.updated', await post(subscriptionEvent('customer.subscription.updated', plan, userId, 'active')));
    log('invoice.payment_failed', await post(paymentFailed(plan, userId)));
  }

  console.log('\n[lifecycle] cancel starter');
  log('subscription.deleted (starter)', await post(subscriptionEvent('customer.subscription.deleted', 'starter', STARTER_USER_ID, 'canceled')));

  console.log('\n[fail-closed] unknown product invoice');
  const unknown = invoicePaid('starter', STARTER_USER_ID);
  unknown.data.object.id = 'in_live_test_unknown';
  unknown.data.object.subscription = 'sub_live_test_unknown';
  unknown.data.object.subscription_details.metadata.product_key = 'totally_unknown';
  log('invoice.paid (unknown product)', await post(unknown));
}

main().catch((e) => { console.error(e); process.exit(1); });
