const ALLOWED_IMAGE_HOSTS = [
  "cdninstagram.com",
  "fbcdn.net",
  "twimg.com",
  "tiktokcdn.com",
  "muscdn.com",
];

export function isAllowedExternalImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

export function proxiedImageUrl(value: string | null | undefined): string | null {
  if (!value || !isAllowedExternalImageUrl(value)) return null;
  return `/api/media/image?url=${encodeURIComponent(value)}`;
}
