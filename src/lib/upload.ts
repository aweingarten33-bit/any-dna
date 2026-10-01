// Turning the user's drop into an upload the server can read.
// Photos are downscaled to 1600px so they stay fast; HEIC (iPhone photos)
// is converted to JPEG. The bytes never leave this device except to the
// server for the single AI call — nothing is stored.
import type { Upload } from '../../server/lib/types.ts';

const MAX_DIMENSION = 1600;
const MAX_BYTES = 10 * 1024 * 1024;

export class UploadError extends Error {}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new UploadError('Couldn’t read that file. Try again.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new UploadError('That photo couldn’t be opened. Try a JPEG or PNG.'));
    image.src = dataUrl;
  });
}

function isHeic(file: File) {
  return file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name);
}

async function photoDataURL(file: File): Promise<string> {
  const original = await readAsDataURL(file);
  const image = await loadImage(original);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
  const converted = canvas.toDataURL('image/jpeg', 0.85);
  if (!converted || converted === 'data:,') throw new UploadError('That photo couldn’t be converted. Try a JPEG or PNG.');
  return converted;
}

export async function fileToUpload(file: File): Promise<Upload> {
  if (file.size > MAX_BYTES) throw new UploadError('That file is too big. Keep it under 10 MB.');
  if (file.type.startsWith('image/') || isHeic(file)) {
    return { kind: 'photo', dataUrl: await photoDataURL(file), filename: file.name };
  }
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    return { kind: 'document', dataUrl: await readAsDataURL(file), filename: file.name };
  }
  if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return { kind: 'document', dataUrl: await readAsDataURL(file), filename: file.name };
  }
  throw new UploadError('That file won’t work. Drop a photo, a PDF, or a Word doc.');
}

/** Short label for the upload, shown on screens that came from it. */
export function uploadLabel(upload: Upload): string {
  if (upload.kind === 'text') return upload.text.length > 60 ? `“${upload.text.slice(0, 60)}…”` : `“${upload.text}”`;
  if (upload.kind === 'photo') return 'your photo';
  return upload.filename || 'your document';
}
