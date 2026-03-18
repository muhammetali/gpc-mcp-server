import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { gpcPost, getPackageName } from '../client.js';
import { getAccessToken } from '../auth.js';
import { UPLOAD_TIMEOUT_MS } from '../constants.js';

interface Bundle {
  versionCode: number;
  sha1: string;
  sha256: string;
}

interface BundlesResponse {
  bundles: Bundle[];
}

// Helper: create a new edit
async function createEdit(): Promise<string> {
  const pkg = getPackageName();
  const result = await gpcPost<{ id: string }>(`/applications/${pkg}/edits`);
  return result.id;
}

// Helper: commit an edit
async function commitEdit(editId: string): Promise<void> {
  const pkg = getPackageName();
  await gpcPost(`/applications/${pkg}/edits/${editId}:commit`);
}

export async function uploadBundle(filePath: string): Promise<string> {
  const absPath = resolve(filePath);

  if (!existsSync(absPath)) {
    return `**Error:** File not found: \`${absPath}\``;
  }

  const stat = statSync(absPath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);

  if (!absPath.endsWith('.aab')) {
    return `**Error:** File must be an Android App Bundle (.aab). Got: \`${absPath}\``;
  }

  const pkg = getPackageName();
  const editId = await createEdit();

  const fileData = readFileSync(absPath);
  const token = await getAccessToken();

  // Google Play uses the upload endpoint with octet-stream content type
  const uploadUrl = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}/edits/${editId}/bundles?uploadType=media`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS * 3); // 6 min for large bundles

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
      throw new Error(`Upload failed (${response.status}): ${errorBody.slice(0, 500)}`);
    }

    const bundle = await response.json() as Bundle;

    await commitEdit(editId);

    let md = `## Bundle Uploaded\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| **File** | ${absPath} |\n`;
    md += `| **Size** | ${sizeMB} MB |\n`;
    md += `| **Version Code** | ${bundle.versionCode} |\n`;
    md += `| **SHA-1** | ${bundle.sha1} |\n`;
    md += `| **SHA-256** | ${bundle.sha256} |\n`;
    md += `\n**Next steps:**\n`;
    md += `1. Use \`gpc_create_release\` with versionCode \`${bundle.versionCode}\` to create a release\n`;
    md += `2. Set release notes for all locales\n`;
    md += `3. Choose a track (internal, beta, production)\n`;

    return md;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

export async function listBundles(): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  const token = await getAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/edits/${editId}/bundles`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`List bundles failed (${response.status}): ${errorBody.slice(0, 500)}`);
  }

  const result = await response.json() as BundlesResponse;
  const bundles = result.bundles || [];

  if (bundles.length === 0) {
    return `## Bundles\n\nNo bundles found for \`${pkg}\`.`;
  }

  let md = `## Uploaded Bundles (${bundles.length})\n\n`;
  md += `| Version Code | SHA-1 |\n`;
  md += `|-------------|-------|\n`;

  for (const bundle of bundles) {
    md += `| ${bundle.versionCode} | ${bundle.sha1} |\n`;
  }

  return md;
}
