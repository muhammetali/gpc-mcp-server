import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/testers', () => {
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

  describe('listTesters', () => {
    it('should list Google Groups for a track', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          googleGroups: ['testers@googlegroups.com', 'beta@googlegroups.com'],
        }), { status: 200 }));
      });

      const { listTesters } = await import('../tools/testers.js');
      const result = await listTesters('internal');

      expect(result).toContain('## Testers: internal');
      expect(result).toContain('Google Groups (2)');
      expect(result).toContain('testers@googlegroups.com');
      expect(result).toContain('beta@googlegroups.com');
    });

    it('should handle no testers configured', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { listTesters } = await import('../tools/testers.js');
      const result = await listTesters('beta');

      expect(result).toContain('No Google Groups configured');
      expect(result).toContain('gpc_update_testers');
    });
  });

  describe('updateTesters', () => {
    it('should update testers and commit', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ id: 'edit-1' }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { updateTesters } = await import('../tools/testers.js');
      const result = await updateTesters('alpha', ['qa@googlegroups.com']);

      expect(result).toContain('## Testers Updated: alpha');
      expect(result).toContain('qa@googlegroups.com');
      expect(result).toContain('Updated and committed successfully');
      expect(callCount).toBe(3); // create edit + PUT testers + commit
    });
  });
});
