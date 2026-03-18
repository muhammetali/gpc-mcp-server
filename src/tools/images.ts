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

export async function uploadImage(
  language: string,
  imageType: ImageType,
  filePath: string,
): Promise<string> {
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
  const fileSizeKB = (fileData.length / 1024).toFixed(0);

  const pkg = getPackageName();
  const editId = await createEdit();

  const result = await gpcUpload<Image>(
    `/applications/${pkg}/edits/${editId}/listings/${language}/${imageType}`,
    new Uint8Array(fileData),
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
