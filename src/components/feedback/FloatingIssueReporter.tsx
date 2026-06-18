import React, { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";

type UploadingFile = {
  file: File;
  previewUrl: string;
};

type UserOption = {
  id: string;
  name: string;
};

export const FloatingIssueReporter: React.FC = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [type, setType] = useState<"issue" | "feature_request">("issue");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<
    "low" | "normal" | "high" | "urgent"
  >("normal");
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [interestedParties, setInterestedParties] = useState<string[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);

  const pageUrl = useMemo(() => {
    try {
      return window.location.href;
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || allUsers.length > 0) return;
    (async () => {
      try {
        const { data: profiles } = await supabase
          .schema("common")
          .from("profiles")
          .select("id, full_name, email");
        if (profiles) {
          setAllUsers(
            profiles
              .filter((p: any) => p.id && (p.full_name || p.email))
              .map((p: any) => ({
                id: p.id,
                name:
                  p.full_name || (p.email ? p.email.split("@")[0] : "Unknown"),
              }))
              .sort((a: UserOption, b: UserOption) =>
                a.name.localeCompare(b.name),
              ),
          );
        }
      } catch (err) {
        console.error("Failed to load users for interested parties:", err);
      }
    })();
  }, [open, allUsers.length]);

  const onSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const uploads: UploadingFile[] = selected.map((file) => ({
      file,
      previewUrl:
        file.type && file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : "",
    }));
    setFiles((prev) => [...prev, ...uploads]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setType("issue");
    setTitle("");
    setDescription("");
    setPriority("normal");
    setFiles([]);
    setInterestedParties([]);
    setPartySearch("");
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSubmitting(true);
    try {
      const reporterId = user?.id || null;

      // 1) Create issue record
      const { data: issue, error: insertErr } = await supabase
        .schema("common")
        .from("issue_reports")
        .insert({
          title: title.trim(),
          description: description.trim(),
          priority,
          type,
          page_url: pageUrl,
          reporter_id: reporterId,
        })
        .select("*")
        .single();

      if (insertErr) throw insertErr;

      // 2) Insert interested parties
      if (issue && interestedParties.length > 0) {
        await supabase
          .schema("common")
          .from("issue_interested_parties")
          .insert(
            interestedParties.map((uid) => ({
              issue_id: issue.id,
              user_id: uid,
            })),
          );
      }

      // 3) Notify about new issue creation (fire-and-forget)
      if (issue) {
        const fnUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
        const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
        if (fnUrl && anonKey) {
          fetch(
            `${fnUrl.replace(/\/rest\/v1.*$/, "")}/functions/v1/issue-resolved-notification`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${anonKey}`,
              },
              body: JSON.stringify({ issueId: issue.id, action: "created" }),
            },
          ).catch(() => {});
        }
      }

      // 4) Upload attachments (if any)
      if (issue && files.length > 0) {
        for (const uf of files) {
          const fileExt = uf.file.name.split(".").pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
          const storagePath = `issues/${issue.id}/${fileName}`;

          const { error: upErr } = await supabase.storage
            .from("documents")
            .upload(storagePath, uf.file, { upsert: false });
          if (upErr) throw upErr;

          const { data: pub } = supabase.storage
            .from("documents")
            .getPublicUrl(storagePath);

          await supabase.schema("common").from("issue_attachments").insert({
            issue_id: issue.id,
            file_path: storagePath,
            file_url: pub.publicUrl,
          });
        }
      }

      setSuccess(
        type === "feature_request"
          ? "Feature request submitted. Thank you!"
          : "Issue submitted. Thank you!",
      );
      resetForm();
      setTimeout(() => setOpen(false), 1000);
    } catch (e: any) {
      console.error("Issue submit error:", e);
      setError(e?.message || "Failed to submit issue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed left-4 bottom-4 z-50 print:hidden">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Issue / Feature Report"
          className="group inline-flex items-center h-14 max-w-[56px] hover:max-w-[320px] focus-visible:max-w-[320px] bg-[#f26722] hover:bg-[#e55611] text-white shadow-lg border-2 border-white rounded-xl font-semibold text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f26722] focus-visible:ring-offset-2 transition-[max-width,background-color] duration-300 ease-out overflow-hidden whitespace-nowrap"
        >
          <span className="flex h-full w-[52px] shrink-0 items-center justify-center">
            <MessageSquareWarning className="h-6 w-6" aria-hidden />
          </span>
          <span className="pr-5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300 delay-75">
            Issue/Feature Report
          </span>
        </button>
      )}

      {open && (
        <div className="w-[360px] max-w-[92vw] bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              {type === "issue" ? "Report an Issue" : "Request a Feature"}
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-300 dark:hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="form-label block mb-1">Type</label>
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as "issue" | "feature_request")
                }
                className="form-select"
              >
                <option value="issue">Issue</option>
                <option value="feature_request">Feature Request</option>
              </select>
            </div>
            <div>
              <label className="form-label block mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
                placeholder="Brief summary"
              />
            </div>
            <div>
              <label className="form-label block mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="form-textarea"
                placeholder="Steps to reproduce, expected vs actual behavior..."
              />
            </div>
            <div>
              <label className="form-label block mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="form-select"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="form-label block mb-1">
                Interested Parties
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={partySearch}
                  onChange={(e) => {
                    setPartySearch(e.target.value);
                    setShowPartyDropdown(true);
                  }}
                  onFocus={() => setShowPartyDropdown(true)}
                  className="form-input w-full"
                  placeholder="Search by name..."
                />
                {showPartyDropdown && partySearch.trim() && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg max-h-32 overflow-y-auto">
                    {allUsers
                      .filter(
                        (u) =>
                          u.id !== user?.id &&
                          !interestedParties.includes(u.id) &&
                          u.name
                            .toLowerCase()
                            .includes(partySearch.toLowerCase()),
                      )
                      .slice(0, 8)
                      .map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setInterestedParties((prev) => [...prev, u.id]);
                            setPartySearch("");
                            setShowPartyDropdown(false);
                          }}
                          className="block w-full text-left px-3 py-1.5 text-sm text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-dark-100"
                        >
                          {u.name}
                        </button>
                      ))}
                    {allUsers.filter(
                      (u) =>
                        u.id !== user?.id &&
                        !interestedParties.includes(u.id) &&
                        u.name
                          .toLowerCase()
                          .includes(partySearch.toLowerCase()),
                    ).length === 0 && (
                      <div className="px-3 py-2 text-xs text-neutral-500">
                        No results
                      </div>
                    )}
                  </div>
                )}
              </div>
              {interestedParties.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {interestedParties.map((uid) => {
                    const u = allUsers.find((a) => a.id === uid);
                    return (
                      <span
                        key={uid}
                        className="inline-flex items-center gap-1 bg-neutral-100 dark:bg-dark-100 text-neutral-800 dark:text-neutral-200 text-xs px-2 py-1 rounded-full"
                      >
                        {u?.name || "User"}
                        <button
                          type="button"
                          onClick={() =>
                            setInterestedParties((prev) =>
                              prev.filter((id) => id !== uid),
                            )
                          }
                          className="text-neutral-500 hover:text-red-500"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label">Attachments</label>
                <input
                  ref={inputRef}
                  type="file"
                  accept="*/*"
                  multiple
                  onChange={onSelectFiles}
                />
              </div>
              {files.length > 0 && (
                <div className="grid grid-cols-5 gap-2">
                  {files.map((f, idx) => (
                    <div key={idx} className="relative group">
                      {f.previewUrl ? (
                        <img
                          src={f.previewUrl}
                          alt={f.file.name}
                          className="w-full h-16 object-cover rounded border border-neutral-200 dark:border-neutral-700"
                        />
                      ) : (
                        <div className="w-full h-16 flex items-center justify-center rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-100 text-xs text-neutral-600 dark:text-neutral-300 p-1 text-center">
                          <span className="line-clamp-2 break-all">
                            {f.file.name}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => removeFile(idx)}
                        className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100"
                        aria-label="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Page: {pageUrl || "unknown"}
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}
            {success && <div className="text-sm text-green-600">{success}</div>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={() => {
                  resetForm();
                  setOpen(false);
                }}
                className="bg-white dark:bg-dark-100 border border-neutral-300 dark:border-neutral-600"
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-[#f26722] hover:bg-[#e55611] text-white"
              >
                {submitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingIssueReporter;
