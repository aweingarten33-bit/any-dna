// Pasted links: Spotify, Apple Music, YouTube, TikTok, Instagram and GitHub. The
// server reads what the service publicly shares about the link (title, creator,
// cover image, a repo's description and README) and nothing else. Only these services are fetched, never an arbitrary
// address, so a pasted link can't point the server at something private.

export class LinkError extends Error {}

import { LINK_NAMES, linkSource, type LinkSource } from './link-sources.ts';

export { LINK_NAMES, linkSource, type LinkSource };

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
    if (source === 'github') return await githubRepo(url);
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
    // Short codes (a status number, "private") become a plain message; written messages pass through.
    if (error instanceof LinkError && /^(\d+|private)$/.test(error.message)) throw new LinkError(`${LINK_NAMES[source]} didn’t share that link. Try a screenshot, or type what it is.`);
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

// ---- GitHub ------------------------------------------------------------------
// Public repos through GitHub's REST API. Without a token GitHub allows 60
// requests an hour per server, so each repo is remembered for an hour; set
// GITHUB_TOKEN (any token, no scopes needed) to raise the limit.

const repoCache = new Map<string, { at: number; info: LinkInfo }>();

async function githubJson(path: string, accept = 'application/vnd.github+json'): Promise<Response> {
  const token = Deno.env.get('GITHUB_TOKEN');
  return await fetch(`https://api.github.com${path}`, {
    signal: AbortSignal.timeout(8000),
    headers: { accept, 'user-agent': 'SpinoffBot/1.0', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
}

async function githubRepo(raw: string): Promise<LinkInfo> {
  const [owner, repo] = new URL(raw).pathname.split('/').filter(Boolean);
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new LinkError('Paste a link to a GitHub repo, like github.com/owner/name.');
  const name = `${owner}/${repo.replace(/\.git$/, '')}`;
  const cached = repoCache.get(name.toLowerCase());
  if (cached && Date.now() - cached.at < 3600_000) return cached.info;

  const response = await githubJson(`/repos/${name}`);
  if (response.status === 404) throw new LinkError('That GitHub repo is private or doesn’t exist. Only public repos can be read.');
  if (response.status === 403 || response.status === 429) throw new LinkError('GitHub is limiting requests right now. Try again in a few minutes, or paste what the repo does.');
  if (!response.ok) throw new LinkError(`${response.status}`);
  const data = await response.json() as Record<string, unknown>;
  const readme = await githubJson(`/repos/${name}/readme`, 'application/vnd.github.raw').then((r) => (r.ok ? r.text() : '')).catch(() => '');
  const topics = Array.isArray(data.topics) ? (data.topics as unknown[]).filter((t): t is string => typeof t === 'string') : [];
  const facts = [
    typeof data.stargazers_count === 'number' ? `${data.stargazers_count.toLocaleString('en-US')} stars` : '',
    str(data.language) ? `written in ${str(data.language)}` : '',
    topics.length ? `topics: ${topics.slice(0, 8).join(', ')}` : '',
  ].filter(Boolean).join('; ');
  const info: LinkInfo = {
    source: 'github', kind: 'repo',
    title: str(data.full_name) || name,
    creator: str((data.owner as Record<string, unknown> | undefined)?.login),
    detail: [str(data.description), facts, readme ? `README (start):\n${readme.replace(/<[^>]+>/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, 5000)}` : ''].filter(Boolean).join('\n'),
    imageUrl: '',
  };
  if (repoCache.size > 500) repoCache.clear();
  repoCache.set(name.toLowerCase(), { at: Date.now(), info });
  return info;
}
