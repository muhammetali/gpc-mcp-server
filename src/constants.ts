// GoyGoyChat supported locales for Google Play - Single Source of Truth
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
export const REPORT_TIMEOUT_MS = 60_000;

// Pagination safety limit
export const MAX_PAGES = 20;

// API Base URL
export const API_BASE_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
