import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/pricing', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
    process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.example.myapp';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('convertRegionPrices', () => {
    it('should return converted prices for all regions', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          convertedRegionPrices: {
            TR: {
              regionCode: 'TR',
              price: { priceMicros: '149990000', currencyCode: 'TRY' },
              taxAmount: { priceMicros: '27000000', currencyCode: 'TRY' },
            },
            DE: {
              regionCode: 'DE',
              price: { priceMicros: '4990000', currencyCode: 'EUR' },
              taxAmount: { priceMicros: '798000', currencyCode: 'EUR' },
            },
          },
        }), { status: 200 }),
      );

      const { convertRegionPrices } = await import('../tools/pricing.js');
      const result = await convertRegionPrices('4990000', 'USD');

      expect(result).toContain('## Converted Region Prices');
      expect(result).toContain('4.99 USD');
      expect(result).toContain('TR');
      expect(result).toContain('TRY');
      expect(result).toContain('DE');
      expect(result).toContain('EUR');
      expect(result).toContain('**Total regions:** 2');
    });

    it('should handle empty region prices', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { convertRegionPrices } = await import('../tools/pricing.js');
      const result = await convertRegionPrices('990000', 'USD');

      expect(result).toContain('No region prices returned');
    });
  });
});
