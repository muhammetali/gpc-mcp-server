import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/apks', () => {
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

  describe('listGeneratedApks', () => {
    it('should list generated APKs for a version code', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          generatedApks: [
            {
              variantId: 1,
              generatedApks: [
                { downloadId: 'dl-1', variantId: 1, certificateSha256Hash: 'hash1234567890abcdef', moduleName: 'base' },
                { downloadId: 'dl-2', variantId: 1, certificateSha256Hash: 'hash9876543210fedcba', moduleName: 'feature_chat' },
              ],
            },
          ],
        }), { status: 200 }),
      );

      const { listGeneratedApks } = await import('../tools/apks.js');
      const result = await listGeneratedApks(10205);

      expect(result).toContain('## Generated APKs: Version 10205');
      expect(result).toContain('Variant 1');
      expect(result).toContain('dl-1');
      expect(result).toContain('base');
      expect(result).toContain('feature_chat');
      expect(result).toContain('1 variants, 2 APKs');
    });

    it('should handle no generated APKs', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { listGeneratedApks } = await import('../tools/apks.js');
      const result = await listGeneratedApks(999);

      expect(result).toContain('No generated APKs found');
    });
  });

  describe('listApks', () => {
    it('should list uploaded APKs', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          apks: [
            { versionCode: 100, binary: { sha1: 'sha1-abc', sha256: 'sha256-abc' } },
            { versionCode: 101, binary: { sha1: 'sha1-def', sha256: 'sha256-def' } },
          ],
        }), { status: 200 }));
      });

      const { listApks } = await import('../tools/apks.js');
      const result = await listApks();

      expect(result).toContain('## Uploaded APKs (2)');
      expect(result).toContain('100');
      expect(result).toContain('101');
      expect(result).toContain('sha1-abc');
    });

    it('should handle no APKs', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ apks: [] }), { status: 200 }));
      });

      const { listApks } = await import('../tools/apks.js');
      const result = await listApks();

      expect(result).toContain('No APKs found');
    });
  });
});
