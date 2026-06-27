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
  parent_post_id: string | null;
  parent_post_url: string | null;
  parent_post_caption: string | null;
  parent_post_thumbnail: string | null;
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

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export async function fetchInstagramMentions(handle: string, token: string): Promise<RawMention[]> {
  type Post = {
    id?: string;
    shortCode?: string;
    url?: string;
    caption?: string;
    timestamp?: string;
    ownerUsername?: string;
    displayUrl?: string;
    latestComments?: Array<{
      id?: string;
      text?: string;
      ownerUsername?: string;
      timestamp?: string;
    }>;
  };
  const items = await runActorSync<Post>(
    "apify/instagram-scraper",
    {
      directUrls: [`https://www.instagram.com/${handle.replace(/^@/, "")}/`],
      resultsType: "posts",
      resultsLimit: 20,
      addParentData: false,
    },
    token,
    20,
  );
  const out: RawMention[] = [];
  for (const p of items) {
    const postUrl = p.url ?? (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null);
    const postId = p.id ?? p.shortCode ?? null;
    const cap = clean(p.caption);
    const truncatedCap = cap ? truncate(cap, 240) : null;
    const thumb = p.displayUrl ?? null;
    // Keep the feed focused on interactions, not the account's own captions.
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
        parent_post_id: postId,
        parent_post_url: postUrl,
        parent_post_caption: truncatedCap,
        parent_post_thumbnail: thumb,
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
    inReplyToId?: string;
    inReplyToUrl?: string;
    quoted_tweet?: { id?: string; url?: string; text?: string };
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
      const parentId = t.inReplyToId ?? t.quoted_tweet?.id ?? null;
      const parentUrl = t.inReplyToUrl ?? t.quoted_tweet?.url ?? null;
      const parentCap = t.quoted_tweet?.text ? truncate(clean(t.quoted_tweet.text), 240) : null;
      return {
        network: "twitter",
        external_id: `tw_${t.id ?? t.url ?? Math.random()}`,
        author: t.author?.userName ?? null,
        content: content.slice(0, 1000),
        url: t.url ?? null,
        posted_at: t.createdAt ?? null,
        parent_post_id: parentId,
        parent_post_url: parentUrl,
        parent_post_caption: parentCap,
        parent_post_thumbnail: null,
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
    videoMeta?: { coverUrl?: string };
  };
  const items = await runActorSync<Video>(
    "clockworks/tiktok-scraper",
    {
      profiles: [handle.replace(/^@/, "")],
      resultsPerPage: 10,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    },
    token,
    10,
  );
  return items
    .map((v): RawMention | null => {
      const content = clean(v.text);
      if (!content) return null;
      const url = v.webVideoUrl ?? null;
      const id = v.id ?? null;
      return {
        network: "tiktok",
        external_id: `tt_${id ?? url ?? Math.random()}`,
        author: v.authorMeta?.name ?? handle,
        content: content.slice(0, 1000),
        url,
        posted_at: v.createTimeISO ?? null,
        parent_post_id: id,
        parent_post_url: url,
        parent_post_caption: truncate(content, 240),
        parent_post_thumbnail: v.videoMeta?.coverUrl ?? null,
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
    thumbnailUrl?: string;
  };
  const items = await runActorSync<Post>(
    "apify/facebook-posts-scraper",
    {
      startUrls: [{ url: `https://www.facebook.com/${handle.replace(/^@/, "")}` }],
      resultsLimit: 10,
    },
    token,
    10,
  );
  return items
    .map((p): RawMention | null => {
      const content = clean(p.text);
      if (!content) return null;
      const id = p.postId ?? null;
      const url = p.url ?? null;
      return {
        network: "facebook",
        external_id: `fb_${id ?? url ?? Math.random()}`,
        author: p.user?.name ?? handle,
        content: content.slice(0, 1200),
        url,
        posted_at: p.time ?? null,
        parent_post_id: id,
        parent_post_url: url,
        parent_post_caption: truncate(content, 240),
        parent_post_thumbnail: p.thumbnailUrl ?? null,
      };
    })
    .filter((x): x is RawMention => x !== null);
}
