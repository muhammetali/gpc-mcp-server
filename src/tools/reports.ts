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
          startTime: { year: parseInt(startDate.split('-')[0]), month: parseInt(startDate.split('-')[1]), day: parseInt(startDate.split('-')[2]) },
          endTime: { year: parseInt(endDate.split('-')[0]), month: parseInt(endDate.split('-')[1]), day: parseInt(endDate.split('-')[2]) },
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

export async function getCrashReport(
  startDate: string,
  endDate: string,
): Promise<string> {
  const pkg = getPackageName();
  const token = await getAccessToken();

  const url = `${PLAY_REPORTING_BASE}/apps/${pkg}/crashRateMetricSet:query`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timelineSpec: {
          startTime: { year: parseInt(startDate.split('-')[0]), month: parseInt(startDate.split('-')[1]), day: parseInt(startDate.split('-')[2]) },
          endTime: { year: parseInt(endDate.split('-')[0]), month: parseInt(endDate.split('-')[1]), day: parseInt(endDate.split('-')[2]) },
          aggregationPeriod: 'DAILY',
        },
        metrics: ['CRASH_RATE', 'USER_PERCEIVED_CRASH_RATE', 'DISTINCT_USERS'],
      }),
      signal: createAbortSignal(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 403 || response.status === 404) {
        return getCrashFallback(pkg, startDate, endDate);
      }
      return `**Error (${response.status}):** ${body.slice(0, 500)}`;
    }

    const data = await response.json();
    const rows = data.rows || [];

    let md = `## Crash & ANR Report: ${startDate} to ${endDate}\n\n`;

    if (rows.length === 0) {
      md += `No crash data available for this period.\n`;
      md += `\n> **Note:** Crash data may take 2-3 days to appear.\n`;
      return md;
    }

    md += `| Date | Crash Rate | User-Perceived Crash Rate | Affected Users |\n`;
    md += `|------|-----------|--------------------------|----------------|\n`;

    for (const row of rows) {
      const date = row.startTime
        ? `${row.startTime.year}-${String(row.startTime.month).padStart(2, '0')}-${String(row.startTime.day).padStart(2, '0')}`
        : '-';
      const crashRate = row.metrics?.crashRate?.decimalValue
        ? `${(parseFloat(row.metrics.crashRate.decimalValue) * 100).toFixed(2)}%`
        : '-';
      const userCrashRate = row.metrics?.userPerceivedCrashRate?.decimalValue
        ? `${(parseFloat(row.metrics.userPerceivedCrashRate.decimalValue) * 100).toFixed(2)}%`
        : '-';
      const users = row.metrics?.distinctUsers || '-';
      md += `| ${date} | ${crashRate} | ${userCrashRate} | ${users} |\n`;
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
