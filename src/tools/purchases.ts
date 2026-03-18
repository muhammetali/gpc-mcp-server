import { gpcGet, gpcPost, getPackageName } from '../client.js';

// ============================================================================
// Product Purchase Verification
// ============================================================================

interface ProductPurchase {
  kind: string;
  purchaseTimeMillis: string;
  purchaseState: number; // 0=Purchased, 1=Canceled, 2=Pending
  consumptionState: number; // 0=Yet to be consumed, 1=Consumed
  developerPayload: string;
  orderId: string;
  purchaseType?: number; // 0=Test, 1=Promo, 2=Rewarded
  acknowledgementState: number; // 0=Not acknowledged, 1=Acknowledged
  purchaseToken: string;
  productId: string;
  quantity?: number;
  regionCode?: string;
}

function formatPurchaseState(state: number): string {
  switch (state) {
    case 0: return 'Purchased';
    case 1: return 'Canceled';
    case 2: return 'Pending';
    default: return `Unknown (${state})`;
  }
}

function formatTimestamp(millis: string): string {
  return new Date(parseInt(millis, 10)).toISOString().replace('T', ' ').slice(0, 19);
}

export async function verifyProductPurchase(
  productId: string,
  token: string,
): Promise<string> {
  const pkg = getPackageName();
  const purchase = await gpcGet<ProductPurchase>(
    `/applications/${pkg}/purchases/products/${productId}/tokens/${token}`,
  );

  let md = `## Product Purchase Verification\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Product ID** | ${productId} |\n`;
  md += `| **Order ID** | ${purchase.orderId} |\n`;
  md += `| **State** | ${formatPurchaseState(purchase.purchaseState)} |\n`;
  md += `| **Acknowledged** | ${purchase.acknowledgementState === 1 ? 'Yes' : 'No'} |\n`;
  md += `| **Consumed** | ${purchase.consumptionState === 1 ? 'Yes' : 'No'} |\n`;
  md += `| **Purchase Time** | ${formatTimestamp(purchase.purchaseTimeMillis)} |\n`;
  if (purchase.regionCode) md += `| **Region** | ${purchase.regionCode} |\n`;
  if (purchase.quantity) md += `| **Quantity** | ${purchase.quantity} |\n`;
  if (purchase.purchaseType !== undefined) {
    const types = ['Test', 'Promo', 'Rewarded'];
    md += `| **Type** | ${types[purchase.purchaseType] || purchase.purchaseType} |\n`;
  }

  return md;
}

export async function acknowledgeProductPurchase(
  productId: string,
  token: string,
): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/purchases/products/${productId}/tokens/${token}:acknowledge`,
    {},
  );
  return `## Purchase Acknowledged\n\nProduct \`${productId}\` purchase has been acknowledged.`;
}

export async function consumeProductPurchase(
  productId: string,
  token: string,
): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/purchases/products/${productId}/tokens/${token}:consume`,
    {},
  );
  return `## Purchase Consumed\n\nProduct \`${productId}\` purchase has been consumed. The user can purchase it again.`;
}

// ============================================================================
// Subscription Purchase Verification (v2)
// ============================================================================

interface SubscriptionPurchaseV2 {
  kind: string;
  regionCode?: string;
  latestOrderId?: string;
  lineItems?: SubscriptionLineItem[];
  startTime?: string;
  subscriptionState?: string;
  linkedPurchaseToken?: string;
  canceledStateContext?: any;
  externalAccountIdentifiers?: any;
  acknowledgementState?: string;
}

interface SubscriptionLineItem {
  productId: string;
  expiryTime?: string;
  autoRenewingPlan?: { autoRenewEnabled: boolean };
  prepaidPlan?: { allowExtendAfterTime?: string };
  offerDetails?: { basePlanId: string; offerId?: string; offerTags?: string[] };
}

export async function getSubscriptionPurchase(token: string): Promise<string> {
  const pkg = getPackageName();
  const sub = await gpcGet<SubscriptionPurchaseV2>(
    `/applications/${pkg}/purchases/subscriptionsv2/tokens/${token}`,
  );

  let md = `## Subscription Purchase\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **State** | ${sub.subscriptionState || '-'} |\n`;
  md += `| **Order ID** | ${sub.latestOrderId || '-'} |\n`;
  md += `| **Region** | ${sub.regionCode || '-'} |\n`;
  md += `| **Acknowledged** | ${sub.acknowledgementState || '-'} |\n`;
  if (sub.startTime) md += `| **Start Time** | ${sub.startTime} |\n`;

  if (sub.lineItems && sub.lineItems.length > 0) {
    md += `\n### Line Items\n\n`;
    md += `| Product | Base Plan | Expiry | Auto-Renew |\n`;
    md += `|---------|-----------|--------|------------|\n`;
    for (const item of sub.lineItems) {
      const basePlan = item.offerDetails?.basePlanId || '-';
      const expiry = item.expiryTime || '-';
      const autoRenew = item.autoRenewingPlan?.autoRenewEnabled ? 'Yes' : 'No';
      md += `| ${item.productId} | ${basePlan} | ${expiry} | ${autoRenew} |\n`;
    }
  }

  return md;
}

export async function cancelSubscriptionPurchase(token: string): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/purchases/subscriptionsv2/tokens/${token}:cancel`,
    { cancellationReason: 'CANCELLATION_REASON_USER_CANCELED' },
  );
  return `## Subscription Canceled\n\nThe subscription has been canceled. The user will retain access until the end of the current billing period.`;
}

export async function revokeSubscriptionPurchase(token: string): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/purchases/subscriptionsv2/tokens/${token}:revoke`,
    {},
  );
  return `## Subscription Revoked\n\nThe subscription has been revoked. Access is removed immediately.\n\n> **Warning:** This action cannot be undone.`;
}

export async function deferSubscriptionBilling(
  token: string,
  desiredExpiryTime: string,
): Promise<string> {
  const pkg = getPackageName();
  await gpcPost(
    `/applications/${pkg}/purchases/subscriptionsv2/tokens/${token}:defer`,
    {
      deferralInfo: {
        desiredExpiryTime,
      },
    },
  );
  return `## Billing Deferred\n\nSubscription billing has been deferred until \`${desiredExpiryTime}\`.\n\nThe user retains access without being charged until the new expiry time.`;
}

// ============================================================================
// Voided Purchases (Fraud / Chargeback Detection)
// ============================================================================

interface VoidedPurchase {
  purchaseToken: string;
  purchaseTimeMillis: string;
  voidedTimeMillis: string;
  orderId: string;
  voidedSource: number; // 0=User, 1=Developer, 2=Google
  voidedReason: number; // 0=Other, 1=Remorse, 2=Not_received, 3=Defective, 4=Accidental, 5=Fraud, 6=Friendly_fraud, 7=Chargeback
  kind: string;
  voidedQuantity?: number;
}

interface VoidedPurchasesResponse {
  voidedPurchases?: VoidedPurchase[];
  tokenPagination?: { nextPageToken?: string };
}

function formatVoidedSource(source: number): string {
  switch (source) {
    case 0: return 'User';
    case 1: return 'Developer';
    case 2: return 'Google';
    default: return `Unknown (${source})`;
  }
}

function formatVoidedReason(reason: number): string {
  switch (reason) {
    case 0: return 'Other';
    case 1: return 'Remorse';
    case 2: return 'Not received';
    case 3: return 'Defective';
    case 4: return 'Accidental';
    case 5: return 'Fraud';
    case 6: return 'Friendly fraud';
    case 7: return 'Chargeback';
    default: return `Unknown (${reason})`;
  }
}

export async function listVoidedPurchases(
  startTime?: string,
  endTime?: string,
  maxResults: number = 50,
  type?: number,
): Promise<string> {
  const pkg = getPackageName();
  const params: Record<string, string> = {
    maxResults: String(maxResults),
  };
  if (startTime) params.startTime = startTime;
  if (endTime) params.endTime = endTime;
  if (type !== undefined) params.type = String(type);

  const result = await gpcGet<VoidedPurchasesResponse>(
    `/applications/${pkg}/purchases/voidedpurchases`,
    params,
  );

  const purchases = result.voidedPurchases || [];

  if (purchases.length === 0) {
    return `## Voided Purchases\n\nNo voided purchases found for the specified period.`;
  }

  let md = `## Voided Purchases (${purchases.length})\n\n`;

  // Summary
  const fraudCount = purchases.filter(p => p.voidedReason >= 5).length;
  const chargebackCount = purchases.filter(p => p.voidedReason === 7).length;
  if (fraudCount > 0 || chargebackCount > 0) {
    md += `> **Alert:** ${fraudCount} fraud-related, ${chargebackCount} chargebacks detected\n\n`;
  }

  md += `| Order ID | Voided Time | Source | Reason |\n`;
  md += `|----------|-------------|--------|--------|\n`;

  for (const p of purchases) {
    const voidedTime = formatTimestamp(p.voidedTimeMillis);
    const source = formatVoidedSource(p.voidedSource);
    const reason = formatVoidedReason(p.voidedReason);
    md += `| ${p.orderId} | ${voidedTime} | ${source} | ${reason} |\n`;
  }

  return md;
}
