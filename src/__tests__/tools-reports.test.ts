import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth
vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('tools/reports', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.resetModules();
    process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.fixmob.vipchat';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getAcquisitionReport', () => {
    it('should return acquisition report with metrics', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          rows: [
            {
              startTime: { year: 2026, month: 3, day: 10 },
              metrics: { storeAcquisitions: '15', storeListingVisitors: '120' },
            },
            {
              startTime: { year: 2026, month: 3, day: 11 },
              metrics: { storeAcquisitions: '22', storeListingVisitors: '180' },
            },
          ],
        }), { status: 200 })
      );

      const { getAcquisitionReport } = await import('../tools/reports.js');
      const result = await getAcquisitionReport('2026-03-10', '2026-03-12');

      expect(result).toContain('## Acquisition Report');
      expect(result).toContain('2026-03-10');
      expect(result).toContain('15');
      expect(result).toContain('22');
      expect(result).toContain('Total Acquisitions');
      expect(result).toContain('37'); // 15 + 22
      expect(result).toContain('Total Visitors');
      expect(result).toContain('300'); // 120 + 180
      expect(result).toContain('Conversion Rate');
    });

    it('should return fallback on 403 error (API unavailable)', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          error: { code: 403, message: 'Forbidden', status: 'FORBIDDEN' },
        }), { status: 403 })
      );

      const { getAcquisitionReport } = await import('../tools/reports.js');
      const result = await getAcquisitionReport('2026-03-10', '2026-03-12');

      expect(result).toContain('Acquisition Report');
      expect(result).toContain('Play Developer Reporting API may not be enabled');
      expect(result).toContain('Google Play Console');
      expect(result).toContain('com.fixmob.vipchat');
    });

    it('should handle empty rows gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ rows: [] }), { status: 200 })
      );

      const { getAcquisitionReport } = await import('../tools/reports.js');
      const result = await getAcquisitionReport('2026-03-10', '2026-03-12');

      expect(result).toContain('No acquisition data available');
      expect(result).toContain('2-3 days');
    });
  });

  describe('getCrashReport', () => {
    it('should return crash report with data', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          rows: [
            {
              startTime: { year: 2026, month: 3, day: 10 },
              metrics: {
                crashRate: { decimalValue: '0.005' },
                userPerceivedCrashRate: { decimalValue: '0.003' },
                distinctUsers: '8',
              },
            },
          ],
        }), { status: 200 })
      );

      const { getCrashReport } = await import('../tools/reports.js');
      const result = await getCrashReport('2026-03-10', '2026-03-12');

      expect(result).toContain('## Crash & ANR Report');
      expect(result).toContain('2026-03-10');
      expect(result).toContain('0.50%'); // 0.005 * 100
      expect(result).toContain('0.30%'); // 0.003 * 100
      expect(result).toContain('8');
      expect(result).toContain('Thresholds');
      expect(result).toContain('1.09%');
    });

    it('should return fallback on 403 error (API unavailable)', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          error: { code: 403, message: 'Forbidden', status: 'FORBIDDEN' },
        }), { status: 403 })
      );

      const { getCrashReport } = await import('../tools/reports.js');
      const result = await getCrashReport('2026-03-10', '2026-03-12');

      expect(result).toContain('Crash & ANR Report');
      expect(result).toContain('Play Developer Reporting API may not be enabled');
      expect(result).toContain('Android vitals');
      expect(result).toContain('com.fixmob.vipchat');
    });

    it('should handle empty crash data', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ rows: [] }), { status: 200 })
      );

      const { getCrashReport } = await import('../tools/reports.js');
      const result = await getCrashReport('2026-03-10', '2026-03-12');

      expect(result).toContain('No crash data available');
      expect(result).toContain('2-3 days');
    });
  });

  describe('date range validation', () => {
    it('should parse date components correctly for acquisition report', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ rows: [] }), { status: 200 })
      );
      global.fetch = fetchMock;

      const { getAcquisitionReport } = await import('../tools/reports.js');
      await getAcquisitionReport('2026-01-15', '2026-02-28');

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.timelineSpec.startTime).toEqual({ year: 2026, month: 1, day: 15 });
      expect(body.timelineSpec.endTime).toEqual({ year: 2026, month: 2, day: 28 });
    });

    it('should parse date components correctly for crash report', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ rows: [] }), { status: 200 })
      );
      global.fetch = fetchMock;

      const { getCrashReport } = await import('../tools/reports.js');
      await getCrashReport('2025-12-01', '2026-01-31');

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.timelineSpec.startTime).toEqual({ year: 2025, month: 12, day: 1 });
      expect(body.timelineSpec.endTime).toEqual({ year: 2026, month: 1, day: 31 });
    });
  });
});
