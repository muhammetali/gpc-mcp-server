import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { gpcGet, gpcPut, getPackageName, createEdit, commitEdit } from '../client.js';
import { getAccessToken } from '../auth.js';
import { UPLOAD_TIMEOUT_MS, UPLOAD_BASE_URL, PROJECT_LOCALES, MAX_BUNDLE_SIZE_BYTES, MAX_MAPPING_SIZE_BYTES, type TrackType } from '../constants.js';

interface Bundle {
  versionCode: number;
  sha1: string;
  sha256: string;
}

interface BundlesResponse {
  bundles: Bundle[];
}

// Shared upload helper with timeout and error handling
async function uploadBinary(
  url: string,
  fileData: Buffer,
  token: string,
  timeoutMs: number,
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileData.length),
      },
      body: fileData as any,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Upload failed (${response.status}): ${errorBody.slice(0, 500)}`);
    }

    return await response.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export async function uploadBundle(filePath: string): Promise<string> {
  const absPath = resolve(filePath);

  if (!existsSync(absPath)) {
    return `**Error:** File not found: \`${absPath}\``;
  }

  if (!absPath.endsWith('.aab')) {
    return `**Error:** File must be an Android App Bundle (.aab). Got: \`${absPath}\``;
  }

  const stat = statSync(absPath);
  if (stat.size > MAX_BUNDLE_SIZE_BYTES) {
    return `**Error:** File too large: ${(stat.size / (1024 * 1024)).toFixed(0)} MB. Max allowed: ${MAX_BUNDLE_SIZE_BYTES / (1024 * 1024)} MB`;
  }

  const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
  const pkg = getPackageName();
  const editId = await createEdit();

  const fileData = readFileSync(absPath);
  const token = await getAccessToken();

  const uploadUrl = `${UPLOAD_BASE_URL}/applications/${pkg}/edits/${editId}/bundles?uploadType=media`;
  const bundle = await uploadBinary(uploadUrl, fileData, token, UPLOAD_TIMEOUT_MS * 3) as Bundle;

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
}

export async function uploadAab(
  filePath: string,
  track: TrackType,
  releaseNotes: Record<string, string>,
  releaseName?: string,
  status: string = 'completed',
  userFraction?: number,
): Promise<string> {
  const absPath = resolve(filePath);

  if (!existsSync(absPath)) {
    return `**Error:** File not found: \`${absPath}\``;
  }

  if (!absPath.endsWith('.aab')) {
    return `**Error:** File must be an Android App Bundle (.aab). Got: \`${absPath}\``;
  }

  for (const [lang, text] of Object.entries(releaseNotes)) {
    if (text.length > 500) {
      return `**Error:** Release notes for \`${lang}\` exceed 500 characters (got ${text.length}).`;
    }
  }

  const stat = statSync(absPath);
  if (stat.size > MAX_BUNDLE_SIZE_BYTES) {
    return `**Error:** File too large: ${(stat.size / (1024 * 1024)).toFixed(0)} MB. Max allowed: ${MAX_BUNDLE_SIZE_BYTES / (1024 * 1024)} MB`;
  }

  const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
  const pkg = getPackageName();
  const editId = await createEdit();

  // Step 1: Upload bundle
  const fileData = readFileSync(absPath);
  const token = await getAccessToken();

  const uploadUrl = `${UPLOAD_BASE_URL}/applications/${pkg}/edits/${editId}/bundles?uploadType=media`;
  const bundle = await uploadBinary(uploadUrl, fileData, token, UPLOAD_TIMEOUT_MS * 3) as Bundle;

  // Step 2: Create release on the specified track
  const notes = Object.entries(releaseNotes).map(([language, text]) => ({ language, text }));

  const release: Record<string, any> = {
    versionCodes: [String(bundle.versionCode)],
    releaseNotes: notes,
    status,
  };

  if (releaseName) release.name = releaseName;
  if (userFraction !== undefined && status === 'inProgress') {
    release.userFraction = userFraction;
  }

  await gpcPut(`/applications/${pkg}/edits/${editId}/tracks/${track}`, {
    track,
    releases: [release],
  });

  // Step 3: Commit
  await commitEdit(editId);

  let md = `## AAB Upload + Release Complete\n\n`;
  md += `### Upload\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **File** | ${absPath} |\n`;
  md += `| **Size** | ${sizeMB} MB |\n`;
  md += `| **Version Code** | ${bundle.versionCode} |\n`;
  md += `| **SHA-256** | ${bundle.sha256} |\n`;
  md += `\n### Release\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Track** | ${track} |\n`;
  md += `| **Status** | ${status} |\n`;
  if (releaseName) md += `| **Name** | ${releaseName} |\n`;
  if (userFraction !== undefined) md += `| **Rollout** | ${(userFraction * 100).toFixed(0)}% |\n`;

  md += `\n**Release Notes:**\n`;
  for (const [lang, text] of Object.entries(releaseNotes)) {
    const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
    md += `- ${lang}: ${preview}\n`;
  }

  const noteLocales = Object.keys(releaseNotes);
  const missingLocales = PROJECT_LOCALES.filter(l => !noteLocales.includes(l));
  if (missingLocales.length > 0) {
    md += `\n> **Warning:** Release notes missing for: ${missingLocales.join(', ')}\n`;
  }

  return md;
}

export async function uploadMapping(
  versionCode: number,
  filePath: string,
): Promise<string> {
  const absPath = resolve(filePath);

  if (!existsSync(absPath)) {
    return `**Error:** File not found: \`${absPath}\``;
  }

  if (!absPath.endsWith('.txt') && !absPath.endsWith('.map')) {
    return `**Error:** Mapping file must be .txt or .map. Got: \`${absPath}\``;
  }

  const stat = statSync(absPath);
  if (stat.size > MAX_MAPPING_SIZE_BYTES) {
    return `**Error:** File too large: ${(stat.size / (1024 * 1024)).toFixed(0)} MB. Max allowed: ${MAX_MAPPING_SIZE_BYTES / (1024 * 1024)} MB`;
  }

  const sizeKB = (stat.size / 1024).toFixed(1);
  const pkg = getPackageName();
  const editId = await createEdit();

  const fileData = readFileSync(absPath);
  const token = await getAccessToken();

  const uploadUrl = `${UPLOAD_BASE_URL}/applications/${pkg}/edits/${editId}/deobfuscationfiles/${versionCode}?deobfuscationFileType=proguard`;
  await uploadBinary(uploadUrl, fileData, token, UPLOAD_TIMEOUT_MS);
  await commitEdit(editId);

  let md = `## Mapping File Uploaded\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **File** | ${absPath} |\n`;
  md += `| **Size** | ${sizeKB} KB |\n`;
  md += `| **Version Code** | ${versionCode} |\n`;
  md += `| **Type** | ProGuard/R8 |\n`;
  md += `\n> Crash stack traces for version code ${versionCode} will now be deobfuscated in Play Console.`;

  return md;
}

export async function listBundles(): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  const result = await gpcGet<BundlesResponse>(
    `/applications/${pkg}/edits/${editId}/bundles`,
  );

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
