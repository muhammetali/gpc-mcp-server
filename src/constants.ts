// Supported locales for Google Play - Single Source of Truth
// Google Play uses BCP 47 format (different from Apple's locale codes)
export const PROJECT_LOCALES = ['en-US', 'tr-TR', 'de-DE', 'es-419', 'fr-FR', 'ru-RU', 'ar'] as const;
export type ProjectLocale = (typeof PROJECT_LOCALES)[number];

// Google Play track types
export const TRACK_TYPES = ['internal', 'alpha', 'beta', 'production'] as const;
export type TrackType = (typeof TRACK_TYPES)[number];

// Google Play image types for screenshots and graphics
export const IMAGE_TYPES = [
  'phoneScreenshots',
  'sevenInchScreenshots',
  'tenInchScreenshots',
  'tvScreenshots',
  'wearScreenshots',
  'icon',
  'featureGraphic',
  'tvBanner',
] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

// Release statuses
export const RELEASE_STATUSES = ['draft', 'inProgress', 'halted', 'completed'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

// API timeout (30 seconds default, 120 seconds for uploads)
export const DEFAULT_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;
export const BUNDLE_UPLOAD_TIMEOUT_MS = 600_000; // 10 min for large AAB files
export const REPORT_TIMEOUT_MS = 60_000;

// Pagination safety limit
export const MAX_PAGES = 20;

// API Base URLs
export const API_BASE_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
export const UPLOAD_BASE_URL = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';

// File size limits
export const MAX_BUNDLE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (Google Play limit)
export const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_MAPPING_SIZE_BYTES = 300 * 1024 * 1024; // 300 MB

// monetization.onetimeproducts (2026-08-12 migration off the sunset
// `inappproducts` resource — see https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.onetimeproducts).
// `regionsVersion.version` is required on every write; Google increments it
// only when the supported-region set substantially changes, so this stays
// valid for a long time — bump it if Google's docs (RegionsVersion type
// page) ever publish a newer value.
export const REGIONS_VERSION = '2022/02';
