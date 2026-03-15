import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/listings', () => {
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

  describe('getAppInfo', () => {
    it('should return app details in markdown', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        // Get details via edit context
        return Promise.resolve(new Response(JSON.stringify({
          defaultLanguage: 'en-US',
          contactEmail: 'info@goygoychat.com',
          contactPhone: '+1234567890',
          contactWebsite: 'https://goygoychat.com',
        }), { status: 200 }));
      });

      const { getAppInfo } = await import('../tools/listings.js');
      const result = await getAppInfo();

      expect(result).toContain('## Google Play App Info');
      expect(result).toContain('com.fixmob.vipchat');
      expect(result).toContain('en-US');
      expect(result).toContain('info@goygoychat.com');
    });
  });

  describe('listListings', () => {
    it('should return markdown table with listings', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        // List listings via edit context
        return Promise.resolve(new Response(JSON.stringify({
          listings: [
            { language: 'en-US', title: 'GoyGoyChat', shortDescription: 'Voice chat app', fullDescription: 'Full desc', video: '' },
            { language: 'tr-TR', title: 'GoyGoyChat', shortDescription: 'Sesli sohbet', fullDescription: 'Tam aciklama', video: '' },
          ],
        }), { status: 200 }));
      });

      const { listListings } = await import('../tools/listings.js');
      const result = await listListings();

      expect(result).toContain('## Google Play Store Listings');
      expect(result).toContain('GoyGoyChat');
      expect(result).toContain('en-US');
      expect(result).toContain('tr-TR');
      // Should warn about missing locales (de-DE, es-419, fr-FR, ru-RU, ar)
      expect(result).toContain('Warning');
      expect(result).toContain('de-DE');
    });

    it('should handle empty listings', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        // Empty listings
        return Promise.resolve(new Response(JSON.stringify({ listings: [] }), { status: 200 }));
      });

      const { listListings } = await import('../tools/listings.js');
      const result = await listListings();

      expect(result).toContain('No listings found');
    });
  });

  describe('updateListing', () => {
    it('should update listing via edit context and commit', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          // GET existing listing
          return Promise.resolve(new Response(JSON.stringify({
            language: 'tr-TR',
            title: 'Old Title',
            fullDescription: 'Old desc',
            shortDescription: 'Old short',
            video: '',
          }), { status: 200 }));
        }
        // PUT update or commit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { updateListing } = await import('../tools/listings.js');
      const result = await updateListing('tr-TR', { title: 'New Title' });

      expect(result).toContain('## Store Listing Updated');
      expect(result).toContain('tr-TR');
      expect(result).toContain('New Title');
      expect(result).toContain('Updated successfully');
    });
  });
});
