import { gpcGet, getPackageName, createEdit } from '../client.js';

interface GeneratedApk {
  variantId: number;
  generatedApks?: {
    downloadId: string;
    variantId: number;
    certificateSha256Hash: string;
    moduleName?: string;
  }[];
}

interface GeneratedApksResponse {
  generatedApks?: GeneratedApk[];
}

export async function listGeneratedApks(versionCode: number): Promise<string> {
  const pkg = getPackageName();
  const result = await gpcGet<GeneratedApksResponse>(
    `/applications/${pkg}/generatedApks/${versionCode}`,
  );

  const apks = result.generatedApks || [];

  if (apks.length === 0) {
    return `## Generated APKs\n\nNo generated APKs found for version code \`${versionCode}\`.`;
  }

  let md = `## Generated APKs: Version ${versionCode}\n\n`;

  let totalApks = 0;
  for (const variant of apks) {
    md += `### Variant ${variant.variantId}\n\n`;
    const downloads = variant.generatedApks || [];
    totalApks += downloads.length;

    if (downloads.length > 0) {
      md += `| Download ID | Module | SHA-256 |\n`;
      md += `|-------------|--------|---------|\n`;
      for (const apk of downloads) {
        const hash = apk.certificateSha256Hash?.slice(0, 16) + '...' || '-';
        md += `| ${apk.downloadId} | ${apk.moduleName || 'base'} | ${hash} |\n`;
      }
    }
    md += `\n`;
  }

  md += `**Total:** ${apks.length} variants, ${totalApks} APKs`;

  return md;
}

export async function listApks(): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  const result = await gpcGet<{ apks?: { versionCode: number; binary: { sha1: string; sha256: string } }[] }>(
    `/applications/${pkg}/edits/${editId}/apks`,
  );

  const apks = result.apks || [];

  if (apks.length === 0) {
    return `## APKs\n\nNo APKs found for \`${pkg}\`.`;
  }

  let md = `## Uploaded APKs (${apks.length})\n\n`;
  md += `| Version Code | SHA-1 |\n`;
  md += `|-------------|-------|\n`;

  for (const apk of apks) {
    md += `| ${apk.versionCode} | ${apk.binary?.sha1 || '-'} |\n`;
  }

  return md;
}
