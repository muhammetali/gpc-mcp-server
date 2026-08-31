import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth module
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('client', () => {
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

  describe('GPCClientError', () => {
    it('should format error message correctly', async () => {
      const { GPCClientError } = await import('../client.js');
      const error = new GPCClientError(403, {
        code: 403,
        message: 'The caller does not have permission',
        status: 'PERMISSION_DENIED',
      });

      expect(error.status).toBe(403);
      expect(error.name).toBe('GPCClientError');
      expect(error.message).toContain('PERMISSION_DENIED');
      expect(error.message).toContain('does not have permission');
    });
  });

  describe('getPackageName', () => {
    it('should return package name from env', async () => {
      const { getPackageName } = await import('../client.js');
      expect(getPackageName()).toBe('com.example.myapp');
    });

    it('should throw when package name is missing', async () => {
      delete process.env.GOOGLE_PLAY_PACKAGE_NAME;
      const { getPackageName } = await import('../client.js');
      expect(() => getPackageName()).toThrow('Missing GOOGLE_PLAY_PACKAGE_NAME');
    });
  });

  describe('gpcGet', () => {
    it('should send GET request with auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ listings: [] }), { status: 200 })
      );
      global.fetch = mockFetch;

      const { gpcGet } = await import('../client.js');
      await gpcGet('/applications/com.test/listings');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('androidpublisher.googleapis.com');
      expect(url).toContain('/applications/com.test/listings');
      expect(options.headers.Authorization).toBe('Bearer mock-access-token');
    });

    it('should append query params', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );
      global.fetch = mockFetch;

      const { gpcGet } = await import('../client.js');
      await gpcGet('/path', { maxResults: '20', translationLanguage: 'en' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('maxResults=20');
      expect(url).toContain('translationLanguage=en');
    });

    it('should throw GPCClientError on 4xx response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          error: { code: 404, message: 'Not found', status: 'NOT_FOUND' },
        }), { status: 404 })
      );

      const { gpcGet, GPCClientError } = await import('../client.js');
      await expect(gpcGet('/not-found')).rejects.toThrow(GPCClientError);
    });

    it('should handle rate limiting (429) after retry', async () => {
      // Both attempts return 429
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }), {
          status: 429,
          headers: { 'retry-after': '60' },
        })
      );

      const { gpcGet, GPCClientError } = await import('../client.js');
      try {
        await gpcGet('/path');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(GPCClientError);
        const err = e as InstanceType<typeof GPCClientError>;
        expect(err.status).toBe(429);
        expect(err.error.status).toBe('RATE_LIMITED');
        expect(err.error.message).toContain('60');
      }
      // Should have been called twice (initial + 1 retry)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should succeed on retry after 429', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(
            JSON.stringify({ error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }),
            { status: 429, headers: { 'retry-after': '1' } },
          ));
        }
        return Promise.resolve(new Response(JSON.stringify({ data: 'success' }), { status: 200 }));
      });

      const { gpcGet } = await import('../client.js');
      const result = await gpcGet('/path');

      expect(result).toEqual({ data: 'success' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should include AbortSignal for timeout', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );
      global.fetch = mockFetch;

      const { gpcGet } = await import('../client.js');
      await gpcGet('/path');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('should handle 403 with permission error', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          error: { code: 403, message: 'Access denied', status: 'PERMISSION_DENIED' },
        }), { status: 403 })
      );

      const { gpcGet, GPCClientError } = await import('../client.js');
      try {
        await gpcGet('/path');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(GPCClientError);
        const err = e as InstanceType<typeof GPCClientError>;
        expect(err.status).toBe(403);
      }
    });
  });

  describe('gpcPost', () => {
    it('should send POST with JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'edit-123' }), { status: 200 })
      );
      global.fetch = mockFetch;

      const { gpcPost } = await import('../client.js');
      const body = { some: 'data' };
      await gpcPost('/applications/com.test/edits', body);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(options.body).toBe(JSON.stringify(body));
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('should send POST without body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'edit-123' }), { status: 200 })
      );
      global.fetch = mockFetch;

      const { gpcPost } = await import('../client.js');
      await gpcPost('/applications/com.test/edits');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(options.body).toBeUndefined();
    });

    it('appends query string parameters when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('{}', { status: 200 }),
      );
      global.fetch = mockFetch;

      const { gpcPost } = await import('../client.js');
      await gpcPost('/applications/com.test/edits/123:commit', undefined, {
        changesNotSentForReview: 'true',
      });

      const [url] = mockFetch.mock.calls[0];
      expect(String(url)).toContain('changesNotSentForReview=true');
    });

    it('omits the query string entirely when no params supplied', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('{}', { status: 200 }),
      );
      global.fetch = mockFetch;

      const { gpcPost } = await import('../client.js');
      await gpcPost('/applications/com.test/edits');

      const [url] = mockFetch.mock.calls[0];
      expect(String(url)).not.toContain('?');
    });
  });

  describe('commitEdit', () => {
    // Regression guard for the 2026-04 Play API change: every :commit now
    // must carry `changesNotSentForReview=true` or Google rejects with
    // 400 INVALID_ARGUMENT. We default to true so older callers keep
    // working without touching every call site.
    it('defaults to changesNotSentForReview=true', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('{}', { status: 200 }),
      );
      global.fetch = mockFetch;

      const { commitEdit } = await import('../client.js');
      await commitEdit('edit-42');

      const [url, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(String(url)).toContain('edits/edit-42:commit');
      expect(String(url)).toContain('changesNotSentForReview=true');
    });

    it('can be opted-out explicitly', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('{}', { status: 200 }),
      );
      global.fetch = mockFetch;

      const { commitEdit } = await import('../client.js');
      await commitEdit('edit-43', { changesNotSentForReview: false });

      const [url] = mockFetch.mock.calls[0];
      expect(String(url)).not.toContain('changesNotSentForReview');
    });

    // Regression guard: Google rejects changesNotSentForReview on an app's
    // first-ever production submission (no prior reviewed release to stage
    // against). commitEdit should transparently retry without the param
    // instead of surfacing this as a failure to every caller.
    it('retries without changesNotSentForReview on the first-submission 400', async () => {
      const rejectionBody = JSON.stringify({
        error: {
          code: 400,
          message:
            'Changes are sent for review automatically. The query parameter changesNotSentForReview must not be set.',
          status: 'INVALID_ARGUMENT',
        },
      });
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(rejectionBody, { status: 400 }))
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));
      global.fetch = mockFetch;

      const { commitEdit } = await import('../client.js');
      await commitEdit('edit-44');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [firstUrl] = mockFetch.mock.calls[0];
      const [secondUrl] = mockFetch.mock.calls[1];
      expect(String(firstUrl)).toContain('changesNotSentForReview=true');
      expect(String(secondUrl)).not.toContain('changesNotSentForReview');
    });

    it('does not retry other 400 errors', async () => {
      const rejectionBody = JSON.stringify({
        error: { code: 400, message: 'Some unrelated failure', status: 'INVALID_ARGUMENT' },
      });
      const mockFetch = vi.fn().mockResolvedValue(new Response(rejectionBody, { status: 400 }));
      global.fetch = mockFetch;

      const { commitEdit } = await import('../client.js');
      await expect(commitEdit('edit-45')).rejects.toThrow('Some unrelated failure');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('gpcPut', () => {
    it('should send PUT request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );
      global.fetch = mockFetch;

      const { gpcPut } = await import('../client.js');
      await gpcPut('/path', { track: 'production' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PUT');
    });
  });

  describe('gpcPatch', () => {
    it('should send PATCH request with JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );
      global.fetch = mockFetch;

      const { gpcPatch } = await import('../client.js');
      await gpcPatch('/path', { title: 'New Title' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).not.toContain('?');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ title: 'New Title' });
    });

    it('should append query params when provided (e.g. updateMask)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );
      global.fetch = mockFetch;

      const { gpcPatch } = await import('../client.js');
      await gpcPatch('/path', { title: 'x' }, {
        updateMask: 'listings,purchaseOptions',
        allowMissing: 'true',
        'regionsVersion.version': '2022/02',
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('updateMask=listings%2CpurchaseOptions');
      expect(url).toContain('allowMissing=true');
      expect(url).toContain('regionsVersion.version=2022%2F02');
    });

    it('should omit the query string entirely when no params are given', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );
      global.fetch = mockFetch;

      const { gpcPatch } = await import('../client.js');
      await gpcPatch('/path', { title: 'x' });

      const [url] = mockFetch.mock.calls[0];
      expect(url.endsWith('/path')).toBe(true);
    });
  });

  describe('gpcDelete', () => {
    it('should send DELETE and handle 204', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 })
      );
      global.fetch = mockFetch;

      const { gpcDelete } = await import('../client.js');
      await gpcDelete('/applications/com.test/images/123');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/images/123');
      expect(options.method).toBe('DELETE');
    });

    it('should append query params when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 })
      );
      global.fetch = mockFetch;

      const { gpcDelete } = await import('../client.js');
      await gpcDelete('/applications/com.test/onetimeproducts/x', { allowMissing: 'true' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('allowMissing=true');
    });
  });

  describe('handleResponse edge cases', () => {
    it('should handle non-JSON error response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('Internal Server Error', { status: 500 })
      );

      const { gpcGet, GPCClientError } = await import('../client.js');
      try {
        await gpcGet('/path');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(GPCClientError);
        const err = e as InstanceType<typeof GPCClientError>;
        expect(err.error.status).toBe('UNKNOWN');
        expect(err.error.message).toContain('Internal Server Error');
      }
    });

    it('should handle non-JSON success response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('plain text', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      );

      const { gpcGet } = await import('../client.js');
      const result = await gpcGet('/something');
      expect(result).toBe('plain text');
    });
  });
});
