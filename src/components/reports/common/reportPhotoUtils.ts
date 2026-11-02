/**
 * Report photo helpers with no database connection, so code that only needs
 * them (and its tests) doesn't load the Supabase client.
 */

/**
 * Derives { jobId, slug, reportId } from the current URL.
 * Standard report routes follow /jobs/:jobId/:slug/:reportId (same logic as
 * ReportWrapper's lock check); custom form routes follow
 * /jobs/:jobId/custom-form/:templateId/:instanceId. Returns null for unsaved
 * reports (no saved id yet) or non-report pages.
 */
export const deriveReportPathParts = () => {
  if (typeof window === "undefined") return null;
  const parts = (window.location?.pathname || "").split("/").filter(Boolean);
  const jobsIdx = parts.indexOf("jobs");
  if (jobsIdx === -1 || parts.length < jobsIdx + 4) return null;
  const jobId = parts[jobsIdx + 1];
  let slug = parts[jobsIdx + 2];
  let reportId = parts[jobsIdx + 3];
  if (slug === "custom-form") {
    // reportId currently holds the templateId; the instance id comes next.
    const instanceId = parts[jobsIdx + 4];
    if (!instanceId) return null;
    slug = `custom-form/${reportId}`;
    reportId = instanceId;
  }
  if (!jobId || !slug || !reportId || reportId === "new") return null;
  return { jobId, slug, reportId };
};

/**
 * Downscale + convert any browser-decodable image to JPEG. The bucket only
 * accepts jpeg/png/gif for images, and JPEG keeps printed PDFs light.
 */
export const toJpeg = async (file: File, maxDim = 1600): Promise<File> => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error("Unable to decode image in this browser."));
      el.src = objectUrl;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(w, h));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image conversion failed."))),
        "image/jpeg",
        0.85,
      );
    });

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

