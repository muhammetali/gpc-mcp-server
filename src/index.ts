#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PROJECT_LOCALES, TRACK_TYPES, IMAGE_TYPES } from './constants.js';

// Load .env from the package directory
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

// Zod schemas for validation (reused across tools)
const localeSchema = z.enum(PROJECT_LOCALES).describe('Locale code (en-US, tr-TR, de-DE, es-419, fr-FR, ru-RU, ar)');
const trackSchema = z.enum(TRACK_TYPES).describe('Release track (internal, alpha, beta, production)');
const imageTypeSchema = z.enum(IMAGE_TYPES).describe('Image type (phoneScreenshots, sevenInchScreenshots, tenInchScreenshots, tvScreenshots, wearScreenshots, icon, featureGraphic, tvBanner)');

// Tool implementations
import { getAppInfo, listListings, updateListing, updateAppDetails, deleteListing } from './tools/listings.js';
import {
  listTracks, createRelease, updateReleaseNotes,
  setRollout, haltRollout, promoteRelease,
} from './tools/tracks.js';
import { listReviews, replyReview } from './tools/reviews.js';
import { getAcquisitionReport, getCrashReport } from './tools/reports.js';
import { listImages, uploadImage, deleteImage, deleteAllImages } from './tools/images.js';
import { uploadBundle, listBundles, uploadAab, uploadMapping } from './tools/bundles.js';
import { listProducts, getProduct, createProduct, updateProduct, deleteProduct } from './tools/products.js';
import { listSubscriptions, getSubscription, createSubscription, updateSubscription } from './tools/subscriptions.js';
import { listTesters, updateTesters } from './tools/testers.js';
import {
  verifyProductPurchase, acknowledgeProductPurchase, consumeProductPurchase,
  getSubscriptionPurchase, cancelSubscriptionPurchase, revokeSubscriptionPurchase,
  deferSubscriptionBilling, listVoidedPurchases,
} from './tools/purchases.js';
import { refundOrder } from './tools/orders.js';
import {
  listRecoveryActions, createRecoveryAction,
  deployRecoveryAction, cancelRecoveryAction,
} from './tools/recovery.js';
import {
  activateBasePlan, deactivateBasePlan, deleteBasePlan, migrateBasePlanPrices,
  listOffers, getOffer, createOffer, activateOffer, deactivateOffer, deleteOffer,
} from './tools/offers.js';
import { convertRegionPrices } from './tools/pricing.js';
import { listCountryAvailability } from './tools/countries.js';
import { uploadInternalBundle } from './tools/sharing.js';
import { listGeneratedApks, listApks } from './tools/apks.js';
import { GPCClientError } from './client.js';

const server = new McpServer({
  name: 'gpc-mcp-server',
  version: '1.0.0',
  description: 'Google Play Console MCP Server - Manage app listings, releases, reviews, reports, and screenshots.',
});

// Helper: wrap tool handlers with error handling
function handleError(error: unknown): string {
  if (error instanceof GPCClientError) {
    return `**Google Play API Error (${error.status})**\n\n${error.message}\n\n${getErrorHelp(error)}`;
  }
  if (error instanceof Error) {
    return `**Error:** ${error.message}`;
  }
  return `**Error:** ${String(error)}`;
}

function getErrorHelp(error: GPCClientError): string {
  switch (error.error.status) {
    case 'FORBIDDEN':
    case 'PERMISSION_DENIED':
      return '> Check service account permissions in Google Play Console > Setup > API access.\n> Ensure the service account has "Admin" or "Release manager" role.';
    case 'NOT_FOUND':
      return '> The requested resource was not found. Verify the package name and IDs are correct.';
    case 'RATE_LIMITED':
      return '> Rate limited by Google. Wait 30 seconds and try again.';
    case 'INVALID_ARGUMENT':
      return '> Invalid argument. Check that all required fields are correct.';
    case 'FAILED_PRECONDITION':
      return '> Precondition failed. The resource may be in an incompatible state.';
    default:
      return '';
  }
}

// =============================================================================
// APP & LISTINGS
// =============================================================================

server.tool(
  'gpc_get_app_info',
  'Get app details (package name, default language, contact info) from Google Play Console.',
  {},
  async () => {
    try {
      const result = await getAppInfo();
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_list_listings',
  'List all store listings across locales (title, description, short description). Warns about missing locales.',
  {},
  async () => {
    try {
      const result = await listListings();
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_update_listing',
  'Update store listing for a specific locale (title, description, short description, video URL).',
  {
    language: localeSchema,
    title: z.string().optional().describe('App title (max 30 chars)'),
    fullDescription: z.string().optional().describe('Full description (max 4000 chars)'),
    shortDescription: z.string().optional().describe('Short description (max 80 chars)'),
    video: z.string().optional().describe('YouTube video URL'),
  },
  async ({ language, ...updates }) => {
    try {
      const result = await updateListing(language, updates);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// RELEASE & TRACK MANAGEMENT
// =============================================================================

server.tool(
  'gpc_list_tracks',
  'List all tracks (internal, alpha, beta, production) with their releases, version codes, and rollout status.',
  {},
  async () => {
    try {
      const result = await listTracks();
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_create_release',
  'Create a new release on a track. Specify version code, release notes, and optionally staged rollout percentage.',
  {
    track: trackSchema,
    versionCode: z.string().describe('Version code of the AAB/APK already uploaded to Google Play'),
    releaseNotes: z.record(z.string(), z.string()).describe('Object of locale -> release notes. E.g., {"en-US": "Bug fixes", "tr-TR": "Hata duzeltmeleri"}'),
    releaseName: z.string().optional().describe('Release name (e.g., "2.1.0-rc1")'),
    status: z.enum(['draft', 'inProgress', 'completed']).default('draft').describe('Release status: draft, inProgress (staged rollout), or completed (full rollout)'),
    userFraction: z.number().min(0.01).max(1.0).optional().describe('Rollout fraction (0.01-1.0). Only used when status is inProgress.'),
  },
  async ({ track, versionCode, releaseNotes, releaseName, status, userFraction }) => {
    try {
      const result = await createRelease(track, versionCode, releaseNotes, releaseName, status, userFraction);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_update_release_notes',
  'Update release notes for the latest release on a track. Pass locale -> text for all locales.',
  {
    track: trackSchema,
    releaseNotes: z.record(z.string(), z.string()).describe('Object of locale -> release notes text'),
  },
  async ({ track, releaseNotes }) => {
    try {
      const result = await updateReleaseNotes(track, releaseNotes);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_set_rollout',
  'Set or update the staged rollout percentage for a production release. Set to 1.0 to complete rollout.',
  {
    track: trackSchema.default('production'),
    userFraction: z.number().min(0.01).max(1.0).describe('Rollout fraction (0.01-1.0). Use 1.0 to complete the rollout to 100%.'),
  },
  async ({ track, userFraction }) => {
    try {
      const result = await setRollout(track, userFraction);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_halt_rollout',
  'Halt (pause) an ongoing staged rollout. The release stays in halted state until resumed.',
  {
    track: trackSchema.default('production'),
  },
  async ({ track }) => {
    try {
      const result = await haltRollout(track);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_promote_release',
  'Promote a release from one track to another (e.g., internal → beta → production). Copies the latest release with its version codes and release notes.',
  {
    fromTrack: trackSchema.describe('Source track to promote from'),
    toTrack: trackSchema.describe('Destination track to promote to'),
    status: z.enum(['draft', 'inProgress', 'completed']).default('completed').describe('Release status on destination track'),
    userFraction: z.number().min(0.01).max(1.0).optional().describe('Staged rollout fraction (only for inProgress status)'),
  },
  async ({ fromTrack, toTrack, status, userFraction }) => {
    try {
      const result = await promoteRelease(fromTrack, toTrack, status, userFraction);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// REVIEWS
// =============================================================================

server.tool(
  'gpc_list_reviews',
  'List recent user reviews with ratings, comments, and reply status. Highlights unreplied low-rating reviews.',
  {
    maxResults: z.number().min(1).max(100).default(20).describe('Number of reviews to fetch (max 100)'),
    translationLanguage: z.string().optional().describe('Translate reviews to this language (BCP 47 code, e.g., "en")'),
  },
  async ({ maxResults, translationLanguage }) => {
    try {
      const result = await listReviews(maxResults, translationLanguage);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_reply_review',
  'Reply to a user review. Use to respond to feedback, report issues, or thank users.',
  {
    reviewId: z.string().describe('Review ID (from gpc_list_reviews)'),
    replyText: z.string().describe('Reply text to the reviewer'),
  },
  async ({ reviewId, replyText }) => {
    try {
      const result = await replyReview(reviewId, replyText);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// REPORTS & VITALS
// =============================================================================

server.tool(
  'gpc_acquisition_report',
  'Get install/acquisition statistics for a date range. Shows store acquisitions and listing visitors.',
  {
    startDate: z.string().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().describe('End date (YYYY-MM-DD)'),
  },
  async ({ startDate, endDate }) => {
    try {
      const result = await getAcquisitionReport(startDate, endDate);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_crash_report',
  'Get crash and ANR rates from Android vitals. Shows crash rate, user-perceived crash rate, and affected users.',
  {
    startDate: z.string().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().describe('End date (YYYY-MM-DD)'),
  },
  async ({ startDate, endDate }) => {
    try {
      const result = await getCrashReport(startDate, endDate);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// BUNDLES (AAB UPLOAD)
// =============================================================================

server.tool(
  'gpc_upload_bundle',
  'Upload an Android App Bundle (.aab) file to Google Play. Returns the version code for use with gpc_create_release.',
  {
    filePath: z.string().describe('Absolute path to the .aab file on disk'),
  },
  async ({ filePath }) => {
    try {
      const result = await uploadBundle(filePath);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_list_bundles',
  'List all uploaded bundles with their version codes. Useful to verify uploads before creating releases.',
  {},
  async () => {
    try {
      const result = await listBundles();
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// SCREENSHOTS & IMAGES
// =============================================================================

server.tool(
  'gpc_list_images',
  'List uploaded images (screenshots, feature graphic, icon) for a locale and image type.',
  {
    language: localeSchema,
    imageType: imageTypeSchema,
  },
  async ({ language, imageType }) => {
    try {
      const result = await listImages(language, imageType);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_upload_image',
  'Upload a screenshot, feature graphic, or icon image for a locale.',
  {
    language: localeSchema,
    imageType: imageTypeSchema,
    filePath: z.string().describe('Absolute path to the image file on disk (PNG, JPEG, or WebP)'),
  },
  async ({ language, imageType, filePath }) => {
    try {
      const result = await uploadImage(language, imageType, filePath);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_delete_image',
  'Delete a single image by ID from a locale and image type.',
  {
    language: localeSchema,
    imageType: imageTypeSchema,
    imageId: z.string().describe('Image ID (from gpc_list_images)'),
  },
  async ({ language, imageType, imageId }) => {
    try {
      const result = await deleteImage(language, imageType, imageId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// COMBINED AAB UPLOAD + RELEASE
// =============================================================================

server.tool(
  'gpc_upload_aab',
  'Upload an AAB file and create a release in one step. Combines upload + release + commit into a single operation.',
  {
    filePath: z.string().describe('Absolute path to the .aab file on disk'),
    track: trackSchema,
    releaseNotes: z.record(z.string(), z.string()).describe('Object of locale -> release notes. E.g., {"en-US": "Bug fixes", "tr-TR": "Hata duzeltmeleri"}'),
    releaseName: z.string().optional().describe('Release name (e.g., "2.1.0")'),
    status: z.enum(['draft', 'inProgress', 'completed']).default('completed').describe('Release status: draft, inProgress (staged rollout), or completed (full rollout)'),
    userFraction: z.number().min(0.01).max(1.0).optional().describe('Rollout fraction (0.01-1.0). Only used when status is inProgress.'),
  },
  async ({ filePath, track, releaseNotes, releaseName, status, userFraction }) => {
    try {
      const result = await uploadAab(filePath, track, releaseNotes, releaseName, status, userFraction);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// DEOBFUSCATION / MAPPING FILES
// =============================================================================

server.tool(
  'gpc_upload_mapping',
  'Upload a ProGuard/R8 mapping file for a version code. Enables deobfuscated crash stack traces in Play Console.',
  {
    versionCode: z.number().describe('Version code of the build to attach the mapping file to'),
    filePath: z.string().describe('Absolute path to the mapping file (.txt or .map)'),
  },
  async ({ versionCode, filePath }) => {
    try {
      const result = await uploadMapping(versionCode, filePath);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// IN-APP PRODUCTS
// =============================================================================

server.tool(
  'gpc_list_products',
  'List all in-app products (managed products and legacy subscriptions) with SKU, price, and status.',
  {},
  async () => {
    try {
      const result = await listProducts();
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_get_product',
  'Get detailed information about a specific in-app product by SKU.',
  {
    sku: z.string().describe('Product SKU/ID (from gpc_list_products)'),
  },
  async ({ sku }) => {
    try {
      const result = await getProduct(sku);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_create_product',
  'Create a new in-app product. Price is in micros (e.g., "990000" = $0.99).',
  {
    sku: z.string().describe('Unique product ID/SKU'),
    defaultLanguage: z.string().describe('Default language code (e.g., "en-US")'),
    title: z.string().describe('Product title'),
    description: z.string().describe('Product description'),
    purchaseType: z.enum(['managedUser', 'subscription']).describe('Product type: managedUser (one-time) or subscription (legacy)'),
    priceMicros: z.string().describe('Price in micros (1,000,000 = $1.00). E.g., "990000" for $0.99'),
    currency: z.string().describe('Currency code (e.g., "USD", "TRY", "EUR")'),
  },
  async ({ sku, defaultLanguage, title, description, purchaseType, priceMicros, currency }) => {
    try {
      const result = await createProduct(sku, defaultLanguage, title, description, purchaseType, priceMicros, currency);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_update_product',
  'Update an existing in-app product (title, description, price).',
  {
    sku: z.string().describe('Product SKU/ID to update'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    priceMicros: z.string().optional().describe('New price in micros'),
    currency: z.string().optional().describe('Currency code (required if priceMicros is set)'),
    defaultLanguage: z.string().optional().describe('Language code for the listing to update'),
  },
  async ({ sku, ...updates }) => {
    try {
      const result = await updateProduct(sku, updates);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_delete_product',
  'Delete an in-app product by SKU. This action cannot be undone.',
  {
    sku: z.string().describe('Product SKU/ID to delete'),
  },
  async ({ sku }) => {
    try {
      const result = await deleteProduct(sku);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// SUBSCRIPTIONS (New Monetization API)
// =============================================================================

server.tool(
  'gpc_list_subscriptions',
  'List all subscriptions with their base plans, billing periods, and listings.',
  {},
  async () => {
    try {
      const result = await listSubscriptions();
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_get_subscription',
  'Get detailed information about a specific subscription product.',
  {
    productId: z.string().describe('Subscription product ID'),
  },
  async ({ productId }) => {
    try {
      const result = await getSubscription(productId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_create_subscription',
  'Create a new subscription product with a base plan.',
  {
    productId: z.string().describe('Unique subscription product ID'),
    defaultLanguage: z.string().describe('Default language code (e.g., "en-US")'),
    title: z.string().describe('Subscription title'),
    basePlanId: z.string().describe('Base plan ID (e.g., "monthly", "yearly")'),
    billingPeriod: z.string().describe('ISO 8601 billing period (P1M = monthly, P1Y = yearly, P1W = weekly)'),
    description: z.string().optional().describe('Subscription description'),
    benefits: z.array(z.string()).optional().describe('List of subscription benefits shown to users'),
  },
  async ({ productId, defaultLanguage, title, basePlanId, billingPeriod, description, benefits }) => {
    try {
      const result = await createSubscription(productId, defaultLanguage, title, basePlanId, billingPeriod, description, benefits);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_update_subscription',
  'Update a subscription listing (title, description, benefits).',
  {
    productId: z.string().describe('Subscription product ID to update'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    languageCode: z.string().optional().describe('Language code for the listing to update'),
    benefits: z.array(z.string()).optional().describe('Updated list of benefits'),
  },
  async ({ productId, ...updates }) => {
    try {
      const result = await updateSubscription(productId, updates);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// TESTER MANAGEMENT
// =============================================================================

server.tool(
  'gpc_list_testers',
  'List testers (Google Groups) configured for a specific track.',
  {
    track: trackSchema,
  },
  async ({ track }) => {
    try {
      const result = await listTesters(track);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_update_testers',
  'Set Google Groups for a testing track. Replaces the existing tester list.',
  {
    track: trackSchema,
    googleGroups: z.array(z.string()).describe('List of Google Group email addresses for testing'),
  },
  async ({ track, googleGroups }) => {
    try {
      const result = await updateTesters(track, googleGroups);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// PURCHASE VERIFICATION
// =============================================================================

server.tool(
  'gpc_verify_purchase',
  'Verify a one-time product purchase by product ID and purchase token.',
  {
    productId: z.string().describe('Product ID (SKU) of the purchased item'),
    token: z.string().describe('Purchase token from the client app'),
  },
  async ({ productId, token }) => {
    try {
      const result = await verifyProductPurchase(productId, token);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_acknowledge_purchase',
  'Acknowledge a product purchase. Must be done within 3 days or the purchase is refunded.',
  {
    productId: z.string().describe('Product ID'),
    token: z.string().describe('Purchase token'),
  },
  async ({ productId, token }) => {
    try {
      const result = await acknowledgeProductPurchase(productId, token);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_consume_purchase',
  'Consume a product purchase, allowing the user to buy it again (for consumable items).',
  {
    productId: z.string().describe('Product ID'),
    token: z.string().describe('Purchase token'),
  },
  async ({ productId, token }) => {
    try {
      const result = await consumeProductPurchase(productId, token);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// SUBSCRIPTION PURCHASE MANAGEMENT
// =============================================================================

server.tool(
  'gpc_get_subscription_purchase',
  'Get subscription purchase status by token. Shows state, line items, renewal info.',
  {
    token: z.string().describe('Subscription purchase token from the client app'),
  },
  async ({ token }) => {
    try {
      const result = await getSubscriptionPurchase(token);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_cancel_subscription_purchase',
  'Cancel a subscription. User retains access until end of current billing period.',
  {
    token: z.string().describe('Subscription purchase token'),
  },
  async ({ token }) => {
    try {
      const result = await cancelSubscriptionPurchase(token);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_revoke_subscription',
  'Revoke a subscription immediately. Access is removed right away. Cannot be undone.',
  {
    token: z.string().describe('Subscription purchase token'),
  },
  async ({ token }) => {
    try {
      const result = await revokeSubscriptionPurchase(token);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_defer_subscription_billing',
  'Defer subscription billing to a future date. User keeps access without being charged.',
  {
    token: z.string().describe('Subscription purchase token'),
    desiredExpiryTime: z.string().describe('New expiry time in RFC 3339 format (e.g., "2026-06-01T00:00:00Z")'),
  },
  async ({ token, desiredExpiryTime }) => {
    try {
      const result = await deferSubscriptionBilling(token, desiredExpiryTime);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// VOIDED PURCHASES (FRAUD DETECTION)
// =============================================================================

server.tool(
  'gpc_list_voided_purchases',
  'List voided purchases (refunds, chargebacks, fraud). Critical for fraud detection and financial reconciliation.',
  {
    startTime: z.string().optional().describe('Start time in milliseconds since epoch'),
    endTime: z.string().optional().describe('End time in milliseconds since epoch'),
    maxResults: z.number().min(1).max(100).default(50).describe('Maximum results to return'),
    type: z.number().optional().describe('Filter by type: 0=products, 1=subscriptions'),
  },
  async ({ startTime, endTime, maxResults, type }) => {
    try {
      const result = await listVoidedPurchases(startTime, endTime, maxResults, type);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// ORDERS (REFUNDS)
// =============================================================================

server.tool(
  'gpc_refund_order',
  'Issue a full refund for an order. The refund may take a few minutes to process.',
  {
    orderId: z.string().describe('Order ID (e.g., from purchase verification or Play Console)'),
    fullRefund: z.boolean().default(true).describe('Whether to issue a full refund'),
  },
  async ({ orderId, fullRefund }) => {
    try {
      const result = await refundOrder(orderId, fullRefund);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// APP RECOVERY (EMERGENCY RESPONSE)
// =============================================================================

server.tool(
  'gpc_list_recovery_actions',
  'List all app recovery actions (draft, active, canceled). Used for emergency incident response.',
  {},
  async () => {
    try {
      const result = await listRecoveryActions();
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_create_recovery',
  'Create a draft app recovery action targeting specific users. Must be deployed separately.',
  {
    targetVersionCodes: z.array(z.string()).optional().describe('Target specific version codes'),
    targetRegions: z.array(z.string()).optional().describe('Target specific region codes (e.g., ["US", "TR"])'),
    targetAllUsers: z.boolean().optional().describe('Target all users'),
  },
  async ({ targetVersionCodes, targetRegions, targetAllUsers }) => {
    try {
      const result = await createRecoveryAction(targetVersionCodes, targetRegions, targetAllUsers);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_deploy_recovery',
  'Deploy (activate) a draft recovery action. Targeted users will receive the recovery notification.',
  {
    recoveryId: z.string().describe('Recovery action ID (from gpc_list_recovery_actions)'),
  },
  async ({ recoveryId }) => {
    try {
      const result = await deployRecoveryAction(recoveryId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_cancel_recovery',
  'Cancel an active recovery action. Users will no longer receive the recovery notification.',
  {
    recoveryId: z.string().describe('Recovery action ID to cancel'),
  },
  async ({ recoveryId }) => {
    try {
      const result = await cancelRecoveryAction(recoveryId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// BASE PLAN MANAGEMENT
// =============================================================================

server.tool(
  'gpc_activate_base_plan',
  'Activate a subscription base plan. New users can subscribe to this plan.',
  {
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan ID to activate'),
  },
  async ({ productId, basePlanId }) => {
    try {
      const result = await activateBasePlan(productId, basePlanId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_deactivate_base_plan',
  'Deactivate a subscription base plan. Existing subscribers keep access; new users cannot subscribe.',
  {
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan ID to deactivate'),
  },
  async ({ productId, basePlanId }) => {
    try {
      const result = await deactivateBasePlan(productId, basePlanId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_delete_base_plan',
  'Delete a subscription base plan permanently. Cannot be undone.',
  {
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan ID to delete'),
  },
  async ({ productId, basePlanId }) => {
    try {
      const result = await deleteBasePlan(productId, basePlanId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_migrate_base_plan_prices',
  'Migrate existing subscribers to a new price. Subscribers are notified per Google Play policies.',
  {
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan ID'),
    priceMicros: z.string().describe('New price in micros'),
    currency: z.string().describe('Currency code (e.g., "USD")'),
  },
  async ({ productId, basePlanId, priceMicros, currency }) => {
    try {
      const result = await migrateBasePlanPrices(productId, basePlanId, priceMicros, currency);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// SUBSCRIPTION OFFERS
// =============================================================================

server.tool(
  'gpc_list_offers',
  'List all promotional offers for a subscription base plan.',
  {
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan ID'),
  },
  async ({ productId, basePlanId }) => {
    try {
      const result = await listOffers(productId, basePlanId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_get_offer',
  'Get detailed information about a specific subscription offer.',
  {
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan ID'),
    offerId: z.string().describe('Offer ID'),
  },
  async ({ productId, basePlanId, offerId }) => {
    try {
      const result = await getOffer(productId, basePlanId, offerId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_create_offer',
  'Create a promotional offer for a subscription plan (free trial, discounted period, etc.).',
  {
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan ID'),
    offerId: z.string().describe('Unique offer ID'),
    phases: z.array(z.object({
      duration: z.string().describe('Phase duration (ISO 8601, e.g., "P1M" for 1 month)'),
      recurrenceCount: z.number().describe('Number of billing cycles for this phase'),
      type: z.enum(['free', 'discounted', 'base']).describe('Phase type'),
      priceMicros: z.string().optional().describe('Discounted price in micros (for discounted type)'),
      currency: z.string().optional().describe('Currency code (for discounted type)'),
    })).describe('Offer phases (e.g., free trial then discounted then base price)'),
    offerTags: z.array(z.string()).optional().describe('Tags for offer targeting'),
  },
  async ({ productId, basePlanId, offerId, phases, offerTags }) => {
    try {
      const result = await createOffer(productId, basePlanId, offerId, phases, offerTags);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_activate_offer',
  'Activate a subscription offer, making it available to users.',
  {
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan ID'),
    offerId: z.string().describe('Offer ID to activate'),
  },
  async ({ productId, basePlanId, offerId }) => {
    try {
      const result = await activateOffer(productId, basePlanId, offerId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_deactivate_offer',
  'Deactivate a subscription offer. New users cannot redeem it; existing users are not affected.',
  {
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan ID'),
    offerId: z.string().describe('Offer ID to deactivate'),
  },
  async ({ productId, basePlanId, offerId }) => {
    try {
      const result = await deactivateOffer(productId, basePlanId, offerId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_delete_offer',
  'Delete a subscription offer permanently.',
  {
    productId: z.string().describe('Subscription product ID'),
    basePlanId: z.string().describe('Base plan ID'),
    offerId: z.string().describe('Offer ID to delete'),
  },
  async ({ productId, basePlanId, offerId }) => {
    try {
      const result = await deleteOffer(productId, basePlanId, offerId);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// PRICING
// =============================================================================

server.tool(
  'gpc_convert_region_prices',
  'Convert a base price to localized prices for all regions. Useful for setting up multi-region pricing.',
  {
    priceMicros: z.string().describe('Base price in micros (1,000,000 = $1.00)'),
    currency: z.string().describe('Base currency code (e.g., "USD")'),
  },
  async ({ priceMicros, currency }) => {
    try {
      const result = await convertRegionPrices(priceMicros, currency);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// COUNTRY AVAILABILITY
// =============================================================================

server.tool(
  'gpc_list_countries',
  'List country availability for a specific track. Shows which countries can access the release.',
  {
    track: trackSchema,
  },
  async ({ track }) => {
    try {
      const result = await listCountryAvailability(track);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// APP DETAILS UPDATE
// =============================================================================

server.tool(
  'gpc_update_app_details',
  'Update app-level details (contact email, phone, website, default language).',
  {
    contactEmail: z.string().optional().describe('Contact email address'),
    contactPhone: z.string().optional().describe('Contact phone number'),
    contactWebsite: z.string().optional().describe('Contact website URL'),
    defaultLanguage: z.string().optional().describe('Default language code (e.g., "en-US")'),
  },
  async (updates) => {
    try {
      const result = await updateAppDetails(updates);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// DELETE LISTING
// =============================================================================

server.tool(
  'gpc_delete_listing',
  'Delete a store listing for a specific locale.',
  {
    language: localeSchema,
  },
  async ({ language }) => {
    try {
      const result = await deleteListing(language);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// DELETE ALL IMAGES
// =============================================================================

server.tool(
  'gpc_delete_all_images',
  'Delete all images of a specific type for a locale (bulk delete).',
  {
    language: localeSchema,
    imageType: imageTypeSchema,
  },
  async ({ language, imageType }) => {
    try {
      const result = await deleteAllImages(language, imageType);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// INTERNAL APP SHARING
// =============================================================================

server.tool(
  'gpc_share_internal',
  'Upload a bundle/APK for internal app sharing. Bypasses edit workflow — available immediately via download URL.',
  {
    filePath: z.string().describe('Absolute path to .aab or .apk file'),
  },
  async ({ filePath }) => {
    try {
      const result = await uploadInternalBundle(filePath);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// GENERATED APKs
// =============================================================================

server.tool(
  'gpc_list_generated_apks',
  'List generated split APKs for a version code. Useful for QA and device-specific debugging.',
  {
    versionCode: z.number().describe('Version code to list generated APKs for'),
  },
  async ({ versionCode }) => {
    try {
      const result = await listGeneratedApks(versionCode);
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

server.tool(
  'gpc_list_apks',
  'List all uploaded APKs with their version codes.',
  {},
  async () => {
    try {
      const result = await listApks();
      return { content: [{ type: 'text', text: result }] };
    } catch (e) {
      return { content: [{ type: 'text', text: handleError(e) }], isError: true };
    }
  }
);

// =============================================================================
// START SERVER
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('GPC MCP Server running on stdio');

  // Graceful shutdown
  const shutdown = async () => {
    console.error('GPC MCP Server shutting down...');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
