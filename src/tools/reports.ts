import { getAccessToken } from '../auth.js';
import { getPackageName } from '../client.js';
import { DEFAULT_TIMEOUT_MS } from '../constants.js';

// Google Play reporting uses Google Cloud Storage-based CSV reports
// via the Play Developer Reporting API (v1beta1) or direct stats endpoints.
// For acquisition/crash data we use the Android Publisher API v3 vitals endpoints.

const PLAY_REPORTING_BASE = 'https://playdeveloperreporting.googleapis.com/v1beta1';

interface AcquisitionMetric {
  storeAcquisitions?: string;
  newUsers?: string;
  returningUsers?: string;
}

interface CrashMetric {
  distinctUsers?: string;
  distinctUsersPercent?: number;
  eventCount?: string;
}

function createAbortSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

const DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

function parseDate(dateStr: string): { year: number; month: number; day: number } {
  if (!DATE_REGEX.test(dateStr)) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

export async function getAcquisitionReport(
  startDate: string,
  endDate: string,
): Promise<string> {
  const pkg = getPackageName();
  const token = await getAccessToken();

  // Use Play Developer Reporting API
  const url = `${PLAY_REPORTING_BASE}/apps/${pkg}/storePerformanceReport:query`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timelineSpec: {
          startTime: parseDate(startDate),
          endTime: parseDate(endDate),
          aggregationPeriod: 'DAILY',
        },
        metrics: ['STORE_ACQUISITIONS', 'STORE_LISTING_VISITORS'],
      }),
      signal: createAbortSignal(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      // Fallback: if reporting API is not available, provide guidance
      if (response.status === 403 || response.status === 404) {
        return getAcquisitionFallback(pkg, startDate, endDate);
      }
      return `**Error (${response.status}):** ${body.slice(0, 500)}`;
    }

    const data = await response.json();
    const rows = data.rows || [];

    let md = `## Acquisition Report: ${startDate} to ${endDate}\n\n`;

    if (rows.length === 0) {
      md += `No acquisition data available for this period.\n`;
      md += `\n> **Note:** Data may take 2-3 days to appear. Try an earlier date range.\n`;
      return md;
    }

    md += `| Date | Store Acquisitions | Listing Visitors |\n`;
    md += `|------|--------------------|------------------|\n`;

    let totalAcquisitions = 0;
    let totalVisitors = 0;

    for (const row of rows) {
      const date = row.startTime
        ? `${row.startTime.year}-${String(row.startTime.month).padStart(2, '0')}-${String(row.startTime.day).padStart(2, '0')}`
        : '-';
      const acquisitions = row.metrics?.storeAcquisitions || '0';
      const visitors = row.metrics?.storeListingVisitors || '0';
      totalAcquisitions += parseInt(acquisitions, 10);
      totalVisitors += parseInt(visitors, 10);
      md += `| ${date} | ${acquisitions} | ${visitors} |\n`;
    }

    md += `\n### Summary\n\n`;
    md += `| Metric | Total |\n`;
    md += `|--------|-------|\n`;
    md += `| **Total Acquisitions** | ${totalAcquisitions} |\n`;
    md += `| **Total Visitors** | ${totalVisitors} |\n`;
    if (totalVisitors > 0) {
      md += `| **Conversion Rate** | ${((totalAcquisitions / totalVisitors) * 100).toFixed(1)}% |\n`;
    }

    return md;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return `**Error:** Request timed out. Try a shorter date range.`;
    }
    return getAcquisitionFallback(pkg, startDate, endDate);
  }
}

interface VitalsQueryResult {
  status: number;
  rows: any[];
  errorBody?: string;
}

// Metric names must be camelCase — the API 400s on UPPER_SNAKE, listing
// "possible combinations" instead of naming the format problem (#195).
async function queryVitalsMetricSet(
  pkg: string,
  token: string,
  metricSet: string,
  metrics: string[],
  startDate: string,
  endDate: string,
): Promise<VitalsQueryResult> {
  const response = await fetch(`${PLAY_REPORTING_BASE}/apps/${pkg}/${metricSet}:query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timelineSpec: {
        startTime: parseDate(startDate),
        endTime: parseDate(endDate),
        aggregationPeriod: 'DAILY',
      },
      metrics,
    }),
    signal: createAbortSignal(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    return { status: response.status, rows: [], errorBody: await response.text() };
  }
  const data = await response.json();
  return { status: response.status, rows: data.rows || [] };
}

function renderVitalsRows(
  rows: any[],
  rateKey: string,
  userPerceivedKey: string,
  rateLabel: string,
): string {
  let md = `| Date | ${rateLabel} | User-Perceived ${rateLabel} | Affected Users |\n`;
  md += `|------|-----------|--------------------------|----------------|\n`;
  for (const row of rows) {
    const date = row.startTime
      ? `${row.startTime.year}-${String(row.startTime.month).padStart(2, '0')}-${String(row.startTime.day).padStart(2, '0')}`
      : '-';
    const rate = row.metrics?.[rateKey]?.decimalValue
      ? `${(parseFloat(row.metrics[rateKey].decimalValue) * 100).toFixed(2)}%`
      : '-';
    const userRate = row.metrics?.[userPerceivedKey]?.decimalValue
      ? `${(parseFloat(row.metrics[userPerceivedKey].decimalValue) * 100).toFixed(2)}%`
      : '-';
    const users = row.metrics?.distinctUsers || '-';
    md += `| ${date} | ${rate} | ${userRate} | ${users} |\n`;
  }
  return md;
}

export async function getCrashReport(
  startDate: string,
  endDate: string,
): Promise<string> {
  const pkg = getPackageName();
  const token = await getAccessToken();

  try {
    const crash = await queryVitalsMetricSet(
      pkg, token, 'crashRateMetricSet',
      ['crashRate', 'userPerceivedCrashRate', 'distinctUsers'],
      startDate, endDate,
    );
    const anr = await queryVitalsMetricSet(
      pkg, token, 'anrRateMetricSet',
      ['anrRate', 'userPerceivedAnrRate', 'distinctUsers'],
      startDate, endDate,
    );

    const unavailable = (r: VitalsQueryResult) => r.status === 403 || r.status === 404;
    if (unavailable(crash) && unavailable(anr)) {
      return getCrashFallback(pkg, startDate, endDate);
    }
    const hardError = [crash, anr].find((r) => r.errorBody && !unavailable(r));
    if (hardError) {
      return `**Error (${hardError.status}):** ${hardError.errorBody!.slice(0, 1000)}`;
    }

    let md = `## Crash & ANR Report: ${startDate} to ${endDate}\n\n`;

    md += `### Crashes\n\n`;
    if (crash.rows.length === 0) {
      md += `No crash data available for this period.\n`;
      md += `\n> **Note:** Crash data may take 2-3 days to appear.\n`;
    } else {
      md += renderVitalsRows(crash.rows, 'crashRate', 'userPerceivedCrashRate', 'Crash Rate');
    }

    md += `\n### ANRs\n\n`;
    if (anr.rows.length === 0) {
      md += `No ANR data available for this period.\n`;
    } else {
      md += renderVitalsRows(anr.rows, 'anrRate', 'userPerceivedAnrRate', 'ANR Rate');
    }

    // Threshold warnings
    md += `\n### Thresholds\n\n`;
    md += `| Metric | Bad Threshold | Good Threshold |\n`;
    md += `|--------|--------------|----------------|\n`;
    md += `| **Crash Rate** | > 1.09% | < 0.5% |\n`;
    md += `| **ANR Rate** | > 0.47% | < 0.2% |\n`;
    md += `\n> Apps exceeding bad thresholds may receive warning badges or be removed from Play Store.\n`;

    return md;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return `**Error:** Request timed out. Try a shorter date range.`;
    }
    return getCrashFallback(pkg, startDate, endDate);
  }
}

function getAcquisitionFallback(pkg: string, startDate: string, endDate: string): string {
  let md = `## Acquisition Report: ${startDate} to ${endDate}\n\n`;
  md += `> **Note:** The Play Developer Reporting API may not be enabled or accessible.\n\n`;
  md += `### How to view acquisition data:\n\n`;
  md += `1. Go to [Google Play Console](https://play.google.com/console)\n`;
  md += `2. Select app: \`${pkg}\`\n`;
  md += `3. Navigate to **Statistics** > **Store performance**\n`;
  md += `4. Set date range: ${startDate} to ${endDate}\n\n`;
  md += `### Enable API access:\n\n`;
  md += `1. Enable "Google Play Developer Reporting API" in Google Cloud Console\n`;
  md += `2. Grant the service account "Viewer" access in Play Console\n`;
  return md;
}

function getCrashFallback(pkg: string, startDate: string, endDate: string): string {
  let md = `## Crash & ANR Report: ${startDate} to ${endDate}\n\n`;
  md += `> **Note:** The Play Developer Reporting API may not be enabled or accessible.\n\n`;
  md += `### How to view crash data:\n\n`;
  md += `1. Go to [Google Play Console](https://play.google.com/console)\n`;
  md += `2. Select app: \`${pkg}\`\n`;
  md += `3. Navigate to **Android vitals** > **Crashes** or **ANRs**\n`;
  md += `4. Set date range: ${startDate} to ${endDate}\n\n`;
  md += `### For Firebase Crashlytics:\n\n`;
  md += `Use the Firebase MCP tools (\`crashlytics_list_events\`, \`crashlytics_get_issue\`) for detailed crash analysis.\n`;
  return md;
}
