import { gpcGet, gpcPatch, gpcDelete, getPackageName, escapeMarkdown } from '../client.js';
import { MAX_PAGES, REGIONS_VERSION } from '../constants.js';

// monetization.onetimeproducts — replaces the sunset `inappproducts` resource
// (2024 Google Play migration; see constants.ts REGIONS_VERSION comment).
// Legacy field renames: sku -> productId, status -> state, defaultPrice ->
// per-region prices inside purchaseOptions[].regionalPricingAndAvailabilityConfigs,
// listings map -> listings array (languageCode field instead of a map key).

interface Money {
  currencyCode: string;
  units: string;
  nanos?: number;
}

interface OneTimeProductListing {
  languageCode: string;
  title: string;
  description: string;
}

interface RegionalPricingAndAvailabilityConfig {
  regionCode: string;
  price: Money;
  availability: string;
}

interface BuyOption {
  legacyCompatible?: boolean;
  multiQuantityEnabled?: boolean;
}

interface PurchaseOption {
  purchaseOptionId: string;
  state: string;
  buyOption?: BuyOption;
  regionalPricingAndAvailabilityConfigs?: RegionalPricingAndAvailabilityConfig[];
}

interface OneTimeProduct {
  packageName: string;
  productId: string;
  listings: OneTimeProductListing[];
  purchaseOptions: PurchaseOption[];
}

interface OneTimeProductsListResponse {
  oneTimeProducts?: OneTimeProduct[];
  nextPageToken?: string;
}

function formatPrice(price?: Money): string {
  if (!price) return '-';
  const amount = (parseInt(price.units, 10) + (price.nanos || 0) / 1_000_000_000).toFixed(2);
  return `${amount} ${price.currencyCode}`;
}

// Picks a representative price to show in list/get views — prefers the
// region matching `preferredRegion` (default US), else the first configured
// region. Purely a display concern; writes always target an explicit region.
function primaryPrice(purchaseOptions: PurchaseOption[], preferredRegion = 'US'): Money | undefined {
  for (const po of purchaseOptions) {
    const configs = po.regionalPricingAndAvailabilityConfigs || [];
    const match = configs.find((c) => c.regionCode === preferredRegion);
    if (match) return match.price;
  }
  return purchaseOptions[0]?.regionalPricingAndAvailabilityConfigs?.[0]?.price;
}

function primaryListing(product: OneTimeProduct): OneTimeProductListing | undefined {
  return (
    product.listings.find((l) => l.languageCode === 'en-US') || product.listings[0]
  );
}

export async function listProducts(): Promise<string> {
  const pkg = getPackageName();
  const allProducts: OneTimeProduct[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const params: Record<string, string> = {};
    if (pageToken) params.pageToken = pageToken;

    const result = await gpcGet<OneTimeProductsListResponse>(
      `/applications/${pkg}/monetization/onetimeproducts`,
      params,
    );

    if (result.oneTimeProducts) {
      allProducts.push(...result.oneTimeProducts);
    }
    pageToken = result.nextPageToken;
    pageCount++;
  } while (pageToken && pageCount < MAX_PAGES);

  if (allProducts.length === 0) {
    return `## In-App Products\n\nNo in-app products found for \`${pkg}\`.`;
  }

  let md = `## In-App Products (${allProducts.length})\n\n`;
  md += `| Product ID | Title | Price (US) | State |\n`;
  md += `|-----|-------|-------|--------|\n`;

  for (const product of allProducts) {
    const title = escapeMarkdown(primaryListing(product)?.title || '-');
    const price = formatPrice(primaryPrice(product.purchaseOptions));
    const state = product.purchaseOptions[0]?.state || '-';
    md += `| ${product.productId} | ${title} | ${price} | ${state} |\n`;
  }

  return md;
}

export async function getProduct(productId: string): Promise<string> {
  const pkg = getPackageName();
  const product = await gpcGet<OneTimeProduct>(
    `/applications/${pkg}/monetization/onetimeproducts/${productId}`,
  );

  let md = `## In-App Product: ${productId}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Product ID** | ${product.productId} |\n`;
  md += `| **State** | ${product.purchaseOptions[0]?.state || '-'} |\n`;
  md += `| **Reference Price (US)** | ${formatPrice(primaryPrice(product.purchaseOptions))} |\n`;

  if (Object.keys(product.listings || {}).length > 0) {
    md += `\n### Listings\n\n`;
    md += `| Locale | Title | Description |\n`;
    md += `|--------|-------|-------------|\n`;
    for (const listing of product.listings) {
      const desc = listing.description
        ? (listing.description.length > 60 ? listing.description.slice(0, 60) + '...' : listing.description)
        : '-';
      md += `| ${listing.languageCode} | ${listing.title} | ${desc} |\n`;
    }
  }

  md += `\n### Regional Pricing\n\n`;
  md += `| Purchase Option | Region | Price | Availability |\n`;
  md += `|------------------|--------|-------|---------------|\n`;
  for (const po of product.purchaseOptions) {
    for (const cfg of po.regionalPricingAndAvailabilityConfigs || []) {
      md += `| ${po.purchaseOptionId} | ${cfg.regionCode} | ${formatPrice(cfg.price)} | ${cfg.availability} |\n`;
    }
  }

  return md;
}

export async function createProduct(
  productId: string,
  defaultLanguage: string,
  title: string,
  description: string,
  consumable: boolean,
  regionCode: string,
  priceMicros: string,
  currency: string,
): Promise<string> {
  const pkg = getPackageName();
  const price = microsToMoney(priceMicros, currency);

  const body: OneTimeProduct = {
    packageName: pkg,
    productId,
    listings: [{ languageCode: defaultLanguage, title, description }],
    purchaseOptions: [
      {
        purchaseOptionId: `${productId}-base`,
        state: 'ACTIVE',
        buyOption: { legacyCompatible: true, multiQuantityEnabled: consumable },
        regionalPricingAndAvailabilityConfigs: [
          { regionCode, price, availability: 'AVAILABLE' },
        ],
      },
    ],
  };

  await gpcPatch(
    `/applications/${pkg}/monetization/onetimeproducts/${productId}`,
    body,
    {
      updateMask: 'listings,purchaseOptions',
      allowMissing: 'true',
      'regionsVersion.version': REGIONS_VERSION,
    },
  );

  let md = `## Product Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Product ID** | ${productId} |\n`;
  md += `| **Title** | ${title} |\n`;
  md += `| **Type** | ${consumable ? 'Consumable (multi-quantity)' : 'Non-consumable (one-time)'} |\n`;
  md += `| **Price** | ${formatPrice(price)} (${regionCode}) |\n`;
  md += `| **Language** | ${defaultLanguage} |\n`;
  md += `\n**Note:** price was only set for \`${regionCode}\` — other regions have no price/availability yet. Call `;
  md += `\`gpc_update_product\` again with a different \`regionCode\` to add more, or set pricing per-region from the Play Console UI.`;

  return md;
}

export async function updateProduct(
  productId: string,
  updates: {
    title?: string;
    description?: string;
    defaultLanguage?: string;
    priceMicros?: string;
    currency?: string;
    regionCode?: string;
  },
): Promise<string> {
  const pkg = getPackageName();

  const current = await gpcGet<OneTimeProduct>(
    `/applications/${pkg}/monetization/onetimeproducts/${productId}`,
  );

  const maskParts: string[] = [];

  if (updates.title || updates.description) {
    const lang = updates.defaultLanguage || primaryListing(current)?.languageCode || 'en-US';
    let listing = current.listings.find((l) => l.languageCode === lang);
    if (!listing) {
      listing = { languageCode: lang, title: '', description: '' };
      current.listings.push(listing);
    }
    if (updates.title) listing.title = updates.title;
    if (updates.description) listing.description = updates.description;
    maskParts.push('listings');
  }

  if (updates.priceMicros && updates.currency && updates.regionCode) {
    const price = microsToMoney(updates.priceMicros, updates.currency);
    const po = current.purchaseOptions[0];
    if (po) {
      po.regionalPricingAndAvailabilityConfigs = po.regionalPricingAndAvailabilityConfigs || [];
      const existing = po.regionalPricingAndAvailabilityConfigs.find(
        (c) => c.regionCode === updates.regionCode,
      );
      if (existing) {
        existing.price = price;
      } else {
        po.regionalPricingAndAvailabilityConfigs.push({
          regionCode: updates.regionCode,
          price,
          availability: 'AVAILABLE',
        });
      }
      maskParts.push('purchaseOptions');
    }
  }

  if (maskParts.length === 0) {
    return `## No Changes\n\nNo updatable fields were provided for \`${productId}\`.`;
  }

  await gpcPatch(
    `/applications/${pkg}/monetization/onetimeproducts/${productId}`,
    current,
    {
      updateMask: maskParts.join(','),
      'regionsVersion.version': REGIONS_VERSION,
    },
  );

  let md = `## Product Updated: ${productId}\n\n`;
  md += `| Updated Field | New Value |\n`;
  md += `|---------------|----------|\n`;
  if (updates.title) md += `| **Title** | ${updates.title} |\n`;
  if (updates.description) {
    const preview = updates.description.length > 60 ? updates.description.slice(0, 60) + '...' : updates.description;
    md += `| **Description** | ${preview} |\n`;
  }
  if (updates.priceMicros && updates.currency && updates.regionCode) {
    md += `| **Price (${updates.regionCode})** | ${formatPrice(microsToMoney(updates.priceMicros, updates.currency))} |\n`;
  }

  return md;
}

export async function deleteProduct(productId: string): Promise<string> {
  const pkg = getPackageName();
  await gpcDelete(`/applications/${pkg}/monetization/onetimeproducts/${productId}`);
  return `## Product Deleted\n\nIn-app product \`${productId}\` has been deleted.`;
}

function microsToMoney(priceMicros: string, currencyCode: string): Money {
  const micros = BigInt(priceMicros);
  const units = micros / 1_000_000n;
  const nanos = Number(micros % 1_000_000n) * 1_000;
  return { currencyCode, units: units.toString(), nanos };
}
