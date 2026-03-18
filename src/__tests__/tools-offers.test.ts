import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/offers', () => {
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

  describe('activateBasePlan', () => {
    it('should activate base plan', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { activateBasePlan } = await import('../tools/offers.js');
      const result = await activateBasePlan('premium', 'monthly');

      expect(result).toContain('## Base Plan Activated');
      expect(result).toContain('monthly');
      expect(result).toContain('premium');
      expect(result).toContain('ACTIVE');
    });
  });

  describe('deactivateBasePlan', () => {
    it('should deactivate base plan with info about existing subscribers', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { deactivateBasePlan } = await import('../tools/offers.js');
      const result = await deactivateBasePlan('premium', 'monthly');

      expect(result).toContain('## Base Plan Deactivated');
      expect(result).toContain('INACTIVE');
      expect(result).toContain('Existing subscribers');
    });
  });

  describe('deleteBasePlan', () => {
    it('should delete base plan with warning', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { deleteBasePlan } = await import('../tools/offers.js');
      const result = await deleteBasePlan('premium', 'monthly');

      expect(result).toContain('## Base Plan Deleted');
      expect(result).toContain('cannot be undone');
    });
  });

  describe('listOffers', () => {
    it('should list offers for a base plan', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          subscriptionOffers: [
            {
              productId: 'premium',
              basePlanId: 'monthly',
              offerId: 'free-trial-7d',
              state: 'ACTIVE',
              offerTags: [{ tag: 'new-user' }],
              phases: [
                { duration: 'P7D', recurrenceCount: 1, pricingInfo: { freePhase: {} } },
              ],
            },
            {
              productId: 'premium',
              basePlanId: 'monthly',
              offerId: 'half-price-3m',
              state: 'ACTIVE',
              phases: [
                { duration: 'P1M', recurrenceCount: 3, pricingInfo: { discountedPrice: { priceMicros: '2490000', currency: 'USD' } } },
              ],
            },
          ],
        }), { status: 200 }),
      );

      const { listOffers } = await import('../tools/offers.js');
      const result = await listOffers('premium', 'monthly');

      expect(result).toContain('## Subscription Offers (2)');
      expect(result).toContain('free-trial-7d');
      expect(result).toContain('half-price-3m');
      expect(result).toContain('new-user');
      expect(result).toContain('ACTIVE');
    });

    it('should handle no offers', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { listOffers } = await import('../tools/offers.js');
      const result = await listOffers('premium', 'monthly');

      expect(result).toContain('No offers found');
    });
  });

  describe('getOffer', () => {
    it('should return detailed offer info with phases', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          productId: 'premium',
          basePlanId: 'monthly',
          offerId: 'free-trial-7d',
          state: 'ACTIVE',
          offerTags: [{ tag: 'new-user' }],
          phases: [
            { duration: 'P7D', recurrenceCount: 1, pricingInfo: { freePhase: {} } },
            { duration: 'P1M', recurrenceCount: 1, pricingInfo: { basePlanPhase: {} } },
          ],
        }), { status: 200 }),
      );

      const { getOffer } = await import('../tools/offers.js');
      const result = await getOffer('premium', 'monthly', 'free-trial-7d');

      expect(result).toContain('## Offer: free-trial-7d');
      expect(result).toContain('Phases (2)');
      expect(result).toContain('Free trial');
      expect(result).toContain('Base price');
    });
  });

  describe('createOffer', () => {
    it('should create offer with free trial phase', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { createOffer } = await import('../tools/offers.js');
      const result = await createOffer('premium', 'monthly', 'trial-7d', [
        { duration: 'P7D', recurrenceCount: 1, type: 'free' },
      ], ['new-user']);

      expect(result).toContain('## Offer Created');
      expect(result).toContain('trial-7d');
      expect(result).toContain('new-user');
      expect(result).toContain('gpc_activate_offer');
    });
  });

  describe('activateOffer', () => {
    it('should activate offer', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { activateOffer } = await import('../tools/offers.js');
      const result = await activateOffer('premium', 'monthly', 'trial-7d');

      expect(result).toContain('## Offer Activated');
      expect(result).toContain('ACTIVE');
    });
  });

  describe('deactivateOffer', () => {
    it('should deactivate offer', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { deactivateOffer } = await import('../tools/offers.js');
      const result = await deactivateOffer('premium', 'monthly', 'trial-7d');

      expect(result).toContain('## Offer Deactivated');
      expect(result).toContain('INACTIVE');
    });
  });

  describe('deleteOffer', () => {
    it('should delete offer', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { deleteOffer } = await import('../tools/offers.js');
      const result = await deleteOffer('premium', 'monthly', 'trial-7d');

      expect(result).toContain('## Offer Deleted');
      expect(result).toContain('trial-7d');
    });
  });
});
