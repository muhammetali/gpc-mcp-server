import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/products', () => {
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

  describe('listProducts', () => {
    it('should list products in markdown table', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          inappproduct: [
            {
              sku: 'premium_unlock',
              status: 'active',
              purchaseType: 'managedUser',
              defaultPrice: { priceMicros: '4990000', currency: 'USD' },
              defaultLanguage: 'en-US',
              listings: { 'en-US': { title: 'Premium Unlock', description: 'Unlock all features' } },
            },
            {
              sku: 'coins_100',
              status: 'active',
              purchaseType: 'managedUser',
              defaultPrice: { priceMicros: '990000', currency: 'USD' },
              defaultLanguage: 'en-US',
              listings: { 'en-US': { title: '100 Coins', description: 'Buy coins' } },
            },
          ],
        }), { status: 200 }),
      );

      const { listProducts } = await import('../tools/products.js');
      const result = await listProducts();

      expect(result).toContain('## In-App Products (2)');
      expect(result).toContain('premium_unlock');
      expect(result).toContain('Premium Unlock');
      expect(result).toContain('4.99 USD');
      expect(result).toContain('coins_100');
      expect(result).toContain('Managed (one-time)');
    });

    it('should handle empty product list', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { listProducts } = await import('../tools/products.js');
      const result = await listProducts();

      expect(result).toContain('No in-app products found');
    });
  });

  describe('getProduct', () => {
    it('should return product details with listings', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          sku: 'premium_unlock',
          status: 'active',
          purchaseType: 'managedUser',
          defaultPrice: { priceMicros: '4990000', currency: 'USD' },
          defaultLanguage: 'en-US',
          listings: {
            'en-US': { title: 'Premium Unlock', description: 'Get all features' },
            'tr-TR': { title: 'Premium Aç', description: 'Tüm özellikleri aç' },
          },
        }), { status: 200 }),
      );

      const { getProduct } = await import('../tools/products.js');
      const result = await getProduct('premium_unlock');

      expect(result).toContain('## In-App Product: premium_unlock');
      expect(result).toContain('4.99 USD');
      expect(result).toContain('### Listings');
      expect(result).toContain('en-US');
      expect(result).toContain('tr-TR');
    });
  });

  describe('createProduct', () => {
    it('should create product and return confirmation', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { createProduct } = await import('../tools/products.js');
      const result = await createProduct(
        'new_item', 'en-US', 'New Item', 'A great item', 'managedUser', '1990000', 'USD',
      );

      expect(result).toContain('## Product Created');
      expect(result).toContain('new_item');
      expect(result).toContain('1.99 USD');
    });
  });

  describe('updateProduct', () => {
    it('should update product title and price', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // GET current product
          return Promise.resolve(new Response(JSON.stringify({
            sku: 'premium_unlock',
            status: 'active',
            purchaseType: 'managedUser',
            defaultPrice: { priceMicros: '4990000', currency: 'USD' },
            defaultLanguage: 'en-US',
            listings: { 'en-US': { title: 'Old Title', description: 'Desc' } },
          }), { status: 200 }));
        }
        // PUT updated product
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { updateProduct } = await import('../tools/products.js');
      const result = await updateProduct('premium_unlock', {
        title: 'New Title',
        priceMicros: '5990000',
        currency: 'USD',
      });

      expect(result).toContain('## Product Updated: premium_unlock');
      expect(result).toContain('New Title');
      expect(result).toContain('5.99 USD');
    });
  });

  describe('deleteProduct', () => {
    it('should delete product and confirm', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      const { deleteProduct } = await import('../tools/products.js');
      const result = await deleteProduct('old_item');

      expect(result).toContain('## Product Deleted');
      expect(result).toContain('old_item');
    });
  });
});
