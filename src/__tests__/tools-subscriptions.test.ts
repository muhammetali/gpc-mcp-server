import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/subscriptions', () => {
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

  describe('listSubscriptions', () => {
    it('should list subscriptions with base plans', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          subscriptions: [
            {
              productId: 'premium_monthly',
              packageName: 'com.fixmob.vipchat',
              basePlans: [
                {
                  basePlanId: 'monthly',
                  state: 'ACTIVE',
                  autoRenewingBasePlanType: { billingPeriodDuration: 'P1M' },
                },
                {
                  basePlanId: 'yearly',
                  state: 'ACTIVE',
                  autoRenewingBasePlanType: { billingPeriodDuration: 'P1Y' },
                },
              ],
              listings: [
                { languageCode: 'en-US', title: 'Premium', benefits: ['No ads', 'HD'] },
              ],
            },
          ],
        }), { status: 200 }),
      );

      const { listSubscriptions } = await import('../tools/subscriptions.js');
      const result = await listSubscriptions();

      expect(result).toContain('## Subscriptions (1)');
      expect(result).toContain('Premium');
      expect(result).toContain('monthly');
      expect(result).toContain('yearly');
      expect(result).toContain('1 month');
      expect(result).toContain('1 year');
      expect(result).toContain('ACTIVE');
    });

    it('should handle empty subscriptions', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { listSubscriptions } = await import('../tools/subscriptions.js');
      const result = await listSubscriptions();

      expect(result).toContain('No subscriptions found');
    });
  });

  describe('getSubscription', () => {
    it('should return detailed subscription info', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          productId: 'premium_monthly',
          packageName: 'com.fixmob.vipchat',
          archived: false,
          basePlans: [
            {
              basePlanId: 'monthly',
              state: 'ACTIVE',
              autoRenewingBasePlanType: {
                billingPeriodDuration: 'P1M',
                gracePeriodDuration: 'P3D',
              },
              offerTags: [{ tag: 'default' }],
            },
          ],
          listings: [
            {
              languageCode: 'en-US',
              title: 'Premium Monthly',
              benefits: ['No ads', 'HD quality'],
            },
          ],
        }), { status: 200 }),
      );

      const { getSubscription } = await import('../tools/subscriptions.js');
      const result = await getSubscription('premium_monthly');

      expect(result).toContain('## Subscription: premium_monthly');
      expect(result).toContain('Auto-renewing');
      expect(result).toContain('1 month');
      expect(result).toContain('3 days');
      expect(result).toContain('default');
      expect(result).toContain('No ads');
    });
  });

  describe('createSubscription', () => {
    it('should create subscription with base plan', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { createSubscription } = await import('../tools/subscriptions.js');
      const result = await createSubscription(
        'vip_access', 'en-US', 'VIP Access', 'monthly', 'P1M', 'Full VIP access', ['No ads'],
      );

      expect(result).toContain('## Subscription Created');
      expect(result).toContain('vip_access');
      expect(result).toContain('1 month');
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription listing', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // GET current subscription
          return Promise.resolve(new Response(JSON.stringify({
            productId: 'premium_monthly',
            packageName: 'com.fixmob.vipchat',
            listings: [
              { languageCode: 'en-US', title: 'Old Title', description: 'Old desc' },
            ],
          }), { status: 200 }));
        }
        // PATCH update
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { updateSubscription } = await import('../tools/subscriptions.js');
      const result = await updateSubscription('premium_monthly', {
        title: 'Premium Plus',
        benefits: ['No ads', 'HD', 'Priority support'],
      });

      expect(result).toContain('## Subscription Updated: premium_monthly');
      expect(result).toContain('Premium Plus');
      expect(result).toContain('No ads, HD, Priority support');
    });
  });
});
