// Turning the user's drop into an upload the server can read.
// Photos are resized on-device before upload. Videos become a few small still
// frames on-device, so the original video never has to be uploaded.
import type { Upload } from '../../server/lib/types.ts';
import { LINK_NAMES, linkSource } from '../../server/lib/link-sources.ts';

const MAX_DIMENSION = 1400;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_SOURCE_BYTES = 40 * 1024 * 1024;
const MEDIA_STEP_TIMEOUT_MS = 8_000;

export class UploadError extends Error {}

function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new UploadError(message)), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new UploadError('Couldn’t read that file. Try again.'));
    reader.readAsDataURL(file);
  });
}

function loadImageUrl(url: string): Promise<HTMLImageElement> {
  return timeout(new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new UploadError('That photo couldn’t be opened. Try another photo.'));
    image.src = url;
  }), MEDIA_STEP_TIMEOUT_MS, 'That photo is taking too long to open. Try another one.');
}

function isHeic(file: File) {
  return file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name);
}

/** Resize before upload. Avoid first copying a large phone photo into a huge base64 string. */
async function photoDataURL(file: File): Promise<string> {
  if (file.size > MAX_PHOTO_SOURCE_BYTES) throw new UploadError('That photo is too large. Try a regular photo instead of RAW.');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageUrl(url);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new UploadError('That photo couldn’t be prepared. Try another one.');
    context.drawImage(image, 0, 0, width, height);
    const converted = canvas.toDataURL('image/jpeg', 0.78);
    if (!converted || converted === 'data:,') throw new UploadError('That photo couldn’t be prepared. Try another one.');
    return converted;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const FRAME_SIZE = 640;
const FRAME_POINTS = [0.15, 0.5, 0.85] as const;

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && Number.isFinite(video.duration)) return Promise.resolve();
  return timeout(new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new UploadError('That video couldn’t be opened. Try another phone video.')); };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', done);
      video.removeEventListener('error', fail);
    };
    video.addEventListener('loadedmetadata', done, { once: true });
    video.addEventListener('error', fail, { once: true });
  }), MEDIA_STEP_TIMEOUT_MS, 'That video is taking too long to open. Try a shorter one.');
}

/** Attach listeners before changing currentTime. Otherwise fast phones can fire seeked before we listen and hang forever. */
function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.02) return Promise.resolve();
  return timeout(new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new UploadError('That video couldn’t be read. Try another one.')); };
    const cleanup = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
    };
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', fail, { once: true });
    try {
      video.currentTime = time;
    } catch {
      cleanup();
      reject(new UploadError('That video couldn’t be read. Try another one.'));
    }
  }), MEDIA_STEP_TIMEOUT_MS, 'That video is taking too long to read. Try a shorter one.');
}

/** Three small still frames from across a video. The original video never leaves the phone. */
async function videoFrames(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;
    video.load();
    await waitForVideoMetadata(video);

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const sourceWidth = video.videoWidth || FRAME_SIZE;
    const sourceHeight = video.videoHeight || FRAME_SIZE;
    const scale = Math.min(1, FRAME_SIZE / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new UploadError('That video couldn’t be prepared. Try another one.');

    const frames: string[] = [];
    for (const point of FRAME_POINTS) {
      const target = Math.max(0, Math.min(duration - 0.01, duration * point));
      await seekVideo(video, target);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = canvas.toDataURL('image/jpeg', 0.72);
      if (!frame || frame === 'data:,') throw new UploadError('That video couldn’t be read. Try another one.');
      frames.push(frame);
    }
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
  return { kind: 'text', text: `The song “${title}”${tags.artist ? ` by ${tags.artist}` : ''}`, from: 'song-file' };
}

function isVideo(file: File) {
  return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
}

function isSong(file: File) {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|flac|ogg)$/i.test(file.name);
}

export async function fileToUpload(file: File): Promise<Upload> {
  // Songs and videos are read locally (tags or still frames), so the whole media file is never uploaded.
  if (isSong(file)) return songUpload(file);
  if (isVideo(file)) return { kind: 'video', frames: await videoFrames(file), filename: file.name };

  // Photos are allowed to start much larger because we shrink them before they leave the phone.
  if (file.type.startsWith('image/') || isHeic(file)) {
    return { kind: 'photo', dataUrl: await photoDataURL(file), filename: file.name };
  }

  if (file.size > MAX_DOCUMENT_BYTES) throw new UploadError('That document is too big. Keep it under 10 MB.');
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
  if (upload.kind === 'text' && upload.from === 'song-file') return upload.text.replace(/^The song /, '');
  if (upload.kind === 'text') return upload.text.length > 60 ? `“${upload.text.slice(0, 60)}…”` : `“${upload.text}”`;
  if (upload.kind === 'link') { const source = linkSource(upload.url); return source ? `your ${LINK_NAMES[source]} link` : 'your link'; }
  if (upload.kind === 'photo') return 'your photo';
  if (upload.kind === 'video') return 'your video';
  return upload.filename || 'your document';
}

/**
 * What the user typed in the box: a supported link becomes a link upload,
 * any other web address is refused with the services we can read, and
 * anything else is their words.
 */
export function typedToUpload(text: string): Upload {
  const trimmed = text.trim();
  const looksLikeLink = /^(https?:\/\/|www\.)/i.test(trimmed) || /^[\w-]+(\.[\w-]+)+\/\S*$/.test(trimmed);
  const candidate = looksLikeLink && !/\s/.test(trimmed)
    ? (trimmed.startsWith('http') ? trimmed : `https://${trimmed}`).replace(/^http:/, 'https:')
    : null;
  if (!candidate) return { kind: 'text', text: trimmed };
  if (linkSource(candidate)) return { kind: 'link', url: candidate };
  throw new UploadError('Paste a Spotify, Apple Music, YouTube, TikTok, Instagram or GitHub link, or type what it is.');
}
