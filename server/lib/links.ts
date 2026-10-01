// Pasted links: Spotify, Apple Music, YouTube, TikTok and Instagram. The server
// reads what the service publicly shares about the link (title, creator, cover
// image) and nothing else. Only these services are fetched, never an arbitrary
// address, so a pasted link can't point the server at something private.

export class LinkError extends Error {}

export type LinkSource = 'spotify' | 'apple-music' | 'youtube' | 'tiktok' | 'instagram';

export type LinkInfo = {
  source: LinkSource;
  /** What the service calls it: a song, a video, a post. */
  kind: string;
  title: string;
  creator: string;
  /** Extra public text: a caption, an album, a year. */
  detail: string;
  /** The cover image or thumbnail, if the service shared one. */
  imageUrl: string;
};

const HOSTS: Array<[RegExp, LinkSource]> = [
  [/^(open\.)?spotify\.com$|^spotify\.link$/, 'spotify'],
  [/^music\.apple\.com$/, 'apple-music'],
  [/^(www\.|m\.|music\.)?youtube\.com$|^youtu\.be$/, 'youtube'],
  [/^(www\.|m\.|vm\.|vt\.)?tiktok\.com$/, 'tiktok'],
  [/^(www\.)?instagram\.com$/, 'instagram'],
];

export const LINK_NAMES: Record<LinkSource, string> = {
  spotify: 'Spotify', 'apple-music': 'Apple Music', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram',
};

/** The supported service a link belongs to, or null. Only https links count. */
export function linkSource(raw: string): LinkSource | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  return HOSTS.find(([pattern]) => pattern.test(url.hostname.toLowerCase()))?.[1] ?? null;
}

async function fetchText(url: string, accept: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    redirect: 'follow',
    headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; SpinoffBot/1.0)', 'accept-language': 'en' },
  });
  if (!response.ok) throw new LinkError(`${response.status}`);
  // A page is only read for its first part, where the share tags are.
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < 400_000) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(chunks.length === 1 ? chunks[0] : concat(chunks, size));
}

function concat(chunks: Uint8Array[], size: number) {
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

async function oembed(endpoint: string, url: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fetchText(`${endpoint}?url=${encodeURIComponent(url)}&format=json`, 'application/json'));
}

function decodeEntities(text: string) {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** The page's share tags (og:title and friends), which is what a link preview in a chat app shows. */
async function shareTags(url: string): Promise<Record<string, string>> {
  const html = await fetchText(url, 'text/html');
  const tags: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\s+[^>]*?(?:property|name)=["']([^"']+)["'][^>]*?content=["']([^"']*)["'][^>]*>/gi)) tags[match[1].toLowerCase()] ??= decodeEntities(match[2]);
  for (const match of html.matchAll(/<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']([^"']+)["'][^>]*>/gi)) tags[match[2].toLowerCase()] ??= decodeEntities(match[1]);
  return tags;
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Reads what a supported service publicly shares about a link. */
export async function readLink(raw: string): Promise<LinkInfo> {
  const source = linkSource(raw);
  if (!source) throw new LinkError('unsupported');
  const url = raw.trim();
  try {
    if (source === 'youtube') {
      const data = await oembed('https://www.youtube.com/oembed', url);
      return { source, kind: 'video', title: str(data.title), creator: str(data.author_name), detail: '', imageUrl: str(data.thumbnail_url) };
    }
    if (source === 'tiktok') {
      const data = await oembed('https://www.tiktok.com/oembed', url);
      return { source, kind: 'video', title: str(data.title), creator: str(data.author_name), detail: '', imageUrl: str(data.thumbnail_url) };
    }
    if (source === 'spotify') {
      // og:description reads like "Seal · Song · 1994" or "Seal · Kiss from a Rose · Song · 1994".
      const tags = await shareTags(url);
      const parts = str(tags['og:description']).split('·').map((part) => part.trim()).filter(Boolean);
      const kind = /episode/i.test(tags['og:type'] ?? '') ? 'podcast episode' : /album/i.test(tags['og:type'] ?? '') ? 'album' : /playlist/i.test(tags['og:type'] ?? '') ? 'playlist' : 'song';
      return { source, kind, title: str(tags['og:title']), creator: parts[0] ?? '', detail: parts.slice(1).join(' · '), imageUrl: str(tags['og:image']) };
    }
    if (source === 'apple-music') {
      const tags = await shareTags(url);
      return { source, kind: 'song', title: str(tags['og:title']), creator: '', detail: str(tags['og:description']), imageUrl: str(tags['og:image']) };
    }
    // Instagram often shows logged-out visitors nothing; a generic title means it didn't share the post.
    const tags = await shareTags(url);
    const title = str(tags['og:title']);
    if (!title || /^instagram$/i.test(title)) throw new LinkError('private');
    return { source, kind: 'post', title, creator: '', detail: str(tags['og:description']), imageUrl: str(tags['og:image']) };
  } catch (error) {
    if (error instanceof LinkError && error.message !== 'unsupported') throw new LinkError(`${LINK_NAMES[source]} didn’t share that link. Try a screenshot, or type what it is.`);
    if (error instanceof LinkError) throw error;
    throw new LinkError(`Couldn’t read that ${LINK_NAMES[source]} link. Check it’s public, or type what it is.`);
  }
}

/** The link's cover image as a data URL, if it's a reasonable size. A missing image is fine. */
export async function linkImage(imageUrl: string): Promise<string | null> {
  if (!/^https:\/\//.test(imageUrl)) return null;
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/^image\/(jpeg|png|webp)/.test(type)) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 3 * 1024 * 1024) return null;
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${type.split(';')[0]};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}
