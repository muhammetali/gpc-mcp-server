import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

// Mock fs
const mockExistsSync = vi.fn<(p: string) => boolean>(() => true);
const mockStatSync = vi.fn<(p: string) => { size: number }>(() => ({ size: 30 * 1024 * 1024 }));
const mockReadFileSync = vi.fn<(p: string) => Buffer>(() => Buffer.from('fake-bundle'));

vi.mock('fs', () => ({
  existsSync: (p: string) => mockExistsSync(p),
  statSync: (p: string) => mockStatSync(p),
  readFileSync: (p: string) => mockReadFileSync(p),
}));

describe('tools/sharing', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
    mockExistsSync.mockReturnValue(true);
    process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.example.myapp';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('uploadInternalBundle', () => {
    it('should upload bundle for internal sharing', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          downloadUrl: 'https://play.google.com/apps/test/com.example.myapp/123',
          sha256: 'abc123hash',
        }), { status: 200 }),
      );

      const { uploadInternalBundle } = await import('../tools/sharing.js');
      const result = await uploadInternalBundle('/path/to/app.aab');

      expect(result).toContain('## Internal App Sharing Upload');
      expect(result).toContain('Bundle (AAB)');
      expect(result).toContain('abc123hash');
      expect(result).toContain('Download URL');
      expect(result).toContain('immediately');
    });

    it('should reject non-existent file', async () => {
      mockExistsSync.mockReturnValue(false);

      const { uploadInternalBundle } = await import('../tools/sharing.js');
      const result = await uploadInternalBundle('/path/to/missing.aab');

      expect(result).toContain('**Error:**');
      expect(result).toContain('File not found');
    });

    it('should reject invalid file extension', async () => {
      const { uploadInternalBundle } = await import('../tools/sharing.js');
      const result = await uploadInternalBundle('/path/to/file.zip');

      expect(result).toContain('**Error:**');
      expect(result).toContain('.aab or .apk');
    });
  });
});
