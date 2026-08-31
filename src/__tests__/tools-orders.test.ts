import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/orders', () => {
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

  describe('refundOrder', () => {
    it('should refund order successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { refundOrder } = await import('../tools/orders.js');
      const result = await refundOrder('GPA.1234-5678-9012');

      expect(result).toContain('## Order Refunded');
      expect(result).toContain('GPA.1234-5678-9012');
      expect(result).toContain('Full refund');
    });

    it('should indicate partial refund type', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { refundOrder } = await import('../tools/orders.js');
      const result = await refundOrder('GPA.1234', false);

      expect(result).toContain('Partial refund');
    });
  });
});
