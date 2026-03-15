import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('error handling', () => {
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

  describe('GPCClientError formatting', () => {
    it('should include all error details', async () => {
      const { GPCClientError } = await import('../client.js');
      const error = new GPCClientError(403, {
        code: 403,
        message: 'The caller does not have permission',
        status: 'PERMISSION_DENIED',
      });

      expect(error.message).toContain('PERMISSION_DENIED');
      expect(error.message).toContain('does not have permission');
      expect(error.status).toBe(403);
    });
  });

  describe('timeout behavior', () => {
    it('should abort request after timeout', async () => {
      global.fetch = vi.fn().mockImplementation((_url: string, options?: any) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve(new Response(JSON.stringify({}), { status: 200 }));
          }, 60_000);

          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      const { gpcGet } = await import('../client.js');
      await expect(gpcGet('/slow-endpoint')).rejects.toThrow('aborted');
    }, 35_000);
  });

  describe('rate limit error details', () => {
    it('should include retry-after from headers', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }), {
          status: 429,
          headers: { 'retry-after': '45' },
        })
      );

      const { gpcGet, GPCClientError } = await import('../client.js');

      try {
        await gpcGet('/path');
        expect.unreachable();
      } catch (e) {
        const err = e as InstanceType<typeof GPCClientError>;
        expect(err.error.message).toContain('45');
      }
    });

    it('should default to 30 seconds when retry-after missing', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }), { status: 429 })
      );

      const { gpcGet, GPCClientError } = await import('../client.js');

      try {
        await gpcGet('/path');
        expect.unreachable();
      } catch (e) {
        const err = e as InstanceType<typeof GPCClientError>;
        expect(err.error.message).toContain('30');
      }
    });
  });

  describe('permission error', () => {
    it('should throw 403 with permission message', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          error: {
            code: 403,
            message: 'The caller does not have permission',
            status: 'PERMISSION_DENIED',
          },
        }), { status: 403 })
      );

      const { gpcGet, GPCClientError } = await import('../client.js');

      try {
        await gpcGet('/path');
        expect.unreachable();
      } catch (e) {
        const err = e as InstanceType<typeof GPCClientError>;
        expect(err.status).toBe(403);
        expect(err.error.message).toContain('permission');
      }
    });
  });
});
