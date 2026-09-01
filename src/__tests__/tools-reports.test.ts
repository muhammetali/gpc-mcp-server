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
    process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.example.myapp';
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
      expect(result).toContain('com.example.myapp');
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
      global.fetch = vi.fn().mockImplementation(() => Promise.resolve(
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
      ));

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
      global.fetch = vi.fn().mockImplementation(() => Promise.resolve(
        new Response(JSON.stringify({
          error: { code: 403, message: 'Forbidden', status: 'FORBIDDEN' },
        }), { status: 403 })
      ));

      const { getCrashReport } = await import('../tools/reports.js');
      const result = await getCrashReport('2026-03-10', '2026-03-12');

      expect(result).toContain('Crash & ANR Report');
      expect(result).toContain('Play Developer Reporting API may not be enabled');
      expect(result).toContain('Android vitals');
      expect(result).toContain('com.example.myapp');
    });

    it('should handle empty crash data', async () => {
      global.fetch = vi.fn().mockImplementation(() => Promise.resolve(
        new Response(JSON.stringify({ rows: [] }), { status: 200 })
      ));

      const { getCrashReport } = await import('../tools/reports.js');
      const result = await getCrashReport('2026-03-10', '2026-03-12');

      expect(result).toContain('No crash data available');
      expect(result).toContain('2-3 days');
    });

    // [#195] The tool promised "crash and ANR rates" but only ever queried
    // crashRateMetricSet, and sent UPPER_SNAKE metric names the API rejects
    // with 400 — masked for months by the 403 fallback while the API was
    // disabled. These pin the actual wire contract.
    it('queries both crash and ANR metric sets with camelCase metric names', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
        new Response(JSON.stringify({ rows: [] }), { status: 200 })
      ));
      global.fetch = fetchMock;

      const { getCrashReport } = await import('../tools/reports.js');
      await getCrashReport('2026-03-10', '2026-03-12');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [crashUrl, crashOpts] = fetchMock.mock.calls[0];
      const [anrUrl, anrOpts] = fetchMock.mock.calls[1];
      expect(crashUrl).toContain('crashRateMetricSet:query');
      expect(anrUrl).toContain('anrRateMetricSet:query');
      expect(JSON.parse(crashOpts.body).metrics).toEqual([
        'crashRate',
        'userPerceivedCrashRate',
        'distinctUsers',
      ]);
      expect(JSON.parse(anrOpts.body).metrics).toEqual([
        'anrRate',
        'userPerceivedAnrRate',
        'distinctUsers',
      ]);
    });

    it('renders ANR rates from the anrRateMetricSet response', async () => {
      const crashRows = { rows: [] };
      const anrRows = {
        rows: [
          {
            startTime: { year: 2026, month: 3, day: 10 },
            metrics: {
              anrRate: { decimalValue: '0.008' },
              userPerceivedAnrRate: { decimalValue: '0.004' },
              distinctUsers: '5',
            },
          },
        ],
      };
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(crashRows), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(anrRows), { status: 200 }));

      const { getCrashReport } = await import('../tools/reports.js');
      const result = await getCrashReport('2026-03-10', '2026-03-12');

      expect(result).toContain('ANR Rate');
      expect(result).toContain('0.80%'); // 0.008 * 100
      expect(result).toContain('0.40%'); // 0.004 * 100
      expect(result).toContain('| 5 |');
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
  describe('checkCrashAnomaly', () => {
    it('detects a crash anomaly', async () => {
      // Mock rows for 14 days
      const rows: any[] = [];
      // 12 baseline days with 0.001 (0.1%) crash rate
      for (let i = 0; i < 12; i++) {
        rows.push({ metrics: { crashRate: { decimalValue: '0.001' } } });
      }
      // 2 recent days with 0.010 (1.0%) crash rate (huge spike)
      rows.push({ metrics: { crashRate: { decimalValue: '0.010' } } });
      rows.push({ metrics: { crashRate: { decimalValue: '0.010' } } });

      global.fetch = vi.fn().mockImplementation(() => Promise.resolve(
        new Response(JSON.stringify({ rows }), { status: 200 })
      ));

      const { checkCrashAnomaly } = await import('../tools/reports.js');
      const result = await checkCrashAnomaly();

      expect(result).toContain('ANOMALY DETECTED!');
      expect(result).toContain('900%'); // (0.010 - 0.001) / 0.001 * 100
      expect(result).toContain('gpc_halt_rollout');
    });

    it('reports stable when no anomaly', async () => {
      const rows: any[] = [];
      // 14 days with 0.002 (0.2%) crash rate
      for (let i = 0; i < 14; i++) {
        rows.push({ metrics: { crashRate: { decimalValue: '0.002' } } });
      }

      global.fetch = vi.fn().mockImplementation(() => Promise.resolve(
        new Response(JSON.stringify({ rows }), { status: 200 })
      ));

      const { checkCrashAnomaly } = await import('../tools/reports.js');
      const result = await checkCrashAnomaly();

      expect(result).toContain('Stable');
      expect(result).not.toContain('ANOMALY DETECTED!');
    });
  });
});
