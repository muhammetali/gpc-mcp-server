import { gpcGet, gpcPost, gpcPatch, gpcDelete, getPackageName } from '../client.js';

// ============================================================================
// Base Plan Management
// ============================================================================

export async function activateBasePlan(
  productId: string,
  basePlanId: string,
): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/subscriptions/${productId}/basePlans/${basePlanId}:activate`,
    {},
  );
  return `## Base Plan Activated\n\nBase plan \`${basePlanId}\` on subscription \`${productId}\` is now **ACTIVE**.`;
}

export async function deactivateBasePlan(
  productId: string,
  basePlanId: string,
): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/subscriptions/${productId}/basePlans/${basePlanId}:deactivate`,
    {},
  );
  return `## Base Plan Deactivated\n\nBase plan \`${basePlanId}\` on subscription \`${productId}\` is now **INACTIVE**.\n\n> Existing subscribers will not be affected. New users cannot subscribe to this plan.`;
}

export async function deleteBasePlan(
  productId: string,
  basePlanId: string,
): Promise<string> {
  const pkg = getPackageName();
  await gpcDelete(
    `/applications/${pkg}/subscriptions/${productId}/basePlans/${basePlanId}`,
  );
  return `## Base Plan Deleted\n\nBase plan \`${basePlanId}\` has been deleted from subscription \`${productId}\`.\n\n> **Warning:** This action cannot be undone.`;
}

export async function migrateBasePlanPrices(
  productId: string,
  basePlanId: string,
  latestAcceptablePriceMicros: string,
  currency: string,
): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/subscriptions/${productId}/basePlans/${basePlanId}:migratePrices`,
    {
      regionalPriceMigrations: [{
        regionCode: 'US',
        oldestAllowedPriceVersionTime: new Date().toISOString(),
        priceIncreaseMicros: latestAcceptablePriceMicros,
        currency,
      }],
    },
  );

  return `## Price Migration Initiated\n\nPrice migration for base plan \`${basePlanId}\` on subscription \`${productId}\` has been initiated.\n\n> Subscribers will be notified of the price change according to Google Play's price change policies.`;
}

// ============================================================================
// Subscription Offers
// ============================================================================

interface SubscriptionOffer {
  productId: string;
  basePlanId: string;
  offerId: string;
  state: string;
  offerTags?: { tag: string }[];
  phases?: OfferPhase[];
  targeting?: any;
}

interface OfferPhase {
  recurrenceCount: number;
  duration: string;
  pricingInfo?: {
    basePlanPhase?: {};
    discountedPrice?: { priceMicros: string; currency: string };
    freePhase?: {};
  };
}

interface OffersResponse {
  subscriptionOffers?: SubscriptionOffer[];
  nextPageToken?: string;
}

export async function listOffers(
  productId: string,
  basePlanId: string,
): Promise<string> {
  const pkg = getPackageName();
  const result = await gpcGet<OffersResponse>(
    `/applications/${pkg}/subscriptions/${productId}/basePlans/${basePlanId}/offers`,
  );

  const offers = result.subscriptionOffers || [];

  if (offers.length === 0) {
    return `## Subscription Offers\n\nNo offers found for plan \`${basePlanId}\` on subscription \`${productId}\`.`;
  }

  let md = `## Subscription Offers (${offers.length})\n\n`;
  md += `**Subscription:** ${productId} / **Plan:** ${basePlanId}\n\n`;
  md += `| Offer ID | State | Tags | Phases |\n`;
  md += `|----------|-------|------|--------|\n`;

  for (const offer of offers) {
    const tags = offer.offerTags?.map(t => t.tag).join(', ') || '-';
    const phases = offer.phases?.length || 0;
    md += `| ${offer.offerId} | ${offer.state} | ${tags} | ${phases} |\n`;
  }

  return md;
}

export async function getOffer(
  productId: string,
  basePlanId: string,
  offerId: string,
): Promise<string> {
  const pkg = getPackageName();
  const offer = await gpcGet<SubscriptionOffer>(
    `/applications/${pkg}/subscriptions/${productId}/basePlans/${basePlanId}/offers/${offerId}`,
  );

  let md = `## Offer: ${offerId}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Product** | ${offer.productId} |\n`;
  md += `| **Base Plan** | ${offer.basePlanId} |\n`;
  md += `| **Offer ID** | ${offer.offerId} |\n`;
  md += `| **State** | ${offer.state} |\n`;
  if (offer.offerTags) {
    md += `| **Tags** | ${offer.offerTags.map(t => t.tag).join(', ')} |\n`;
  }

  if (offer.phases && offer.phases.length > 0) {
    md += `\n### Phases (${offer.phases.length})\n\n`;
    md += `| # | Duration | Recurrences | Type |\n`;
    md += `|---|----------|-------------|------|\n`;
    for (let i = 0; i < offer.phases.length; i++) {
      const phase = offer.phases[i];
      let type = 'Base price';
      if (phase.pricingInfo?.freePhase) type = 'Free trial';
      else if (phase.pricingInfo?.discountedPrice) {
        const price = phase.pricingInfo.discountedPrice;
        type = `Discounted (${(parseInt(price.priceMicros, 10) / 1_000_000).toFixed(2)} ${price.currency})`;
      }
      md += `| ${i + 1} | ${phase.duration} | ${phase.recurrenceCount} | ${type} |\n`;
    }
  }

  return md;
}

export async function createOffer(
  productId: string,
  basePlanId: string,
  offerId: string,
  phases: { duration: string; recurrenceCount: number; type: 'free' | 'discounted' | 'base'; priceMicros?: string; currency?: string }[],
  offerTags?: string[],
): Promise<string> {
  const pkg = getPackageName();

  const offerPhases: OfferPhase[] = phases.map(p => {
    const phase: OfferPhase = {
      duration: p.duration,
      recurrenceCount: p.recurrenceCount,
    };
    if (p.type === 'free') {
      phase.pricingInfo = { freePhase: {} };
    } else if (p.type === 'discounted' && p.priceMicros && p.currency) {
      phase.pricingInfo = {
        discountedPrice: { priceMicros: p.priceMicros, currency: p.currency },
      };
    } else {
      phase.pricingInfo = { basePlanPhase: {} };
    }
    return phase;
  });

  const body: any = {
    productId,
    basePlanId,
    offerId,
    phases: offerPhases,
  };

  if (offerTags && offerTags.length > 0) {
    body.offerTags = offerTags.map(tag => ({ tag }));
  }

  await gpcPost(
    `/applications/${pkg}/subscriptions/${productId}/basePlans/${basePlanId}/offers`,
    body,
  );

  let md = `## Offer Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Product** | ${productId} |\n`;
  md += `| **Base Plan** | ${basePlanId} |\n`;
  md += `| **Offer ID** | ${offerId} |\n`;
  md += `| **Phases** | ${phases.length} |\n`;
  if (offerTags) md += `| **Tags** | ${offerTags.join(', ')} |\n`;
  md += `\n> Use \`gpc_activate_offer\` to make this offer available to users.`;

  return md;
}

export async function activateOffer(
  productId: string,
  basePlanId: string,
  offerId: string,
): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/subscriptions/${productId}/basePlans/${basePlanId}/offers/${offerId}:activate`,
    {},
  );
  return `## Offer Activated\n\nOffer \`${offerId}\` on plan \`${basePlanId}\` (subscription \`${productId}\`) is now **ACTIVE**.`;
}

export async function deactivateOffer(
  productId: string,
  basePlanId: string,
  offerId: string,
): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/subscriptions/${productId}/basePlans/${basePlanId}/offers/${offerId}:deactivate`,
    {},
  );
  return `## Offer Deactivated\n\nOffer \`${offerId}\` on plan \`${basePlanId}\` (subscription \`${productId}\`) is now **INACTIVE**.`;
}

export async function deleteOffer(
  productId: string,
  basePlanId: string,
  offerId: string,
): Promise<string> {
  const pkg = getPackageName();
  await gpcDelete(
    `/applications/${pkg}/subscriptions/${productId}/basePlans/${basePlanId}/offers/${offerId}`,
  );
  return `## Offer Deleted\n\nOffer \`${offerId}\` has been deleted from plan \`${basePlanId}\` (subscription \`${productId}\`).`;
}
