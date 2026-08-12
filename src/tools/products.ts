import { gpcGet, gpcPatch, gpcPost, gpcDelete, getPackageName, escapeMarkdown } from '../client.js';
import { MAX_PAGES, REGIONS_VERSION } from '../constants.js';

// monetization.onetimeproducts — replaces the sunset `inappproducts` resource.
// Legacy field renames: sku -> productId, status -> state, defaultPrice ->
// per-region prices inside purchaseOptions[].regionalPricingAndAvailabilityConfigs,
// listings map -> listings array (languageCode field instead of a map key).
//
// PATH CASING IS NOT UNIFORM — verified against Google's own discovery doc
// (`https://androidpublisher.googleapis.com/$discovery/rest?version=v3`,
// NOT the human-readable API reference pages, which say something different
// and are wrong on this point): list/get/delete/batchGet/batchUpdate use
// `oneTimeProducts` (camelCase), but `patch` specifically uses
// `onetimeproducts` (all lowercase). There is also NO `monetization/` path
// segment — despite the resource being namespaced as
// `androidpublisher.monetization.onetimeproducts.*`, the URL itself is just
// `applications/{packageName}/oneTimeProducts`. Confirmed 2026-08-12 by
// curling the endpoint directly (a 404 HTML page, even with a bogus auth
// token, proved the URL itself was wrong before any 403 permission check
// could even run) and cross-checking the discovery JSON. If touching these
// paths again, re-fetch the discovery doc — don't trust AI-summarized web
// docs for exact path casing on this resource.

interface Money {
  currencyCode: string;
  // Both optional — Google's proto3 JSON omits fields at their zero value,
  // so a whole-dollar-free price like $0.99 (units=0) arrives with no
  // `units` key at all, and an even-dollar price like $5.00 (nanos=0)
  // arrives with no `nanos` key. See formatPrice().
  units?: string;
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
  // Output only on the resource — cannot be set via PATCH. Change it with
  // purchaseOptions:batchUpdateStates instead (see activatePurchaseOption).
  state?: string;
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

function oneTimeProductsPath(pkg: string): string {
  return `/applications/${pkg}/oneTimeProducts`;
}

// The one path that deliberately does NOT match the others — see the file
// header comment. Do not "fix" this to match oneTimeProductsPath().
function patchPath(pkg: string, productId: string): string {
  return `/applications/${pkg}/onetimeproducts/${productId}`;
}

function formatPrice(price?: Money): string {
  if (!price) return '-';
  // Money is a proto3 message — Google omits fields at their zero value
  // (units: "0", nanos: 0) from the JSON entirely, they don't come back as
  // "0". Confirmed live 2026-08-12: a $0.99 price (units=0) arrived with no
  // `units` key at all, which made parseInt(undefined, 10) => NaN. Default
  // both to 0 explicitly.
  const units = price.units ? parseInt(price.units, 10) : 0;
  const nanos = price.nanos || 0;
  const amount = (units + nanos / 1_000_000_000).toFixed(2);
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
      oneTimeProductsPath(pkg),
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
    `${oneTimeProductsPath(pkg)}/${productId}`,
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

// `state` is output-only on the resource (Google's discovery schema marks
// OneTimeProductPurchaseOption.state readOnly) — it cannot be set via PATCH.
// This is the dedicated endpoint for it. New purchase options are created in
// DRAFT and stay unpurchasable until this is called.
async function activatePurchaseOption(productId: string, purchaseOptionId: string): Promise<void> {
  const pkg = getPackageName();
  await gpcPost(`${oneTimeProductsPath(pkg)}/${productId}/purchaseOptions:batchUpdateStates`, {
    requests: [
      {
        activatePurchaseOptionRequest: { packageName: pkg, productId, purchaseOptionId },
      },
    ],
  });
}

async function deactivatePurchaseOption(productId: string, purchaseOptionId: string): Promise<void> {
  const pkg = getPackageName();
  await gpcPost(`${oneTimeProductsPath(pkg)}/${productId}/purchaseOptions:batchUpdateStates`, {
    requests: [
      {
        deactivatePurchaseOptionRequest: { packageName: pkg, productId, purchaseOptionId },
      },
    ],
  });
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
  const purchaseOptionId = `${productId}-base`;

  const body: OneTimeProduct = {
    packageName: pkg,
    productId,
    listings: [{ languageCode: defaultLanguage, title, description }],
    purchaseOptions: [
      {
        purchaseOptionId,
        buyOption: { legacyCompatible: true, multiQuantityEnabled: consumable },
        regionalPricingAndAvailabilityConfigs: [
          { regionCode, price, availability: 'AVAILABLE' },
        ],
      },
    ],
  };

  await gpcPatch(
    patchPath(pkg, productId),
    body,
    {
      updateMask: 'listings,purchaseOptions',
      allowMissing: 'true',
      'regionsVersion.version': REGIONS_VERSION,
    },
  );

  // New purchase options are created DRAFT — activate so it's purchasable,
  // matching the old inappproducts behavior (`status: 'active'` at creation).
  await activatePurchaseOption(productId, purchaseOptionId);

  let md = `## Product Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Product ID** | ${productId} |\n`;
  md += `| **Title** | ${title} |\n`;
  md += `| **Type** | ${consumable ? 'Consumable (multi-quantity)' : 'Non-consumable (one-time)'} |\n`;
  md += `| **Price** | ${formatPrice(price)} (${regionCode}) |\n`;
  md += `| **Language** | ${defaultLanguage} |\n`;
  md += `| **State** | ACTIVE |\n`;
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
    active?: boolean;
  },
): Promise<string> {
  const pkg = getPackageName();

  const current = await gpcGet<OneTimeProduct>(
    `${oneTimeProductsPath(pkg)}/${productId}`,
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

  if (maskParts.length > 0) {
    // `state` is read-only even here — strip it defensively so a stray
    // value read back from GET is never sent in a write body.
    for (const po of current.purchaseOptions) delete po.state;

    await gpcPatch(
      patchPath(pkg, productId),
      current,
      {
        updateMask: maskParts.join(','),
        'regionsVersion.version': REGIONS_VERSION,
      },
    );
  }

  if (updates.active !== undefined) {
    const purchaseOptionId = current.purchaseOptions[0]?.purchaseOptionId;
    if (purchaseOptionId) {
      if (updates.active) {
        await activatePurchaseOption(productId, purchaseOptionId);
      } else {
        await deactivatePurchaseOption(productId, purchaseOptionId);
      }
    }
  }

  if (maskParts.length === 0 && updates.active === undefined) {
    return `## No Changes\n\nNo updatable fields were provided for \`${productId}\`.`;
  }

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
  if (updates.active !== undefined) {
    md += `| **State** | ${updates.active ? 'ACTIVE' : 'INACTIVE'} |\n`;
  }

  return md;
}

export async function deleteProduct(productId: string): Promise<string> {
  const pkg = getPackageName();
  await gpcDelete(`${oneTimeProductsPath(pkg)}/${productId}`);
  return `## Product Deleted\n\nIn-app product \`${productId}\` has been deleted.`;
}

function microsToMoney(priceMicros: string, currencyCode: string): Money {
  const micros = BigInt(priceMicros);
  const units = micros / 1_000_000n;
  const nanos = Number(micros % 1_000_000n) * 1_000;
  return { currencyCode, units: units.toString(), nanos };
}
