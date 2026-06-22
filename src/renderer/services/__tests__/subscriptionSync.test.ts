import { describe, expect, it } from 'vitest';
import {
  mapStripeEventToSubscriptionSync,
  normalizeSubscriptionStatus,
  subscriptionPlanDisplayName,
  toIsoFromUnix
} from '../../../../supabase/functions/_shared/subscriptionSync';

const PERIOD_START = 1_750_000_000; // fixed unix seconds
const PERIOD_END = 1_752_592_000;

const invoiceEvent = (overrides: {
  type?: string;
  productKey?: string | null;
  userId?: string | null;
  subscription?: string | null;
}) => ({
  id: 'evt_inv_1',
  type: overrides.type ?? 'invoice.paid',
  data: {
    object: {
      object: 'invoice',
      subscription: overrides.subscription === undefined ? 'sub_123' : overrides.subscription,
      status: 'paid',
      billing_reason: 'subscription_create',
      customer: 'cus_abc',
      subscription_details: {
        metadata: {
          purchase_kind: 'HOSTED_SUBSCRIPTION',
          product_key: overrides.productKey === undefined ? 'subscription_starter' : overrides.productKey,
          user_id: overrides.userId === undefined ? 'user-uuid-1' : overrides.userId
        }
      },
      lines: { data: [{ price: { id: 'price_starter' }, period: { start: PERIOD_START, end: PERIOD_END } }] }
    }
  }
});

const subscriptionEvent = (overrides: {
  type?: string;
  status?: string;
  productKey?: string;
  userId?: string;
  canceled_at?: number | null;
}) => ({
  id: 'evt_sub_1',
  type: overrides.type ?? 'customer.subscription.updated',
  data: {
    object: {
      object: 'subscription',
      id: 'sub_123',
      customer: 'cus_abc',
      status: overrides.status ?? 'active',
      current_period_start: PERIOD_START,
      current_period_end: PERIOD_END,
      cancel_at_period_end: false,
      canceled_at: overrides.canceled_at ?? null,
      items: { data: [{ price: { id: 'price_pro' } }] },
      metadata: {
        purchase_kind: 'HOSTED_SUBSCRIPTION',
        product_key: overrides.productKey ?? 'subscription_pro',
        user_id: overrides.userId ?? 'user-uuid-2'
      }
    }
  }
});

describe('mapStripeEventToSubscriptionSync — invoice events', () => {
  it('maps a paid Starter invoice to an active subscription record', () => {
    const rec = mapStripeEventToSubscriptionSync(invoiceEvent({ productKey: 'subscription_starter' }));
    expect(rec).not.toBeNull();
    expect(rec!.stripeSubscriptionId).toBe('sub_123');
    expect(rec!.userId).toBe('user-uuid-1');
    expect(rec!.productKey).toBe('subscription_starter');
    expect(rec!.productName).toBe('Starter');
    expect(rec!.status).toBe('active');
    expect(rec!.currentPeriodStart).toBe(new Date(PERIOD_START * 1000).toISOString());
    expect(rec!.currentPeriodEnd).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it('maps a paid Pro invoice with the Pro display name', () => {
    const rec = mapStripeEventToSubscriptionSync(invoiceEvent({ productKey: 'subscription_pro' }));
    expect(rec!.productKey).toBe('subscription_pro');
    expect(rec!.productName).toBe('Pro');
    expect(rec!.status).toBe('active');
  });

  it('invoice.payment_failed produces a past_due (non-active) record, never active', () => {
    const rec = mapStripeEventToSubscriptionSync(invoiceEvent({ type: 'invoice.payment_failed' }));
    expect(rec!.status).toBe('past_due');
  });

  it('fails closed on an unknown product key (no record)', () => {
    expect(mapStripeEventToSubscriptionSync(invoiceEvent({ productKey: 'totally_unknown' }))).toBeNull();
    expect(mapStripeEventToSubscriptionSync(invoiceEvent({ productKey: null }))).toBeNull();
    // BYOK is not a hosted subscription -> no subscription row.
    expect(mapStripeEventToSubscriptionSync(invoiceEvent({ productKey: 'indie_desktop_byok' }))).toBeNull();
  });

  it('fails closed when identity or subscription id is missing', () => {
    expect(mapStripeEventToSubscriptionSync(invoiceEvent({ userId: null }))).toBeNull();
    expect(mapStripeEventToSubscriptionSync(invoiceEvent({ subscription: null }))).toBeNull();
  });
});

describe('mapStripeEventToSubscriptionSync — subscription lifecycle events', () => {
  it('maps customer.subscription.updated to the current status + periods', () => {
    const rec = mapStripeEventToSubscriptionSync(subscriptionEvent({ status: 'active' }));
    expect(rec!.status).toBe('active');
    expect(rec!.productKey).toBe('subscription_pro');
    expect(rec!.currentPeriodEnd).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it('maps customer.subscription.deleted to canceled with a canceled_at', () => {
    const rec = mapStripeEventToSubscriptionSync(
      subscriptionEvent({ type: 'customer.subscription.deleted', status: 'canceled', canceled_at: PERIOD_END })
    );
    expect(rec!.status).toBe('canceled');
    expect(rec!.canceledAt).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it('coerces transitional statuses (incomplete/paused) to the non-active "unpaid"', () => {
    expect(mapStripeEventToSubscriptionSync(subscriptionEvent({ status: 'incomplete' }))!.status).toBe('unpaid');
    expect(mapStripeEventToSubscriptionSync(subscriptionEvent({ status: 'paused' }))!.status).toBe('unpaid');
  });

  it('ignores unrelated event types', () => {
    expect(
      mapStripeEventToSubscriptionSync({ id: 'e', type: 'charge.refunded', data: { object: { object: 'charge' } } })
    ).toBeNull();
  });
});

describe('helpers', () => {
  it('normalizeSubscriptionStatus keeps the allowed domain and defaults to unpaid', () => {
    expect(normalizeSubscriptionStatus('active')).toBe('active');
    expect(normalizeSubscriptionStatus('trialing')).toBe('trialing');
    expect(normalizeSubscriptionStatus('past_due')).toBe('past_due');
    expect(normalizeSubscriptionStatus('canceled')).toBe('canceled');
    expect(normalizeSubscriptionStatus('unpaid')).toBe('unpaid');
    expect(normalizeSubscriptionStatus('incomplete_expired')).toBe('unpaid');
    expect(normalizeSubscriptionStatus(undefined)).toBe('unpaid');
  });

  it('toIsoFromUnix rejects non-positive / non-finite values', () => {
    expect(toIsoFromUnix(0)).toBeNull();
    expect(toIsoFromUnix(-1)).toBeNull();
    expect(toIsoFromUnix('nope')).toBeNull();
    expect(toIsoFromUnix(PERIOD_START)).toBe(new Date(PERIOD_START * 1000).toISOString());
  });

  it('subscriptionPlanDisplayName maps canonical keys and falls back', () => {
    expect(subscriptionPlanDisplayName('subscription_starter')).toBe('Starter');
    expect(subscriptionPlanDisplayName('subscription_pro')).toBe('Pro');
    expect(subscriptionPlanDisplayName('something_else')).toBe('Subscription');
  });
});
