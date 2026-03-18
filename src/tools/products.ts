import { gpcGet, gpcPost, gpcPut, gpcDelete, getPackageName, escapeMarkdown } from '../client.js';
import { MAX_PAGES } from '../constants.js';

interface PriceMicros {
  priceMicros: string;
  currency: string;
}

interface InAppProductListing {
  title: string;
  description: string;
}

interface InAppProduct {
  packageName: string;
  sku: string;
  status: string;
  purchaseType: string;
  defaultPrice: PriceMicros;
  listings: Record<string, InAppProductListing>;
  defaultLanguage: string;
  gracePeriod?: string;
  subscriptionPeriod?: string;
  trialPeriod?: string;
  subscriptionTaxesAndComplianceSettings?: any;
  managedProductTaxesAndComplianceSettings?: any;
}

interface InAppProductsResponse {
  inappproduct?: InAppProduct[];
  tokenPagination?: { nextPageToken?: string };
}

function formatPrice(price: PriceMicros): string {
  const amount = (parseInt(price.priceMicros, 10) / 1_000_000).toFixed(2);
  return `${amount} ${price.currency}`;
}

function formatPurchaseType(type: string): string {
  switch (type) {
    case 'managedUser': return 'Managed (one-time)';
    case 'subscription': return 'Subscription (legacy)';
    default: return type;
  }
}

export async function listProducts(): Promise<string> {
  const pkg = getPackageName();
  const allProducts: InAppProduct[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const params: Record<string, string> = {};
    if (pageToken) params.token = pageToken;

    const result = await gpcGet<InAppProductsResponse>(
      `/applications/${pkg}/inappproducts`,
      params,
    );

    if (result.inappproduct) {
      allProducts.push(...result.inappproduct);
    }
    pageToken = result.tokenPagination?.nextPageToken;
    pageCount++;
  } while (pageToken && pageCount < MAX_PAGES);

  if (allProducts.length === 0) {
    return `## In-App Products\n\nNo in-app products found for \`${pkg}\`.`;
  }

  let md = `## In-App Products (${allProducts.length})\n\n`;
  md += `| SKU | Title | Price | Type | Status |\n`;
  md += `|-----|-------|-------|------|--------|\n`;

  for (const product of allProducts) {
    const title = escapeMarkdown(
      product.listings?.[product.defaultLanguage]?.title
        || Object.values(product.listings || {})[0]?.title
        || '-'
    );
    const price = product.defaultPrice ? formatPrice(product.defaultPrice) : '-';
    const type = formatPurchaseType(product.purchaseType);
    md += `| ${product.sku} | ${title} | ${price} | ${type} | ${product.status} |\n`;
  }

  return md;
}

export async function getProduct(sku: string): Promise<string> {
  const pkg = getPackageName();
  const product = await gpcGet<InAppProduct>(
    `/applications/${pkg}/inappproducts/${sku}`,
  );

  let md = `## In-App Product: ${sku}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **SKU** | ${product.sku} |\n`;
  md += `| **Status** | ${product.status} |\n`;
  md += `| **Type** | ${formatPurchaseType(product.purchaseType)} |\n`;
  md += `| **Default Price** | ${product.defaultPrice ? formatPrice(product.defaultPrice) : '-'} |\n`;
  md += `| **Default Language** | ${product.defaultLanguage} |\n`;

  if (product.subscriptionPeriod) {
    md += `| **Billing Period** | ${product.subscriptionPeriod} |\n`;
  }
  if (product.trialPeriod) {
    md += `| **Trial Period** | ${product.trialPeriod} |\n`;
  }
  if (product.gracePeriod) {
    md += `| **Grace Period** | ${product.gracePeriod} |\n`;
  }

  // Listings
  const listings = product.listings || {};
  if (Object.keys(listings).length > 0) {
    md += `\n### Listings\n\n`;
    md += `| Locale | Title | Description |\n`;
    md += `|--------|-------|-------------|\n`;
    for (const [locale, listing] of Object.entries(listings)) {
      const desc = listing.description
        ? (listing.description.length > 60 ? listing.description.slice(0, 60) + '...' : listing.description)
        : '-';
      md += `| ${locale} | ${listing.title} | ${desc} |\n`;
    }
  }

  return md;
}

export async function createProduct(
  sku: string,
  defaultLanguage: string,
  title: string,
  description: string,
  purchaseType: 'managedUser' | 'subscription',
  priceMicros: string,
  currency: string,
): Promise<string> {
  const pkg = getPackageName();

  const body: any = {
    packageName: pkg,
    sku,
    status: 'active',
    purchaseType,
    defaultPrice: {
      priceMicros,
      currency,
    },
    defaultLanguage,
    listings: {
      [defaultLanguage]: {
        title,
        description,
      },
    },
  };

  await gpcPost(`/applications/${pkg}/inappproducts`, body);

  let md = `## Product Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **SKU** | ${sku} |\n`;
  md += `| **Title** | ${title} |\n`;
  md += `| **Type** | ${formatPurchaseType(purchaseType)} |\n`;
  md += `| **Price** | ${(parseInt(priceMicros, 10) / 1_000_000).toFixed(2)} ${currency} |\n`;
  md += `| **Language** | ${defaultLanguage} |\n`;

  return md;
}

export async function updateProduct(
  sku: string,
  updates: {
    title?: string;
    description?: string;
    priceMicros?: string;
    currency?: string;
    defaultLanguage?: string;
  },
): Promise<string> {
  const pkg = getPackageName();

  // Get current product first
  const current = await gpcGet<InAppProduct>(
    `/applications/${pkg}/inappproducts/${sku}`,
  );

  const lang = updates.defaultLanguage || current.defaultLanguage;

  if (updates.title || updates.description) {
    if (!current.listings) current.listings = {};
    if (!current.listings[lang]) current.listings[lang] = { title: '', description: '' };
    if (updates.title) current.listings[lang].title = updates.title;
    if (updates.description) current.listings[lang].description = updates.description;
  }

  if (updates.priceMicros && updates.currency) {
    current.defaultPrice = {
      priceMicros: updates.priceMicros,
      currency: updates.currency,
    };
  }

  await gpcPut(`/applications/${pkg}/inappproducts/${sku}`, current);

  let md = `## Product Updated: ${sku}\n\n`;
  md += `| Updated Field | New Value |\n`;
  md += `|---------------|----------|\n`;
  if (updates.title) md += `| **Title** | ${updates.title} |\n`;
  if (updates.description) {
    const preview = updates.description.length > 60 ? updates.description.slice(0, 60) + '...' : updates.description;
    md += `| **Description** | ${preview} |\n`;
  }
  if (updates.priceMicros && updates.currency) {
    md += `| **Price** | ${(parseInt(updates.priceMicros, 10) / 1_000_000).toFixed(2)} ${updates.currency} |\n`;
  }

  return md;
}

export async function deleteProduct(sku: string): Promise<string> {
  const pkg = getPackageName();
  await gpcDelete(`/applications/${pkg}/inappproducts/${sku}`);
  return `## Product Deleted\n\nIn-app product \`${sku}\` has been deleted from \`${pkg}\`.`;
}
