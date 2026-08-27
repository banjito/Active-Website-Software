import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchSites, type SiteWithCounts } from "@/services/sitesService";
import {
  moveAssetsToSite,
  previewSiteMove,
  type SiteMovePreview,
} from "@/services/equipmentAssetsService";
import { formatSiteLabel } from "@/lib/types/assetTracking";
import { useAuth } from "@/lib/AuthContext";
import type { EquipmentAssetWithCounts } from "@/lib/types/assetTracking";

/**
 * Re-homes the selected equipment at a different site.
 *
 * Nothing is copied and nothing is retyped: the asset rows keep their ids, so every
 * report, nameplate value and note goes with them. Only which facility owns them changes.
 *
 * The checks run before the confirm button is live, because the two ways this goes wrong
 * are both silent: an identifier already taken at the destination (the database rejects
 * it mid-batch) and a job left pointing at equipment that has moved away.
 */

export interface MoveAssetsToSiteDialogProps {
  open: boolean;
  onClose: () => void;
  /** The assets ticked in the list, in display order. */
  assets: EquipmentAssetWithCounts[];
  /** The site being moved from, for the confirmation copy. Omit in a mixed selection. */
  sourceSiteLabel?: string;
  /** Fired after a successful move so the caller can refresh its list. */
  onMoved: (movedCount: number, target: SiteWithCounts) => void;
}

/** Long lists get an "and N more" tail rather than a scrollbar race. */
const PREVIEW_LIMIT = 15;

const MoveAssetsToSiteDialog: React.FC<MoveAssetsToSiteDialogProps> = ({
  open,
  onClose,
  assets,
  sourceSiteLabel,
  onMoved,
}) => {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [sites, setSites] = useState<SiteWithCounts[]>([]);
  const [site, setSite] = useState<SiteWithCounts | null>(null);
  const [preview, setPreview] = useState<SiteMovePreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Results are hidden once a site is picked, and shown again while typing. */
  const [showResults, setShowResults] = useState(false);
  /** Whether the current press began on the backdrop rather than the panel. */
  const pressedBackdrop = useRef(false);
  const siteFieldRef = useRef<HTMLDivElement>(null);

  const sourceSiteIds = useMemo(
    () => [...new Set(assets.map((a) => a.site_id))],
    [assets],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSite(null);
    setPreview(null);
    setError(null);
    setShowResults(false);
  }, [open]);

  // The suggestion list floats over the form, so a click anywhere else dismisses it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!siteFieldRef.current?.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Close on Escape, and hold the page still behind the backdrop.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingSites(true);
    fetchSites()
      .then((rows) => {
        if (!cancelled) setSites(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(String((err as Error)?.message || err));
      })
      .finally(() => {
        if (!cancelled) setLoadingSites(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Re-checked whenever the destination changes: every conflict is relative to it.
  useEffect(() => {
    if (!open || !site) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    setError(null);
    previewSiteMove(assets, site.id)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err) => {
        if (!cancelled) setError(String((err as Error)?.message || err));
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, site, assets]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites
      // Moving to the site an asset already sits at is a no-op — and with one source
      // site, offering it back is just a way to waste a click.
      .filter((s) => !(sourceSiteIds.length === 1 && s.id === sourceSiteIds[0]))
      .filter((s) =>
        q
          ? [s.name, s.city, s.state, s.address]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(q)
          : true,
      )
      .slice(0, 50);
  }, [sites, query, sourceSiteIds]);

  const blockers =
    (preview?.conflicts.length ?? 0) + (preview?.splitFamilies.length ?? 0);

  const submit = useCallback(async () => {
    if (!site || assets.length === 0 || blockers > 0) return;
    setBusy(true);
    setError(null);
    try {
      const moved = await moveAssetsToSite(assets, site.id, user?.id);
      onMoved(moved, site);
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setBusy(false);
    }
  }, [site, assets, blockers, user?.id, onMoved, onClose]);

  if (!open) return null;

  const count = assets.length;
  const plural = count === 1 ? "asset" : "assets";

  // Portalled to <body>: an ancestor of the page content creates a containing block for
  // position:fixed, which otherwise pins the backdrop to the <main> box and leaves the
  // header and sidebar undimmed. z-index clears the app header, which is sticky at z-50.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Move assets to another site"
      // Close only when the press *started* on the backdrop, so a drag that begins inside
      // the panel and releases outside it does not close the dialog mid text-selection.
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current && !busy) onClose();
        pressedBackdrop.current = false;
      }}
    >
      <div className="max-h-full w-full max-w-lg overflow-y-auto border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
          Move {count} {plural} to another site
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          The equipment keeps its identifier, nameplate data and every linked report.
          Nothing is copied — only which facility owns it changes.
        </p>

        <div className="mt-5 space-y-4">
          {sourceSiteLabel && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-neutral-900 dark:text-white">
                Moving from
              </span>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {sourceSiteLabel}
              </p>
            </div>
          )}

          {/* Named up front: moving the wrong equipment is the mistake this dialog can
              cause, and the selection was made on a list that may be filtered. */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              Moving
            </span>
            <ul className="max-h-32 overflow-y-auto border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
              {assets.slice(0, 200).map((asset) => (
                <li key={asset.id} className="truncate py-0.5">
                  {asset.identifier}
                  {(asset.building_area || asset.substation) && (
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {" · "}
                      {[asset.building_area, asset.substation].filter(Boolean).join(" / ")}
                    </span>
                  )}
                </li>
              ))}
              {count > 200 && (
                <li className="py-0.5 text-neutral-500 dark:text-neutral-400">
                  …and {count - 200} more
                </li>
              )}
            </ul>
          </div>

          <div className="space-y-2" ref={siteFieldRef}>
            <label
              htmlFor="move-assets-site"
              className="text-sm font-medium text-neutral-900 dark:text-white"
            >
              Move to site *
            </label>
            {/* Anchored to the input, so the list floats over what follows instead of
                shoving the rest of the form down. */}
            <div className="relative">
              <input
                id="move-assets-site"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  // Typing means they are looking again.
                  setShowResults(true);
                  setSite(null);
                }}
                onFocus={() => setShowResults(true)}
                placeholder="Search by site name or city"
                className="w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />

              {showResults && (
                <div className="absolute left-0 right-0 top-full z-10 max-h-56 overflow-y-auto border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  {loadingSites ? (
                    <p className="px-3 py-2 text-sm text-neutral-400">Loading…</p>
                  ) : options.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-neutral-400">No sites found.</p>
                  ) : (
                    options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setSite(option);
                          // Collapse the list and show the choice in the field.
                          setQuery(formatSiteLabel(option));
                          setShowResults(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        <span className="truncate">{formatSiteLabel(option)}</span>
                        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                          {option.asset_count} asset{option.asset_count === 1 ? "" : "s"}{" "}
                          already registered
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {checking && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Checking for identifier clashes…
            </p>
          )}

          {preview && !checking && (
            <div className="space-y-3">
              {preview.conflicts.length > 0 && (
                <div className="rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  <p className="font-medium">
                    {preview.conflicts.length} identifier
                    {preview.conflicts.length === 1 ? "" : "s"} already in use at that
                    site
                  </p>
                  <p className="mt-1">
                    An identifier has to be unique within a site, building and substation
                    so reports attach to the right piece of equipment. Rename these, or
                    untick them, before moving.
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {preview.conflicts.slice(0, PREVIEW_LIMIT).map((c, i) => (
                      <li key={`${c.identifier}-${i}`} className="truncate">
                        {c.identifier}
                        {(c.building_area || c.substation) && (
                          <span className="opacity-70">
                            {" · "}
                            {[c.building_area, c.substation].filter(Boolean).join(" / ")}
                          </span>
                        )}
                      </li>
                    ))}
                    {preview.conflicts.length > PREVIEW_LIMIT && (
                      <li>…and {preview.conflicts.length - PREVIEW_LIMIT} more</li>
                    )}
                  </ul>
                </div>
              )}

              {preview.splitFamilies.length > 0 && (
                <div className="rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  <p className="font-medium">
                    {preview.splitFamilies.length} sub-asset
                    {preview.splitFamilies.length === 1 ? "" : "s"} would be left behind
                  </p>
                  <p className="mt-1">
                    A sub-asset has to live at the same site as its parent. Tick these too,
                    or untick their parent.
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {preview.splitFamilies.slice(0, PREVIEW_LIMIT).map((a) => (
                      <li key={a.id} className="truncate">
                        {a.identifier}
                      </li>
                    ))}
                    {preview.splitFamilies.length > PREVIEW_LIMIT && (
                      <li>…and {preview.splitFamilies.length - PREVIEW_LIMIT} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Not a blocker: the same equipment is often worked by two customers, and
                  a job that already covers it should keep covering it. Shown so nobody
                  discovers it from the job's Assets tab a week later. */}
              {preview.offSiteJobs.length > 0 && (
                <div className="rounded-none border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <p className="font-medium">
                    {preview.offSiteJobs.length} job
                    {preview.offSiteJobs.length === 1 ? "" : "s"} will still list this
                    equipment
                  </p>
                  <p className="mt-1">
                    These jobs are not at the destination site. Their links are kept — the
                    equipment stays on the job's Assets tab. Remove it there if that is
                    wrong.
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {preview.offSiteJobs.slice(0, PREVIEW_LIMIT).map((j) => (
                      <li key={j.id} className="truncate">
                        {[j.job_number, j.title].filter(Boolean).join(" — ")} ·{" "}
                        {j.asset_count} asset{j.asset_count === 1 ? "" : "s"}
                      </li>
                    ))}
                    {preview.offSiteJobs.length > PREVIEW_LIMIT && (
                      <li>…and {preview.offSiteJobs.length - PREVIEW_LIMIT} more</li>
                    )}
                  </ul>
                </div>
              )}

              {blockers === 0 && (
                <div className="rounded-none border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
                  <p>
                    No clashes. {preview.reportCount} linked report
                    {preview.reportCount === 1 ? "" : "s"} will move with the equipment.
                  </p>
                  {preview.staleFolderCount > 0 && (
                    <p className="mt-1">
                      {preview.staleFolderCount} folder filing
                      {preview.staleFolderCount === 1 ? "" : "s"} will be cleared, because
                      those folders belong to the old site.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-none border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-none border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-300 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !site || checking || count === 0 || blockers > 0}
            className="rounded-none bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Moving…" : `Move ${count} ${plural}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MoveAssetsToSiteDialog;
