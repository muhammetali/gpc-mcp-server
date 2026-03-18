import { gpcPost, getPackageName } from '../client.js';

interface ConvertedRegionPrice {
  regionCode: string;
  taxAmount: { priceMicros: string; currencyCode: string };
  price: { priceMicros: string; currencyCode: string };
}

interface ConvertRegionPricesResponse {
  convertedRegionPrices?: Record<string, ConvertedRegionPrice>;
}

export async function convertRegionPrices(
  priceMicros: string,
  currency: string,
): Promise<string> {
  const pkg = getPackageName();

  const result = await gpcPost<ConvertRegionPricesResponse>(
    `/applications/${pkg}/pricing:convertRegionPrices`,
    {
      price: {
        priceMicros,
        currencyCode: currency,
      },
    },
  );

  const converted = result.convertedRegionPrices || {};
  const regions = Object.entries(converted);

  if (regions.length === 0) {
    return `## Region Prices\n\nNo region prices returned for ${(parseInt(priceMicros, 10) / 1_000_000).toFixed(2)} ${currency}.`;
  }

  const basePrice = (parseInt(priceMicros, 10) / 1_000_000).toFixed(2);

  let md = `## Converted Region Prices\n\n`;
  md += `**Base price:** ${basePrice} ${currency}\n\n`;
  md += `| Region | Price | Currency | Tax |\n`;
  md += `|--------|-------|----------|-----|\n`;

  for (const [regionCode, data] of regions) {
    const price = (parseInt(data.price.priceMicros, 10) / 1_000_000).toFixed(2);
    const tax = data.taxAmount ? (parseInt(data.taxAmount.priceMicros, 10) / 1_000_000).toFixed(2) : '0.00';
    md += `| ${regionCode} | ${price} | ${data.price.currencyCode} | ${tax} |\n`;
  }

  md += `\n**Total regions:** ${regions.length}`;

  return md;
}
