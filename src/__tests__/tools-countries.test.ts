import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/countries', () => {
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

  describe('listCountryAvailability', () => {
    it('should list available countries for a track', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          restOfWorld: true,
          countries: [
            { countryCode: 'US' },
            { countryCode: 'TR' },
            { countryCode: 'DE' },
          ],
        }), { status: 200 }));
      });

      const { listCountryAvailability } = await import('../tools/countries.js');
      const result = await listCountryAvailability('production');

      expect(result).toContain('## Country Availability: production');
      expect(result).toContain('Rest of World');
      expect(result).toContain('Yes');
      expect(result).toContain('Specific Countries');
      expect(result).toContain('3');
      expect(result).toContain('DE, TR, US');
    });

    it('should handle empty countries', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          restOfWorld: false,
        }), { status: 200 }));
      });

      const { listCountryAvailability } = await import('../tools/countries.js');
      const result = await listCountryAvailability('beta');

      expect(result).toContain('No');
      expect(result).toContain('0');
    });
  });
});
