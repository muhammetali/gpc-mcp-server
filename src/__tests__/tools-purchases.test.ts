import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/purchases', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
    process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.fixmob.vipchat';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('verifyProductPurchase', () => {
    it('should return purchase details in markdown', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          kind: 'androidpublisher#productPurchase',
          purchaseTimeMillis: '1710000000000',
          purchaseState: 0,
          consumptionState: 0,
          acknowledgementState: 1,
          orderId: 'GPA.1234-5678',
          regionCode: 'TR',
        }), { status: 200 }),
      );

      const { verifyProductPurchase } = await import('../tools/purchases.js');
      const result = await verifyProductPurchase('premium_unlock', 'token-abc');

      expect(result).toContain('## Product Purchase Verification');
      expect(result).toContain('GPA.1234-5678');
      expect(result).toContain('Purchased');
      expect(result).toContain('Yes'); // acknowledged
      expect(result).toContain('TR');
    });

    it('should show canceled purchase state', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          purchaseTimeMillis: '1710000000000',
          purchaseState: 1,
          consumptionState: 0,
          acknowledgementState: 0,
          orderId: 'GPA.canceled-1',
        }), { status: 200 }),
      );

      const { verifyProductPurchase } = await import('../tools/purchases.js');
      const result = await verifyProductPurchase('item1', 'token-x');

      expect(result).toContain('Canceled');
    });
  });

  describe('acknowledgeProductPurchase', () => {
    it('should acknowledge purchase successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { acknowledgeProductPurchase } = await import('../tools/purchases.js');
      const result = await acknowledgeProductPurchase('premium_unlock', 'token-abc');

      expect(result).toContain('## Purchase Acknowledged');
      expect(result).toContain('premium_unlock');
    });
  });

  describe('consumeProductPurchase', () => {
    it('should consume purchase successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { consumeProductPurchase } = await import('../tools/purchases.js');
      const result = await consumeProductPurchase('coins_100', 'token-abc');

      expect(result).toContain('## Purchase Consumed');
      expect(result).toContain('coins_100');
    });
  });

  describe('getSubscriptionPurchase', () => {
    it('should return subscription purchase details', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          latestOrderId: 'GPA.sub-1234',
          regionCode: 'US',
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
          startTime: '2026-01-01T00:00:00Z',
          lineItems: [
            {
              productId: 'premium_monthly',
              expiryTime: '2026-04-01T00:00:00Z',
              autoRenewingPlan: { autoRenewEnabled: true },
              offerDetails: { basePlanId: 'monthly' },
            },
          ],
        }), { status: 200 }),
      );

      const { getSubscriptionPurchase } = await import('../tools/purchases.js');
      const result = await getSubscriptionPurchase('token-sub-abc');

      expect(result).toContain('## Subscription Purchase');
      expect(result).toContain('SUBSCRIPTION_STATE_ACTIVE');
      expect(result).toContain('GPA.sub-1234');
      expect(result).toContain('premium_monthly');
      expect(result).toContain('monthly');
      expect(result).toContain('Yes'); // auto-renew
    });
  });

  describe('cancelSubscriptionPurchase', () => {
    it('should cancel subscription successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { cancelSubscriptionPurchase } = await import('../tools/purchases.js');
      const result = await cancelSubscriptionPurchase('token-sub');

      expect(result).toContain('## Subscription Canceled');
      expect(result).toContain('end of the current billing period');
    });
  });

  describe('revokeSubscriptionPurchase', () => {
    it('should revoke subscription with warning', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { revokeSubscriptionPurchase } = await import('../tools/purchases.js');
      const result = await revokeSubscriptionPurchase('token-sub');

      expect(result).toContain('## Subscription Revoked');
      expect(result).toContain('cannot be undone');
    });
  });

  describe('deferSubscriptionBilling', () => {
    it('should defer billing to specified date', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { deferSubscriptionBilling } = await import('../tools/purchases.js');
      const result = await deferSubscriptionBilling('token-sub', '2026-06-01T00:00:00Z');

      expect(result).toContain('## Billing Deferred');
      expect(result).toContain('2026-06-01T00:00:00Z');
    });
  });

  describe('listVoidedPurchases', () => {
    it('should list voided purchases with fraud alert', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          voidedPurchases: [
            {
              purchaseToken: 'token-1',
              purchaseTimeMillis: '1710000000000',
              voidedTimeMillis: '1710100000000',
              orderId: 'GPA.void-1',
              voidedSource: 2,
              voidedReason: 7,
              kind: 'androidpublisher#voidedPurchase',
            },
            {
              purchaseToken: 'token-2',
              purchaseTimeMillis: '1710000000000',
              voidedTimeMillis: '1710200000000',
              orderId: 'GPA.void-2',
              voidedSource: 0,
              voidedReason: 1,
              kind: 'androidpublisher#voidedPurchase',
            },
          ],
        }), { status: 200 }),
      );

      const { listVoidedPurchases } = await import('../tools/purchases.js');
      const result = await listVoidedPurchases();

      expect(result).toContain('## Voided Purchases (2)');
      expect(result).toContain('Chargeback');
      expect(result).toContain('Remorse');
      expect(result).toContain('GPA.void-1');
      expect(result).toContain('Alert');
    });

    it('should handle empty voided purchases', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { listVoidedPurchases } = await import('../tools/purchases.js');
      const result = await listVoidedPurchases();

      expect(result).toContain('No voided purchases found');
    });
  });
});
