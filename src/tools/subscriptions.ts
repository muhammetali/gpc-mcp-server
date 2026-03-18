import { gpcGet, gpcPatch, gpcPost, getPackageName, escapeMarkdown } from '../client.js';
import { MAX_PAGES } from '../constants.js';

interface BasePlan {
  basePlanId: string;
  state: string;
  autoRenewingBasePlanType?: {
    billingPeriodDuration: string;
    gracePeriodDuration?: string;
    resubscribeState?: string;
    prorationMode?: string;
  };
  prepaidBasePlanType?: {
    billingPeriodDuration: string;
    timeExtension?: string;
  };
  offerTags?: { tag: string }[];
  regionalConfigs?: any[];
}

interface SubscriptionListing {
  languageCode: string;
  title: string;
  description?: string;
  benefits?: string[];
}

interface Subscription {
  productId: string;
  packageName: string;
  basePlans?: BasePlan[];
  listings?: SubscriptionListing[];
  taxAndComplianceSettings?: any;
  archived?: boolean;
}

interface SubscriptionsResponse {
  subscriptions?: Subscription[];
  nextPageToken?: string;
}

function formatDuration(iso: string): string {
  // P1M → 1 month, P1Y → 1 year, P1W → 1 week, P3M → 3 months
  const match = iso.match(/^P(\d+)([YMWD])$/);
  if (!match) return iso;
  const [, num, unit] = match;
  const units: Record<string, string> = { Y: 'year', M: 'month', W: 'week', D: 'day' };
  const u = units[unit] || unit;
  return `${num} ${u}${parseInt(num) > 1 ? 's' : ''}`;
}

export async function listSubscriptions(): Promise<string> {
  const pkg = getPackageName();
  const allSubs: Subscription[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const params: Record<string, string> = {};
    if (pageToken) params.pageToken = pageToken;

    const result = await gpcGet<SubscriptionsResponse>(
      `/applications/${pkg}/subscriptions`,
      params,
    );

    if (result.subscriptions) {
      allSubs.push(...result.subscriptions);
    }
    pageToken = result.nextPageToken;
    pageCount++;
  } while (pageToken && pageCount < MAX_PAGES);

  if (allSubs.length === 0) {
    return `## Subscriptions\n\nNo subscriptions found for \`${pkg}\`.`;
  }

  let md = `## Subscriptions (${allSubs.length})\n\n`;

  for (const sub of allSubs) {
    const title = sub.listings?.[0]?.title || sub.productId;
    const archived = sub.archived ? ' [ARCHIVED]' : '';
    md += `### ${title}${archived}\n`;
    md += `**Product ID:** \`${sub.productId}\`\n\n`;

    // Base plans
    const plans = sub.basePlans || [];
    if (plans.length > 0) {
      md += `| Plan ID | Period | State |\n`;
      md += `|---------|--------|-------|\n`;
      for (const plan of plans) {
        const period = plan.autoRenewingBasePlanType?.billingPeriodDuration
          || plan.prepaidBasePlanType?.billingPeriodDuration
          || '-';
        const type = plan.prepaidBasePlanType ? ' (prepaid)' : '';
        md += `| ${plan.basePlanId} | ${formatDuration(period)}${type} | ${plan.state} |\n`;
      }
    }

    // Listings
    if (sub.listings && sub.listings.length > 0) {
      md += `\n**Listings:**\n`;
      for (const listing of sub.listings) {
        md += `- ${listing.languageCode}: ${listing.title}`;
        if (listing.benefits && listing.benefits.length > 0) {
          md += ` (${listing.benefits.length} benefits)`;
        }
        md += `\n`;
      }
    }

    md += `\n`;
  }

  return md;
}

export async function getSubscription(productId: string): Promise<string> {
  const pkg = getPackageName();
  const sub = await gpcGet<Subscription>(
    `/applications/${pkg}/subscriptions/${productId}`,
  );

  let md = `## Subscription: ${productId}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Product ID** | ${sub.productId} |\n`;
  md += `| **Package** | ${sub.packageName} |\n`;
  md += `| **Archived** | ${sub.archived ? 'Yes' : 'No'} |\n`;

  // Base plans
  const plans = sub.basePlans || [];
  if (plans.length > 0) {
    md += `\n### Base Plans (${plans.length})\n\n`;
    for (const plan of plans) {
      md += `#### ${plan.basePlanId}\n\n`;
      md += `| Field | Value |\n`;
      md += `|-------|-------|\n`;
      md += `| **State** | ${plan.state} |\n`;

      if (plan.autoRenewingBasePlanType) {
        const auto = plan.autoRenewingBasePlanType;
        md += `| **Type** | Auto-renewing |\n`;
        md += `| **Billing Period** | ${formatDuration(auto.billingPeriodDuration)} |\n`;
        if (auto.gracePeriodDuration) {
          md += `| **Grace Period** | ${formatDuration(auto.gracePeriodDuration)} |\n`;
        }
      }

      if (plan.prepaidBasePlanType) {
        const pre = plan.prepaidBasePlanType;
        md += `| **Type** | Prepaid |\n`;
        md += `| **Billing Period** | ${formatDuration(pre.billingPeriodDuration)} |\n`;
      }

      if (plan.offerTags && plan.offerTags.length > 0) {
        md += `| **Tags** | ${plan.offerTags.map(t => t.tag).join(', ')} |\n`;
      }

      md += `\n`;
    }
  }

  // Listings
  if (sub.listings && sub.listings.length > 0) {
    md += `### Listings\n\n`;
    md += `| Locale | Title | Benefits |\n`;
    md += `|--------|-------|----------|\n`;
    for (const listing of sub.listings) {
      const benefits = listing.benefits?.join('; ') || '-';
      const benefitPreview = benefits.length > 60 ? benefits.slice(0, 60) + '...' : benefits;
      md += `| ${listing.languageCode} | ${listing.title} | ${benefitPreview} |\n`;
    }
  }

  return md;
}

export async function createSubscription(
  productId: string,
  defaultLanguage: string,
  title: string,
  basePlanId: string,
  billingPeriod: string,
  description?: string,
  benefits?: string[],
): Promise<string> {
  const pkg = getPackageName();

  const body: any = {
    productId,
    packageName: pkg,
    listings: [
      {
        languageCode: defaultLanguage,
        title,
        description: description || '',
        benefits: benefits || [],
      },
    ],
    basePlans: [
      {
        basePlanId,
        state: 'ACTIVE',
        autoRenewingBasePlanType: {
          billingPeriodDuration: billingPeriod,
        },
      },
    ],
  };

  await gpcPost(`/applications/${pkg}/subscriptions`, body);

  let md = `## Subscription Created\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Product ID** | ${productId} |\n`;
  md += `| **Title** | ${title} |\n`;
  md += `| **Base Plan** | ${basePlanId} |\n`;
  md += `| **Billing Period** | ${formatDuration(billingPeriod)} |\n`;

  return md;
}

export async function updateSubscription(
  productId: string,
  updates: {
    title?: string;
    description?: string;
    languageCode?: string;
    benefits?: string[];
  },
): Promise<string> {
  const pkg = getPackageName();

  // Get current subscription
  const current = await gpcGet<Subscription>(
    `/applications/${pkg}/subscriptions/${productId}`,
  );

  if (updates.title || updates.description || updates.benefits) {
    const lang = updates.languageCode || current.listings?.[0]?.languageCode || 'en-US';
    const existingListing = current.listings?.find(l => l.languageCode === lang);

    if (existingListing) {
      if (updates.title) existingListing.title = updates.title;
      if (updates.description) existingListing.description = updates.description;
      if (updates.benefits) existingListing.benefits = updates.benefits;
    } else {
      if (!current.listings) current.listings = [];
      current.listings.push({
        languageCode: lang,
        title: updates.title || productId,
        description: updates.description,
        benefits: updates.benefits,
      });
    }
  }

  await gpcPatch(`/applications/${pkg}/subscriptions/${productId}`, current);

  let md = `## Subscription Updated: ${productId}\n\n`;
  md += `| Updated Field | New Value |\n`;
  md += `|---------------|----------|\n`;
  if (updates.title) md += `| **Title** | ${updates.title} |\n`;
  if (updates.description) {
    const preview = updates.description.length > 60 ? updates.description.slice(0, 60) + '...' : updates.description;
    md += `| **Description** | ${preview} |\n`;
  }
  if (updates.benefits) md += `| **Benefits** | ${updates.benefits.join(', ')} |\n`;

  return md;
}
