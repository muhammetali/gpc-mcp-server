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
import { getAppInfo, listListings, updateListing } from './tools/listings.js';
import {
  listTracks, createRelease, updateReleaseNotes,
  setRollout, haltRollout, promoteRelease,
} from './tools/tracks.js';
import { listReviews, replyReview } from './tools/reviews.js';
import { getAcquisitionReport, getCrashReport } from './tools/reports.js';
import { listImages, uploadImage, deleteImage } from './tools/images.js';
import { uploadBundle, listBundles } from './tools/bundles.js';
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
