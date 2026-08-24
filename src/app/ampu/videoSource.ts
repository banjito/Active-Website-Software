/**
 * Normalizes whatever an admin pastes into the New Unit form into the two
 * fields the player understands: a YouTube id, or a direct file URL.
 */

export interface VideoSource {
  youtubeId?: string;
  videoUrl?: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Pulls the id out of any of the URL shapes YouTube hands out, or a bare id. */
export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (YOUTUBE_ID.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return YOUTUBE_ID.test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") {
    return null;
  }

  const v = url.searchParams.get("v");
  if (v && YOUTUBE_ID.test(v)) return v;

  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && ["embed", "shorts", "live", "v"].includes(segments[0])) {
    return YOUTUBE_ID.test(segments[1]) ? segments[1] : null;
  }
  return null;
}

/**
 * A YouTube link becomes a tracked embed; anything else is treated as a direct
 * media URL. Returns null when the input is neither.
 */
export function toVideoSource(input: string): VideoSource | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const youtubeId = parseYouTubeId(trimmed);
  if (youtubeId) return { youtubeId };

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { videoUrl: url.toString() };
  } catch {
    return null;
  }
}

/** "1:04:06" / "3:20" from a second count, for lesson subtitles. */
export function formatRuntime(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
