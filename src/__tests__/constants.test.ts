import { describe, it, expect } from 'vitest';
import {
  PROJECT_LOCALES, TRACK_TYPES, IMAGE_TYPES, RELEASE_STATUSES,
  DEFAULT_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, REPORT_TIMEOUT_MS,
  MAX_PAGES, API_BASE_URL,
} from '../constants.js';

describe('constants', () => {
  it('should have all GoyGoyChat locales', () => {
    expect(PROJECT_LOCALES).toContain('en-US');
    expect(PROJECT_LOCALES).toContain('tr-TR');
    expect(PROJECT_LOCALES).toContain('de-DE');
    expect(PROJECT_LOCALES).toContain('es-419');
    expect(PROJECT_LOCALES).toContain('fr-FR');
    expect(PROJECT_LOCALES).toContain('ru-RU');
    expect(PROJECT_LOCALES).toContain('ar');
    expect(PROJECT_LOCALES).toHaveLength(7);
  });

  it('should have all track types', () => {
    expect(TRACK_TYPES).toContain('internal');
    expect(TRACK_TYPES).toContain('alpha');
    expect(TRACK_TYPES).toContain('beta');
    expect(TRACK_TYPES).toContain('production');
    expect(TRACK_TYPES).toHaveLength(4);
  });

  it('should have all image types', () => {
    expect(IMAGE_TYPES).toContain('phoneScreenshots');
    expect(IMAGE_TYPES).toContain('featureGraphic');
    expect(IMAGE_TYPES).toContain('icon');
    expect(IMAGE_TYPES).toHaveLength(8);
  });

  it('should have all release statuses', () => {
    expect(RELEASE_STATUSES).toContain('draft');
    expect(RELEASE_STATUSES).toContain('inProgress');
    expect(RELEASE_STATUSES).toContain('halted');
    expect(RELEASE_STATUSES).toContain('completed');
  });

  it('should have correct timeout values', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
    expect(UPLOAD_TIMEOUT_MS).toBe(120_000);
    expect(REPORT_TIMEOUT_MS).toBe(60_000);
  });

  it('should have pagination safety limit', () => {
    expect(MAX_PAGES).toBe(20);
  });

  it('should have correct API base URL', () => {
    expect(API_BASE_URL).toBe('https://androidpublisher.googleapis.com/androidpublisher/v3');
  });
});
