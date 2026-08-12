import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/products (monetization.onetimeproducts)', () => {
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
          oneTimeProducts: [
            {
              packageName: 'com.fixmob.vipchat',
              productId: 'premium_unlock',
              listings: [{ languageCode: 'en-US', title: 'Premium Unlock', description: 'Unlock all features' }],
              purchaseOptions: [{
                purchaseOptionId: 'premium_unlock-base',
                state: 'ACTIVE',
                buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
                regionalPricingAndAvailabilityConfigs: [
                  { regionCode: 'US', price: { currencyCode: 'USD', units: '4', nanos: 990000000 }, availability: 'AVAILABLE' },
                ],
              }],
            },
            {
              packageName: 'com.fixmob.vipchat',
              productId: 'coins_100',
              listings: [{ languageCode: 'en-US', title: '100 Coins', description: 'Buy coins' }],
              purchaseOptions: [{
                purchaseOptionId: 'coins_100-base',
                state: 'ACTIVE',
                buyOption: { legacyCompatible: true, multiQuantityEnabled: true },
                regionalPricingAndAvailabilityConfigs: [
                  { regionCode: 'US', price: { currencyCode: 'USD', units: '0', nanos: 990000000 }, availability: 'AVAILABLE' },
                ],
              }],
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
      expect(result).toContain('ACTIVE');
    });

    it('should handle empty product list', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const { listProducts } = await import('../tools/products.js');
      const result = await listProducts();

      expect(result).toContain('No in-app products found');
    });

    it('should paginate using nextPageToken', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) {
          expect(url).not.toContain('pageToken');
          return Promise.resolve(new Response(JSON.stringify({
            oneTimeProducts: [{
              packageName: 'com.fixmob.vipchat',
              productId: 'item_1',
              listings: [{ languageCode: 'en-US', title: 'Item 1', description: '-' }],
              purchaseOptions: [{ purchaseOptionId: 'item_1-base', state: 'ACTIVE' }],
            }],
            nextPageToken: 'token-2',
          }), { status: 200 }));
        }
        expect(url).toContain('pageToken=token-2');
        return Promise.resolve(new Response(JSON.stringify({
          oneTimeProducts: [{
            packageName: 'com.fixmob.vipchat',
            productId: 'item_2',
            listings: [{ languageCode: 'en-US', title: 'Item 2', description: '-' }],
            purchaseOptions: [{ purchaseOptionId: 'item_2-base', state: 'ACTIVE' }],
          }],
        }), { status: 200 }));
      });

      const { listProducts } = await import('../tools/products.js');
      const result = await listProducts();

      expect(result).toContain('## In-App Products (2)');
      expect(result).toContain('item_1');
      expect(result).toContain('item_2');
      expect(callCount).toBe(2);
    });
  });

  describe('getProduct', () => {
    it('should return product details with listings and regional pricing', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          packageName: 'com.fixmob.vipchat',
          productId: 'premium_unlock',
          listings: [
            { languageCode: 'en-US', title: 'Premium Unlock', description: 'Get all features' },
            { languageCode: 'tr-TR', title: 'Premium Aç', description: 'Tüm özellikleri aç' },
          ],
          purchaseOptions: [{
            purchaseOptionId: 'premium_unlock-base',
            state: 'ACTIVE',
            regionalPricingAndAvailabilityConfigs: [
              { regionCode: 'US', price: { currencyCode: 'USD', units: '4', nanos: 990000000 }, availability: 'AVAILABLE' },
              { regionCode: 'TR', price: { currencyCode: 'TRY', units: '149', nanos: 0 }, availability: 'AVAILABLE' },
            ],
          }],
        }), { status: 200 }),
      );

      const { getProduct } = await import('../tools/products.js');
      const result = await getProduct('premium_unlock');

      expect(result).toContain('## In-App Product: premium_unlock');
      expect(result).toContain('4.99 USD');
      expect(result).toContain('### Listings');
      expect(result).toContain('en-US');
      expect(result).toContain('tr-TR');
      expect(result).toContain('### Regional Pricing');
      expect(result).toContain('149.00 TRY');
    });
  });

  describe('createProduct', () => {
    it('should create product via PATCH with allowMissing + regionsVersion and return confirmation', async () => {
      let capturedUrl = '';
      let capturedMethod = '';
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        capturedUrl = url;
        capturedMethod = opts.method;
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { createProduct } = await import('../tools/products.js');
      const result = await createProduct(
        'new_item', 'en-US', 'New Item', 'A great item', true, 'US', '1990000', 'USD',
      );

      expect(capturedMethod).toBe('PATCH');
      expect(capturedUrl).toContain('/monetization/onetimeproducts/new_item');
      expect(capturedUrl).toContain('allowMissing=true');
      expect(capturedUrl).toContain('updateMask=listings%2CpurchaseOptions');
      expect(capturedUrl).toContain('regionsVersion.version=2022%2F02');
      expect(capturedBody.productId).toBe('new_item');
      expect(capturedBody.listings[0]).toEqual({ languageCode: 'en-US', title: 'New Item', description: 'A great item' });
      expect(capturedBody.purchaseOptions[0].buyOption.multiQuantityEnabled).toBe(true);
      expect(capturedBody.purchaseOptions[0].regionalPricingAndAvailabilityConfigs[0]).toEqual({
        regionCode: 'US',
        price: { currencyCode: 'USD', units: '1', nanos: 990000000 },
        availability: 'AVAILABLE',
      });

      expect(result).toContain('## Product Created');
      expect(result).toContain('new_item');
      expect(result).toContain('1.99 USD');
      expect(result).toContain('Consumable');
    });

    it('should mark non-consumable products correctly (multiQuantityEnabled: false)', async () => {
      let capturedBody: any;
      global.fetch = vi.fn().mockImplementation((_url: string, opts: any) => {
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { createProduct } = await import('../tools/products.js');
      const result = await createProduct(
        'lifetime_vip', 'en-US', 'Lifetime VIP', 'One-time unlock', false, 'US', '9990000', 'USD',
      );

      expect(capturedBody.purchaseOptions[0].buyOption.multiQuantityEnabled).toBe(false);
      expect(result).toContain('Non-consumable');
    });
  });

  describe('updateProduct', () => {
    it('should update product title via PATCH with listings-only updateMask', async () => {
      let callCount = 0;
      let patchUrl = '';
      let patchBody: any;
      global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({
            packageName: 'com.fixmob.vipchat',
            productId: 'premium_unlock',
            listings: [{ languageCode: 'en-US', title: 'Old Title', description: 'Desc' }],
            purchaseOptions: [{
              purchaseOptionId: 'premium_unlock-base',
              state: 'ACTIVE',
              regionalPricingAndAvailabilityConfigs: [
                { regionCode: 'US', price: { currencyCode: 'USD', units: '4', nanos: 990000000 }, availability: 'AVAILABLE' },
              ],
            }],
          }), { status: 200 }));
        }
        patchUrl = url;
        patchBody = JSON.parse(opts.body);
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { updateProduct } = await import('../tools/products.js');
      const result = await updateProduct('premium_unlock', { title: 'New Title' });

      expect(patchUrl).toContain('updateMask=listings');
      expect(patchUrl).not.toContain('purchaseOptions');
      expect(patchBody.listings[0].title).toBe('New Title');
      expect(result).toContain('## Product Updated: premium_unlock');
      expect(result).toContain('New Title');
    });

    it('should update price for a specific region via purchaseOptions-only updateMask', async () => {
      let callCount = 0;
      let patchUrl = '';
      let patchBody: any;
      global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({
            packageName: 'com.fixmob.vipchat',
            productId: 'premium_unlock',
            listings: [{ languageCode: 'en-US', title: 'Premium', description: 'Desc' }],
            purchaseOptions: [{
              purchaseOptionId: 'premium_unlock-base',
              state: 'ACTIVE',
              regionalPricingAndAvailabilityConfigs: [
                { regionCode: 'US', price: { currencyCode: 'USD', units: '4', nanos: 990000000 }, availability: 'AVAILABLE' },
              ],
            }],
          }), { status: 200 }));
        }
        patchUrl = url;
        patchBody = JSON.parse(opts.body);
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { updateProduct } = await import('../tools/products.js');
      const result = await updateProduct('premium_unlock', {
        priceMicros: '5990000',
        currency: 'USD',
        regionCode: 'US',
      });

      expect(patchUrl).toContain('updateMask=purchaseOptions');
      expect(patchBody.purchaseOptions[0].regionalPricingAndAvailabilityConfigs[0].price).toEqual({
        currencyCode: 'USD',
        units: '5',
        nanos: 990000000,
      });
      expect(result).toContain('5.99 USD');
    });

    it('should combine both masks when title AND price change in the same call', async () => {
      let callCount = 0;
      let patchUrl = '';
      let patchBody: any;
      global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({
            packageName: 'com.fixmob.vipchat',
            productId: 'premium_unlock',
            listings: [{ languageCode: 'en-US', title: 'Old Title', description: 'Desc' }],
            purchaseOptions: [{
              purchaseOptionId: 'premium_unlock-base',
              state: 'ACTIVE',
              regionalPricingAndAvailabilityConfigs: [
                { regionCode: 'US', price: { currencyCode: 'USD', units: '4', nanos: 990000000 }, availability: 'AVAILABLE' },
              ],
            }],
          }), { status: 200 }));
        }
        patchUrl = url;
        patchBody = JSON.parse(opts.body);
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { updateProduct } = await import('../tools/products.js');
      await updateProduct('premium_unlock', {
        title: 'New Title',
        priceMicros: '2990000',
        currency: 'USD',
        regionCode: 'US',
      });

      expect(patchUrl).toContain('updateMask=listings%2CpurchaseOptions');
      expect(patchBody.listings[0].title).toBe('New Title');
      expect(patchBody.purchaseOptions[0].regionalPricingAndAvailabilityConfigs[0].price.units).toBe('2');
    });

    it('should add a NEW region price alongside an existing one, not replace it', async () => {
      let callCount = 0;
      let patchBody: any;
      global.fetch = vi.fn().mockImplementation((_url: string, opts: any) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({
            packageName: 'com.fixmob.vipchat',
            productId: 'premium_unlock',
            listings: [{ languageCode: 'en-US', title: 'Premium', description: 'Desc' }],
            purchaseOptions: [{
              purchaseOptionId: 'premium_unlock-base',
              state: 'ACTIVE',
              regionalPricingAndAvailabilityConfigs: [
                { regionCode: 'US', price: { currencyCode: 'USD', units: '4', nanos: 990000000 }, availability: 'AVAILABLE' },
              ],
            }],
          }), { status: 200 }));
        }
        patchBody = JSON.parse(opts.body);
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
      });

      const { updateProduct } = await import('../tools/products.js');
      await updateProduct('premium_unlock', {
        priceMicros: '1490000',
        currency: 'TRY',
        regionCode: 'TR',
      });

      const configs = patchBody.purchaseOptions[0].regionalPricingAndAvailabilityConfigs;
      expect(configs).toHaveLength(2);
      expect(configs.find((c: any) => c.regionCode === 'US').price.currencyCode).toBe('USD');
      expect(configs.find((c: any) => c.regionCode === 'TR').price.currencyCode).toBe('TRY');
    });

    it('should propagate a 404 GPCClientError when the product does not exist', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          error: { code: 404, message: 'Product not found', status: 'NOT_FOUND' },
        }), { status: 404 }),
      );

      const { updateProduct } = await import('../tools/products.js');
      const { GPCClientError } = await import('../client.js');
      await expect(updateProduct('missing_item', { title: 'x' })).rejects.toThrow(GPCClientError);
    });

    it('should report no changes when no updatable fields are provided', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          packageName: 'com.fixmob.vipchat',
          productId: 'premium_unlock',
          listings: [{ languageCode: 'en-US', title: 'Premium', description: 'Desc' }],
          purchaseOptions: [{ purchaseOptionId: 'premium_unlock-base', state: 'ACTIVE' }],
        }), { status: 200 }),
      );

      const { updateProduct } = await import('../tools/products.js');
      const result = await updateProduct('premium_unlock', {});

      expect(result).toContain('No Changes');
    });
  });

  describe('deleteProduct', () => {
    it('should delete product by productId and confirm', async () => {
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve(new Response(null, { status: 204 }));
      });

      const { deleteProduct } = await import('../tools/products.js');
      const result = await deleteProduct('old_item');

      expect(capturedUrl).toContain('/monetization/onetimeproducts/old_item');
      expect(result).toContain('## Product Deleted');
      expect(result).toContain('old_item');
    });
  });
});
