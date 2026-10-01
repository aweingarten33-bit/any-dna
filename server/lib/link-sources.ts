// Which pasted links are supported. Shared by the browser (to recognize a link)
// and the server (to read it), so it has no server-only code.

export type LinkSource = 'spotify' | 'apple-music' | 'youtube' | 'tiktok' | 'instagram' | 'github';

const HOSTS: Array<[RegExp, LinkSource]> = [
  [/^(open\.)?spotify\.com$|^spotify\.link$/, 'spotify'],
  [/^music\.apple\.com$/, 'apple-music'],
  [/^(www\.|m\.|music\.)?youtube\.com$|^youtu\.be$/, 'youtube'],
  [/^(www\.|m\.|vm\.|vt\.)?tiktok\.com$/, 'tiktok'],
  [/^(www\.)?instagram\.com$/, 'instagram'],
  [/^(www\.)?github\.com$/, 'github'],
];

export const LINK_NAMES: Record<LinkSource, string> = {
  spotify: 'Spotify', 'apple-music': 'Apple Music', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', github: 'GitHub',
};

/** The supported service a link belongs to, or null. Only https links count. */
export function linkSource(raw: string): LinkSource | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  return HOSTS.find(([pattern]) => pattern.test(url.hostname.toLowerCase()))?.[1] ?? null;
}
