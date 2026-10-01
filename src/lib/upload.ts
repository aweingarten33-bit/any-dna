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

const FRAME_SIZE = 768;
const FRAME_COUNT = 4;

/** Four still frames from across a video. The video itself never leaves the phone. */
async function videoFrames(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new UploadError('That video couldn’t be opened. Try an MP4 or a phone video.'));
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const scale = Math.min(1, FRAME_SIZE / Math.max(video.videoWidth || FRAME_SIZE, video.videoHeight || FRAME_SIZE));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((video.videoWidth || FRAME_SIZE) * scale);
    canvas.height = Math.round((video.videoHeight || FRAME_SIZE) * scale);
    const context = canvas.getContext('2d');
    const frames: string[] = [];
    for (let i = 0; i < FRAME_COUNT; i += 1) {
      video.currentTime = duration * (0.1 + (0.8 * i) / (FRAME_COUNT - 1));
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
      context?.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.8));
    }
    if (!frames.length || frames[0] === 'data:,') throw new UploadError('That video couldn’t be read. Try another one.');
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reads the title and artist from an MP3's ID3 tags, if it has them. */
async function id3Tags(file: File): Promise<{ title?: string; artist?: string }> {
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
  const version = head[3];
  const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
  const tags: Record<string, string> = {};
  let at = 10;
  while (at + 10 < Math.min(size + 10, head.length)) {
    const id = String.fromCharCode(head[at], head[at + 1], head[at + 2], head[at + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const length = version === 4
      ? ((head[at + 4] & 0x7f) << 21) | ((head[at + 5] & 0x7f) << 14) | ((head[at + 6] & 0x7f) << 7) | (head[at + 7] & 0x7f)
      : (head[at + 4] << 24) | (head[at + 5] << 16) | (head[at + 6] << 8) | head[at + 7];
    if (length <= 0 || at + 10 + length > head.length) break;
    if (id === 'TIT2' || id === 'TPE1') {
      const body = head.subarray(at + 11, at + 10 + length);
      const encoding = head[at + 10];
      const decoder = new TextDecoder(encoding === 1 ? 'utf-16' : encoding === 2 ? 'utf-16be' : encoding === 3 ? 'utf-8' : 'iso-8859-1');
      tags[id] = decoder.decode(body).replace(/\u0000/g, '').trim();
    }
    at += 10 + length;
  }
  return { title: tags.TIT2 || undefined, artist: tags.TPE1 || undefined };
}

/** A song file can't be listened to, so it becomes its title and artist. */
async function songUpload(file: File): Promise<Upload> {
  const tags = await id3Tags(file).catch(() => ({} as { title?: string; artist?: string }));
  const fromName = file.name.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]+/, '').replace(/[_]+/g, ' ').trim();
  const title = tags.title || fromName || 'this song';
  return { kind: 'text', text: `The song “${title}”${tags.artist ? ` by ${tags.artist}` : ''}` };
}

function isVideo(file: File) {
  return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
}

function isSong(file: File) {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|flac|ogg)$/i.test(file.name);
}

export async function fileToUpload(file: File): Promise<Upload> {
  // Songs and videos are read on the phone (tags, still frames), so their size doesn't matter here.
  if (isSong(file)) return songUpload(file);
  if (isVideo(file)) return { kind: 'video', frames: await videoFrames(file), filename: file.name };
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
  throw new UploadError('That file won’t work. Drop a photo, video, song, PDF or Word doc.');
}

/** Short label for the upload, shown on screens that came from it. */
export function uploadLabel(upload: Upload): string {
  if (upload.kind === 'text' && upload.text.startsWith('The song “')) return upload.text.replace(/^The song /, '');
  if (upload.kind === 'text') return upload.text.length > 60 ? `“${upload.text.slice(0, 60)}…”` : `“${upload.text}”`;
  if (upload.kind === 'photo') return 'your photo';
  if (upload.kind === 'video') return 'your video';
  return upload.filename || 'your document';
}
