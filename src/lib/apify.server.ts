/**
 * Server-only Apify client. Calls actors synchronously and returns
 * dataset items. Each `fetch*` helper normalizes the raw result into
 * a common shape `RawMention` so the sentiment pipeline is network-agnostic.
 */

export type RawMention = {
  network: "instagram" | "twitter" | "tiktok" | "facebook";
  external_id: string;
  author: string | null;
  content: string;
  url: string | null;
  posted_at: string | null;
};

const APIFY_BASE = "https://api.apify.com/v2";

async function runActorSync<T = unknown>(
  actorId: string,
  input: Record<string, unknown>,
  token: string,
  maxItems = 40,
  timeoutSecs = 90,
): Promise<T[]> {
  const url = `${APIFY_BASE}/acts/${actorId.replace("/", "~")}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token,
  )}&timeout=${timeoutSecs}&memory=512`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, maxItems }),
    });
    if (!res.ok) {
      console.error(`[apify] ${actorId} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return [];
    }
    const json = await res.json();
    return Array.isArray(json) ? (json as T[]) : [];
  } catch (e) {
    console.error(`[apify] ${actorId} threw`, e);
    return [];
  }
}

function clean(s: unknown): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
}

export async function fetchInstagramMentions(handle: string, token: string): Promise<RawMention[]> {
  type Post = {
    id?: string;
    shortCode?: string;
    url?: string;
    caption?: string;
    timestamp?: string;
    ownerUsername?: string;
    latestComments?: Array<{ id?: string; text?: string; ownerUsername?: string; timestamp?: string }>;
  };
  const items = await runActorSync<Post>(
    "apify/instagram-scraper",
    {
      directUrls: [`https://www.instagram.com/${handle.replace(/^@/, "")}/`],
      resultsType: "posts",
      resultsLimit: 8,
      addParentData: false,
    },
    token,
    8,
  );
  const out: RawMention[] = [];
  for (const p of items) {
    const postUrl = p.url ?? (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null);
    const cap = clean(p.caption);
    if (cap) {
      out.push({
        network: "instagram",
        external_id: `ig_post_${p.id ?? p.shortCode ?? Math.random()}`,
        author: p.ownerUsername ?? handle,
        content: cap.slice(0, 1200),
        url: postUrl,
        posted_at: p.timestamp ?? null,
      });
    }
    for (const c of p.latestComments ?? []) {
      const text = clean(c.text);
      if (!text) continue;
      out.push({
        network: "instagram",
        external_id: `ig_cmt_${c.id ?? `${p.shortCode}_${out.length}`}`,
        author: c.ownerUsername ?? null,
        content: text.slice(0, 800),
        url: postUrl,
        posted_at: c.timestamp ?? null,
      });
    }
  }
  return out;
}

export async function fetchTwitterMentions(
  handle: string | null,
  keywords: string[],
  token: string,
): Promise<RawMention[]> {
  type Tweet = {
    id?: string;
    url?: string;
    text?: string;
    fullText?: string;
    createdAt?: string;
    author?: { userName?: string; name?: string };
  };
  const terms: string[] = [];
  if (handle) terms.push(`@${handle.replace(/^@/, "")}`);
  for (const k of keywords.slice(0, 3)) terms.push(`"${k}"`);
  if (!terms.length) return [];

  const items = await runActorSync<Tweet>(
    "apidojo/tweet-scraper",
    { searchTerms: terms, sort: "Latest", tweetLanguage: "pt", maxItems: 40 },
    token,
    40,
  );
  return items
    .map((t): RawMention | null => {
      const content = clean(t.fullText ?? t.text);
      if (!content) return null;
      return {
        network: "twitter",
        external_id: `tw_${t.id ?? t.url ?? Math.random()}`,
        author: t.author?.userName ?? null,
        content: content.slice(0, 1000),
        url: t.url ?? null,
        posted_at: t.createdAt ?? null,
      };
    })
    .filter((x): x is RawMention => x !== null);
}

export async function fetchTiktokMentions(handle: string, token: string): Promise<RawMention[]> {
  type Video = {
    id?: string;
    webVideoUrl?: string;
    text?: string;
    createTimeISO?: string;
    authorMeta?: { name?: string };
  };
  const items = await runActorSync<Video>(
    "clockworks/tiktok-scraper",
    { profiles: [handle.replace(/^@/, "")], resultsPerPage: 10, shouldDownloadVideos: false, shouldDownloadCovers: false },
    token,
    10,
  );
  return items
    .map((v): RawMention | null => {
      const content = clean(v.text);
      if (!content) return null;
      return {
        network: "tiktok",
        external_id: `tt_${v.id ?? v.webVideoUrl ?? Math.random()}`,
        author: v.authorMeta?.name ?? handle,
        content: content.slice(0, 1000),
        url: v.webVideoUrl ?? null,
        posted_at: v.createTimeISO ?? null,
      };
    })
    .filter((x): x is RawMention => x !== null);
}

export async function fetchFacebookMentions(handle: string, token: string): Promise<RawMention[]> {
  type Post = {
    postId?: string;
    url?: string;
    text?: string;
    time?: string;
    user?: { name?: string };
  };
  const items = await runActorSync<Post>(
    "apify/facebook-posts-scraper",
    { startUrls: [{ url: `https://www.facebook.com/${handle.replace(/^@/, "")}` }], resultsLimit: 10 },
    token,
    10,
  );
  return items
    .map((p): RawMention | null => {
      const content = clean(p.text);
      if (!content) return null;
      return {
        network: "facebook",
        external_id: `fb_${p.postId ?? p.url ?? Math.random()}`,
        author: p.user?.name ?? handle,
        content: content.slice(0, 1200),
        url: p.url ?? null,
        posted_at: p.time ?? null,
      };
    })
    .filter((x): x is RawMention => x !== null);
}
