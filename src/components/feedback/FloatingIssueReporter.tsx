import React, { useEffect, useMemo, useRef, useState } from "react";
import { OctagonAlert, Paperclip } from "lucide-react";
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

  const addFiles = (selected: File[]) => {
    const uploads: UploadingFile[] = selected.map((file) => ({
      file,
      previewUrl:
        file.type && file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : "",
    }));
    setFiles((prev) => [...prev, ...uploads]);
  };

  const onSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    if (inputRef.current) inputRef.current.value = "";
  };

  const onPasteDescription = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Excel and Word also put a picture of copied text on the clipboard.
    // When there is text, paste it as text instead of attaching that picture.
    if (e.clipboardData.getData("text/plain")) return;
    const pasted = Array.from(e.clipboardData.files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) =>
        // Clipboard images can arrive unnamed; the upload path needs the extension.
        f.name
          ? f
          : new File([f], `pasted-${Date.now()}.${f.type.split("/")[1] || "png"}`, {
              type: f.type,
            }),
      );
    if (pasted.length === 0) return;
    e.preventDefault();
    addFiles(pasted);
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
          className="group relative inline-flex h-14 w-14 items-center justify-center bg-brand hover:w-[240px] hover:bg-brand-dark focus-visible:w-[240px] text-white shadow-lg rounded-none font-semibold text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 transition-[width,background-color] duration-300 ease-out overflow-hidden whitespace-nowrap"
        >
          <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0">
            <OctagonAlert className="h-6 w-6" aria-hidden />
          </span>
          <span className="absolute inset-0 inline-flex items-center justify-center gap-2 opacity-0 transition-opacity duration-200 delay-100 group-hover:opacity-100 group-focus-visible:opacity-100">
            <OctagonAlert className="h-6 w-6 shrink-0" aria-hidden />
            <span>Issue/Feature Report</span>
          </span>
        </button>
      )}

      {open && (
        <div className="w-[360px] max-w-[92vw] max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 rounded-none shadow-2xl p-4">
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label block text-sm">Type</label>
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
                <label className="form-label block text-sm">Priority</label>
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
            </div>
            <div>
              <label className="form-label block text-sm">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
                placeholder="Brief summary"
              />
            </div>
            <div>
              <label className="form-label block text-sm">Description</label>
              {/* The ! is required: 16 reports add a global 200px textarea
                  minimum that leaks onto other pages. */}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onPaste={onPasteDescription}
                rows={3}
                className="form-textarea !min-h-[4rem] resize-y"
                placeholder="What happened? Paste screenshots here."
              />
            </div>
            <div>
              <label className="form-label block text-sm">
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
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-dark-150 border border-neutral-200 dark:border-neutral-700 rounded-none shadow-lg max-h-32 overflow-y-auto">
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
                        className="inline-flex items-center gap-1 bg-neutral-100 dark:bg-dark-100 text-neutral-800 dark:text-neutral-200 text-xs px-2 py-1 rounded-none"
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

            {files.length > 0 && (
              <div className="grid grid-cols-5 gap-2">
                {files.map((f, idx) => (
                  <div key={idx} className="relative group">
                    {f.previewUrl ? (
                      <img
                        src={f.previewUrl}
                        alt={f.file.name}
                        className="w-full h-12 object-cover rounded-none border border-neutral-200 dark:border-neutral-700"
                      />
                    ) : (
                      <div className="w-full h-12 flex items-center justify-center rounded-none border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-dark-100 text-xs text-neutral-600 dark:text-neutral-300 p-1 text-center">
                        <span className="line-clamp-2 break-all">
                          {f.file.name}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => removeFile(idx)}
                      className="absolute top-0 right-0 bg-black/70 text-white rounded-none w-5 h-5 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Remove ${f.file.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              className="truncate text-xs text-neutral-500 dark:text-neutral-400"
              title={pageUrl}
            >
              Page: {pageUrl || "unknown"}
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}
            {success && <div className="text-sm text-green-600">{success}</div>}

            <input
              ref={inputRef}
              type="file"
              accept="*/*"
              multiple
              onChange={onSelectFiles}
              className="hidden"
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => inputRef.current?.click()}
                leftIcon={<Paperclip className="h-4 w-4" aria-hidden />}
                disabled={submitting}
              >
                Attach
              </Button>
              <div className="flex items-center gap-2">
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
                  className="bg-brand hover:bg-brand-dark text-white"
                >
                  {submitting ? "Submitting..." : "Submit"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingIssueReporter;
