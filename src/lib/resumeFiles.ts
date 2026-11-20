/**
 * Resumes and cover letters (the "resumes" storage bucket) are private.
 * Candidate rows still hold the old public-style address
 * (.../object/public/resumes/<path>), which no longer opens by itself.
 * These helpers swap in a short-lived signed link when someone views it.
 * Only Talent Pool people can sign one (database rule, permissions_08).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const RESUMES_BUCKET = "resumes";

const MARKERS = [
  `/storage/v1/object/public/${RESUMES_BUCKET}/`,
  `/storage/v1/object/sign/${RESUMES_BUCKET}/`,
];
const VIEW_SECONDS = 60 * 60;

/** The file's path inside the bucket, or null when the address isn't a resume file. */
export function resumeFilePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = MARKERS.find((m) => url.includes(m));
  if (!marker) return null;
  const rest = url.slice(url.indexOf(marker) + marker.length).split(/[?#]/)[0];
  if (!rest) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/**
 * A link that opens now. Addresses outside the resumes folder come back as they are.
 * Null when the person can't open it or the file is gone.
 */
export async function signResumeUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;
  const path = resumeFilePath(url);
  if (!path) return url;
  const { data, error } = await supabase.storage
    .from(RESUMES_BUCKET)
    .createSignedUrl(path, VIEW_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Signed link for a stored resume address.
 * undefined = still loading; null = no file, or the person can't open it.
 */
export function useSignedResumeUrl(
  url: string | null | undefined,
): string | null | undefined {
  const [signed, setSigned] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setSigned(url ? undefined : null);
    if (url) {
      signResumeUrl(url).then((s) => {
        if (!cancelled) setSigned(s);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [url]);
  return signed;
}
