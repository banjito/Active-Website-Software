import { supabase } from "@/lib/supabase";
import { getViewAs } from "@/lib/viewAs";

/**
 * Uploads one file to a storage folder and reports progress (0-100).
 *
 * Same request supabase-js makes for .upload(), sent with XMLHttpRequest
 * because fetch can't report upload progress. Storage rules apply as normal
 * (it uses the signed-in person's login).
 */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  // This request skips the Supabase client, so check "View as" here too.
  if (getViewAs()) throw new Error("View as is read-only. Nothing was saved.");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("You're signed out. Sign in and try again.");

  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");

  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${bucket}/${encodedPath}`);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const b = JSON.parse(xhr.responseText);
        message = b.message || b.error || message;
      } catch {
        /* not JSON */
      }
      reject(new Error(message));
    };
    xhr.onerror = () =>
      reject(new Error("Connection problem. Check your internet and try again."));
    xhr.send(body);
  });
}
