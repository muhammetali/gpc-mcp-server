import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

// Mock fs with controllable behavior
const mockExistsSync = vi.fn<(p: string) => boolean>(() => true);
const mockStatSync = vi.fn<(p: string) => { size: number }>(() => ({ size: 50 * 1024 * 1024 }));
const mockReadFileSync = vi.fn<(p: string) => Buffer>(() => Buffer.from('fake-aab-data'));

vi.mock('fs', () => ({
  existsSync: (p: string) => mockExistsSync(p),
  statSync: (p: string) => mockStatSync(p),
  readFileSync: (p: string) => mockReadFileSync(p),
}));

describe('tools/bundles', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 50 * 1024 * 1024 });
    mockReadFileSync.mockReturnValue(Buffer.from('fake-aab-data'));
    process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.fixmob.vipchat';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('uploadBundle', () => {
    it('should upload bundle successfully with version code and SHA hashes', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          // Upload bundle
          return Promise.resolve(new Response(JSON.stringify({
            versionCode: 10205,
            sha1: 'abc123sha1hash',
            sha256: 'def456sha256hash',
          }), { status: 200 }));
        }
        // Commit edit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { uploadBundle } = await import('../tools/bundles.js');
      const result = await uploadBundle('/path/to/app-release.aab');

      expect(result).toContain('## Bundle Uploaded');
      expect(result).toContain('10205');
      expect(result).toContain('abc123sha1hash');
      expect(result).toContain('def456sha256hash');
      expect(result).toContain('50.0 MB');
      expect(result).toContain('gpc_create_release');
    });

    it('should return error when file not found', async () => {
      mockExistsSync.mockReturnValue(false);

      const { uploadBundle } = await import('../tools/bundles.js');
      const result = await uploadBundle('/path/to/missing.aab');

      expect(result).toContain('**Error:**');
      expect(result).toContain('File not found');
    });

    it('should return error for invalid file extension (not .aab)', async () => {
      const { uploadBundle } = await import('../tools/bundles.js');
      const result = await uploadBundle('/path/to/app-release.apk');

      expect(result).toContain('**Error:**');
      expect(result).toContain('.aab');
    });

    it('should handle upload timeout', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((_url: string, options?: any) => {
        callCount++;
        if (callCount === 1) {
          // Create edit succeeds
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        // Upload times out
        return new Promise((_resolve, reject) => {
          const timer = setTimeout(() => {
            _resolve(new Response(JSON.stringify({}), { status: 200 }));
          }, 999_999);

          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      const { uploadBundle } = await import('../tools/bundles.js');

      await expect(uploadBundle('/path/to/large-app.aab')).rejects.toThrow('aborted');
    }, 400_000);
  });

  describe('listBundles', () => {
    it('should list multiple bundles in markdown table', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        // List bundles
        return Promise.resolve(new Response(JSON.stringify({
          bundles: [
            { versionCode: 10205, sha1: 'sha1-a', sha256: 'sha256-a' },
            { versionCode: 10204, sha1: 'sha1-b', sha256: 'sha256-b' },
            { versionCode: 10203, sha1: 'sha1-c', sha256: 'sha256-c' },
          ],
        }), { status: 200 }));
      });

      const { listBundles } = await import('../tools/bundles.js');
      const result = await listBundles();

      expect(result).toContain('## Uploaded Bundles (3)');
      expect(result).toContain('10205');
      expect(result).toContain('10204');
      expect(result).toContain('10203');
      expect(result).toContain('sha1-a');
    });

    it('should handle empty bundle list', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ bundles: [] }), { status: 200 }));
      });

      const { listBundles } = await import('../tools/bundles.js');
      const result = await listBundles();

      expect(result).toContain('No bundles found');
      expect(result).toContain('com.fixmob.vipchat');
    });
  });
});
