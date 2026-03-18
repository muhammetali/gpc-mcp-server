import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { getPackageName } from '../client.js';
import { getAccessToken } from '../auth.js';
import { UPLOAD_TIMEOUT_MS, UPLOAD_BASE_URL, MAX_BUNDLE_SIZE_BYTES } from '../constants.js';

interface InternalSharingArtifact {
  downloadUrl?: string;
  certificateFingerprint?: string;
  sha256?: string;
}

export async function uploadInternalBundle(filePath: string): Promise<string> {
  const absPath = resolve(filePath);

  if (!existsSync(absPath)) {
    return `**Error:** File not found: \`${absPath}\``;
  }

  if (!absPath.endsWith('.aab') && !absPath.endsWith('.apk')) {
    return `**Error:** File must be .aab or .apk. Got: \`${absPath}\``;
  }

  const stat = statSync(absPath);
  if (stat.size > MAX_BUNDLE_SIZE_BYTES) {
    return `**Error:** File too large: ${(stat.size / (1024 * 1024)).toFixed(0)} MB. Max allowed: ${MAX_BUNDLE_SIZE_BYTES / (1024 * 1024)} MB`;
  }
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
  const isBundle = absPath.endsWith('.aab');
  const artifactType = isBundle ? 'bundle' : 'apk';

  const pkg = getPackageName();
  const fileData = readFileSync(absPath);
  const token = await getAccessToken();

  const uploadUrl = `${UPLOAD_BASE_URL}/internalappsharing/${pkg}/artifacts/${artifactType}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS * 3);

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileData.length),
      },
      body: fileData as any,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Internal sharing upload failed (${response.status}): ${errorBody.slice(0, 500)}`);
    }

    const result = await response.json() as InternalSharingArtifact;

    let md = `## Internal App Sharing Upload\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **File** | ${absPath} |\n`;
    md += `| **Size** | ${sizeMB} MB |\n`;
    md += `| **Type** | ${isBundle ? 'Bundle (AAB)' : 'APK'} |\n`;
    if (result.sha256) md += `| **SHA-256** | ${result.sha256} |\n`;
    if (result.downloadUrl) {
      md += `\n**Download URL:** ${result.downloadUrl}\n`;
      md += `\n> Share this URL with internal testers. No edit/commit required — available immediately.`;
    }

    return md;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}
