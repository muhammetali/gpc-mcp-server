import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

// Mock fs
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => Buffer.from('fake-image-data')),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ size: 500 * 1024 })), // 500 KB
}));

describe('tools/images', () => {
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

  describe('listImages', () => {
    it('should return images in markdown table', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        // List images
        return Promise.resolve(new Response(JSON.stringify({
          images: [
            { id: 'img-1', url: 'https://play.googleapis.com/image1', sha1: 'abc', sha256: 'def' },
            { id: 'img-2', url: 'https://play.googleapis.com/image2', sha1: 'ghi', sha256: 'jkl' },
          ],
        }), { status: 200 }));
      });

      const { listImages } = await import('../tools/images.js');
      const result = await listImages('en-US', 'phoneScreenshots');

      expect(result).toContain('## Images: phoneScreenshots');
      expect(result).toContain('en-US');
      expect(result).toContain('img-1');
      expect(result).toContain('img-2');
      expect(result).toContain('**Total:** 2 image(s)');
    });

    it('should handle empty images', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ images: [] }), { status: 200 }));
      });

      const { listImages } = await import('../tools/images.js');
      const result = await listImages('en-US', 'phoneScreenshots');

      expect(result).toContain('No phoneScreenshots uploaded');
    });
  });

  describe('uploadImage', () => {
    it('should upload image and return success', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Create edit
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          // Upload
          return Promise.resolve(new Response(JSON.stringify({ id: 'new-img-1' }), { status: 200 }));
        }
        // Commit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { uploadImage } = await import('../tools/images.js');
      const result = await uploadImage('en-US', 'phoneScreenshots', '/path/to/screenshot.png');

      expect(result).toContain('## Image Uploaded');
      expect(result).toContain('en-US');
      expect(result).toContain('phoneScreenshots');
      expect(result).toContain('Upload complete');
    });

    it('should reject invalid file extensions', async () => {
      const { existsSync } = await import('fs');
      (existsSync as any).mockReturnValue(true);

      const { uploadImage } = await import('../tools/images.js');

      await expect(uploadImage('en-US', 'phoneScreenshots', '/path/to/file.txt'))
        .rejects.toThrow('Invalid file type');
    });

    it('should reject non-existent files', async () => {
      const { existsSync } = await import('fs');
      (existsSync as any).mockReturnValue(false);

      const { uploadImage } = await import('../tools/images.js');

      await expect(uploadImage('en-US', 'phoneScreenshots', '/path/to/missing.png'))
        .rejects.toThrow('File not found');
    });
  });

  describe('deleteImage', () => {
    it('should delete image and return success', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        if (callCount === 2) {
          // Delete
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        // Commit
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { deleteImage } = await import('../tools/images.js');
      const result = await deleteImage('en-US', 'phoneScreenshots', 'img-1');

      expect(result).toContain('Deleted');
      expect(result).toContain('img-1');
    });
  });
});
