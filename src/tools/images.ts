import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { gpcGet, gpcDelete, gpcUpload, getPackageName, createEdit, commitEdit } from '../client.js';
import { type ImageType, MAX_IMAGE_SIZE_BYTES } from '../constants.js';

interface Image {
  id: string;
  url: string;
  sha1: string;
  sha256: string;
}

interface ImagesResponse {
  images: Image[];
}

export async function listImages(
  language: string,
  imageType: ImageType,
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  const result = await gpcGet<ImagesResponse>(
    `/applications/${pkg}/edits/${editId}/listings/${language}/${imageType}`
  );

  const images = result.images || [];

  let md = `## Images: ${imageType} (${language})\n\n`;

  if (images.length === 0) {
    md += `No ${imageType} uploaded for locale \`${language}\`.\n`;
    return md;
  }

  md += `| # | Image ID | URL (preview) |\n`;
  md += `|---|----------|---------------|\n`;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const urlPreview = img.url ? img.url.slice(0, 60) + '...' : '-';
    md += `| ${i + 1} | ${img.id} | ${urlPreview} |\n`;
  }

  md += `\n**Total:** ${images.length} image(s)`;
  return md;
}

interface PreparedImage {
  path: string;
  name: string;
  data: Uint8Array;
  mimeType: string;
  sizeKB: string;
}

/**
 * Resolves, validates and reads an image file.
 *
 * Shared by uploadImage and uploadImagesBatch so the extension/size/MIME rules
 * live in one place.
 */
function prepareImage(filePath: string): PreparedImage {
  // Path traversal protection
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  // Validate file extension
  const validExtensions = /\.(png|jpg|jpeg|webp)$/i;
  if (!resolvedPath.match(validExtensions)) {
    throw new Error(`Invalid file type. Only PNG, JPEG, and WebP images are supported: ${resolvedPath}`);
  }

  // Validate file size
  const fileStat = statSync(resolvedPath);
  if (fileStat.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`File too large: ${(fileStat.size / (1024 * 1024)).toFixed(1)} MB. Max allowed: ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB`);
  }

  // Determine MIME type
  const ext = resolvedPath.toLowerCase().split('.').pop();
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  const mimeType = mimeMap[ext || ''] || 'application/octet-stream';

  const fileData = readFileSync(resolvedPath);

  return {
    path: resolvedPath,
    name: resolvedPath.split('/').pop() || resolvedPath,
    data: new Uint8Array(fileData),
    mimeType,
    sizeKB: (fileData.length / 1024).toFixed(0),
  };
}

export async function uploadImage(
  language: string,
  imageType: ImageType,
  filePath: string,
): Promise<string> {
  const file = prepareImage(filePath);
  const { path: resolvedPath, mimeType, sizeKB: fileSizeKB } = file;
  const fileData = file.data;

  const pkg = getPackageName();
  const editId = await createEdit();

  const result = await gpcUpload<Image>(
    `/applications/${pkg}/edits/${editId}/listings/${language}/${imageType}`,
    fileData,
    mimeType,
  );

  await commitEdit(editId);

  let md = `## Image Uploaded\n\n`;
  md += `| Field | Value |\n`;
  md += `|-------|-------|\n`;
  md += `| **Language** | ${language} |\n`;
  md += `| **Type** | ${imageType} |\n`;
  md += `| **File** | ${resolvedPath.split('/').pop()} |\n`;
  md += `| **Size** | ${fileSizeKB} KB |\n`;
  md += `| **Image ID** | ${result.id || '-'} |\n`;
  md += `\n**Status:** Upload complete!`;

  return md;
}

export interface BatchUpload {
  language: string;
  filePaths: string[];
}

/**
 * Uploads many images across one or more locales inside a SINGLE edit.
 *
 * Why this exists: Google Play validates a listing's completeness at *commit*
 * time, and a locale that has a store listing must carry at least 2 phone
 * screenshots. `uploadImage` commits after every single file, so seeding a
 * freshly created locale is impossible with it — the first screenshot commits
 * alone, validation sees 1 < 2 and rejects it with:
 *
 *     This app has too few screenshots for language <locale>
 *
 * leaving the locale permanently empty. Batching every delete and upload into
 * one edit lets validation see the whole set at once.
 *
 * `replace: true` clears each locale's existing images of this type first, so
 * the result is exactly the given list rather than an append.
 */
export async function uploadImagesBatch(
  imageType: ImageType,
  uploads: BatchUpload[],
  replace = false,
): Promise<string> {
  if (uploads.length === 0) {
    throw new Error('uploads is empty — nothing to do.');
  }

  // Validate and read everything BEFORE opening an edit: a file that turns out
  // to be missing halfway through would otherwise leave a dangling edit and a
  // half-applied locale.
  const hazir = uploads.map(({ language, filePaths }) => {
    if (filePaths.length === 0) {
      throw new Error(`No filePaths given for locale ${language}.`);
    }
    return { language, files: filePaths.map(prepareImage) };
  });

  const pkg = getPackageName();
  const editId = await createEdit();

  for (const { language, files } of hazir) {
    if (replace) {
      await gpcDelete(
        `/applications/${pkg}/edits/${editId}/listings/${language}/${imageType}`
      );
    }
    for (const file of files) {
      await gpcUpload<Image>(
        `/applications/${pkg}/edits/${editId}/listings/${language}/${imageType}`,
        file.data,
        file.mimeType,
      );
    }
  }

  await commitEdit(editId);

  const toplam = hazir.reduce((n, u) => n + u.files.length, 0);
  let md = `## Batch Upload Complete\n\n`;
  md += `**${toplam}** image(s) across **${hazir.length}** locale(s), committed in a single edit`;
  md += replace ? ' (existing images replaced).\n\n' : '.\n\n';
  md += `| Locale | Images | Files |\n`;
  md += `|--------|--------|-------|\n`;
  for (const { language, files } of hazir) {
    md += `| ${language} | ${files.length} | ${files.map((f) => f.name).join(', ')} |\n`;
  }
  md += `\n**Type:** ${imageType}`;
  return md;
}

export async function deleteImage(
  language: string,
  imageType: ImageType,
  imageId: string,
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  await gpcDelete(
    `/applications/${pkg}/edits/${editId}/listings/${language}/${imageType}/${imageId}`
  );
  await commitEdit(editId);

  return `**Deleted** image \`${imageId}\` (${imageType}, ${language})`;
}

export async function deleteAllImages(
  language: string,
  imageType: ImageType,
): Promise<string> {
  const pkg = getPackageName();
  const editId = await createEdit();

  await gpcDelete(
    `/applications/${pkg}/edits/${editId}/listings/${language}/${imageType}`
  );
  await commitEdit(editId);

  return `## All Images Deleted\n\nAll \`${imageType}\` images for locale \`${language}\` have been deleted.`;
}
