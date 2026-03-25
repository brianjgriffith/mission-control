/**
 * Normalizes YouTube channel inputs into a consistent URL format.
 *
 * Handles:
 * - Full URLs: https://www.youtube.com/@handle, /channel/UCxxxx, /c/Name, /user/Name
 * - @handles: @ThinkMedia, @ ThinkMedia
 * - Bare handles: ThinkMedia (if it looks like a channel name)
 * - Channel IDs: UCxxxx
 *
 * Returns a normalized URL string, or null if the input is unparseable / empty.
 */
export function normalizeYouTubeChannel(
  input: string | null | undefined
): string | null {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already a full YouTube URL — extract the path and re-normalize
  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/([@a-zA-Z0-9_\-/]+)/i
  );
  if (urlMatch) {
    const path = urlMatch[1].replace(/\/+$/, ""); // trim trailing slashes
    return `https://www.youtube.com/${path}`;
  }

  // youtu.be links (rare for channels, but handle gracefully)
  if (/youtu\.be/i.test(trimmed)) return null; // video link, not a channel

  // @handle format (with or without space after @)
  const handleMatch = trimmed.match(/^@\s*([a-zA-Z0-9_\-]+)$/);
  if (handleMatch) {
    return `https://www.youtube.com/@${handleMatch[1]}`;
  }

  // Bare channel ID (starts with UC and is 24 chars)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
    return `https://www.youtube.com/channel/${trimmed}`;
  }

  // Bare handle-like string (alphanumeric, no spaces, reasonable length)
  if (/^[a-zA-Z0-9_\-]{2,50}$/.test(trimmed)) {
    return `https://www.youtube.com/@${trimmed}`;
  }

  // If nothing matched, return null — input is too messy to normalize
  return null;
}
