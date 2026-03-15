import { gpcGet, gpcPut, getPackageName } from '../client.js';
import { PROJECT_LOCALES } from '../constants.js';

interface AppDetails {
  defaultLanguage: string;
  contactEmail: string;
  contactPhone: string;
  contactWebsite: string;
}

interface Listing {
  language: string;
  title: string;
  fullDescription: string;
  shortDescription: string;
  video: string;
}

interface ListingsResponse {
  kind: string;
  listings: Listing[];
}

export async function getAppInfo(): Promise<string> {
  const pkg = getPackageName();
  const result = await gpcGet<AppDetails>(`/applications/${pkg}`);

  let md = `## Google Play App Info: ${pkg}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Package Name** | ${pkg} |\n`;
  md += `| **Default Language** | ${result.defaultLanguage || '-'} |\n`;
  md += `| **Contact Email** | ${result.contactEmail || '-'} |\n`;
  md += `| **Contact Phone** | ${result.contactPhone || '-'} |\n`;
  md += `| **Contact Website** | ${result.contactWebsite || '-'} |\n`;

  return md;
}

export async function listListings(): Promise<string> {
  const pkg = getPackageName();
  const result = await gpcGet<ListingsResponse>(`/applications/${pkg}/listings`);

  const listings = result.listings || [];

  if (listings.length === 0) {
    return `## Store Listings\n\nNo listings found for \`${pkg}\`.`;
  }

  let md = `## Google Play Store Listings (${listings.length} locales)\n\n`;
  md += `| Language | Title | Short Description | Video |\n`;
  md += `|----------|-------|-------------------|-------|\n`;

  for (const listing of listings) {
    const shortDesc = listing.shortDescription
      ? (listing.shortDescription.length > 50 ? listing.shortDescription.slice(0, 50) + '...' : listing.shortDescription)
      : '-';
    md += `| ${listing.language} | ${listing.title || '-'} | ${shortDesc} | ${listing.video ? 'Yes' : '-'} |\n`;
  }

  // Check for missing locales
  const existingLocales = listings.map(l => l.language);
  const missingLocales = PROJECT_LOCALES.filter(l => !existingLocales.includes(l));
  if (missingLocales.length > 0) {
    md += `\n> **Warning:** Missing listings for: ${missingLocales.join(', ')}\n`;
  }

  return md;
}

export async function updateListing(
  language: string,
  updates: {
    title?: string;
    fullDescription?: string;
    shortDescription?: string;
    video?: string;
  }
): Promise<string> {
  const pkg = getPackageName();

  // Get existing listing first (to merge updates)
  let existing: Partial<Listing> = {};
  try {
    existing = await gpcGet<Listing>(`/applications/${pkg}/listings/${language}`);
  } catch {
    // Listing might not exist yet, that's OK for PUT (creates or updates)
  }

  const body: Partial<Listing> = {
    language,
    title: updates.title ?? existing.title,
    fullDescription: updates.fullDescription ?? existing.fullDescription,
    shortDescription: updates.shortDescription ?? existing.shortDescription,
    video: updates.video ?? existing.video,
  };

  await gpcPut(`/applications/${pkg}/listings/${language}`, body);

  let md = `## Store Listing Updated: ${language}\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      const preview = value.length > 80 ? value.slice(0, 80) + '...' : value;
      md += `| ${key} | ${preview} |\n`;
    }
  }
  md += `\n**Status:** Updated successfully`;

  return md;
}
