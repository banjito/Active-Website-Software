import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, Download, Eye, FileText, Link2, Pencil, Trash2, Upload } from "lucide-react";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirmDialog";
import FileViewerDialog, { viewerIconButtonClass } from "@/components/ui/FileViewerDialog";
import AddJobDocumentsDialog from "./AddJobDocumentsDialog";
import { supabase } from "@/lib/supabase";
import { copyJobFileShareLink, openFileUrl } from "@/lib/jobFiles";
import { QUOTE_DOCUMENT_TAGS, documentTagLabel } from "@/lib/documentTags";

/** A file on a quote (business.opportunity_documents). Also shown on the job once won. */
export interface OpportunityDocument {
  id: string;
  opportunity_id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  category: string;
  file_url: string;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const dangerIconButtonClass =
  "p-2 text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-neutral-400 dark:hover:bg-red-950/40 dark:hover:text-red-400";

interface Props {
  opportunityId: string;
  userId: string;
}

/**
 * Documents card for a quote: drop files anywhere on it, tag them, view them
 * big. Same look and behavior as the job's Documents card.
 */
export default function OpportunityDocuments({ opportunityId, userId }: Props) {
  const [docs, setDocs] = useState<OpportunityDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [dropTag, setDropTag] = useState("misc");
  const [dragging, setDragging] = useState(false);
  const [addDoc, setAddDoc] = useState<{ category: string; files: File[] } | null>(null);
  const [viewing, setViewing] = useState<OpportunityDocument | null>(null);
  const [editing, setEditing] = useState<OpportunityDocument | null>(null);
  const [form, setForm] = useState({ name: "", description: "", category: "misc" });
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .schema("business")
      .from("opportunity_documents")
      .select("*")
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: false });
    if (error) console.error("Error loading quote documents:", error);
    setDocs((data ?? []) as OpportunityDocument[]);
    setLoading(false);
  }, [opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Picking a tag filter makes it the drop area's tag too
  useEffect(() => {
    if (filter !== "all") setDropTag(filter);
  }, [filter]);

  const visible = filter === "all" ? docs : docs.filter((d) => d.category === filter);

  const changeTag = async (doc: OpportunityDocument, category: string) => {
    const before = docs;
    setDocs((list) => list.map((d) => (d.id === doc.id ? { ...d, category } : d)));
    const { error } = await supabase
      .schema("business")
      .from("opportunity_documents")
      .update({ category, updated_at: new Date().toISOString() })
      .eq("id", doc.id);
    if (error) {
      setDocs(before);
      toast({ title: "Tag not changed", description: error.message, variant: "destructive" });
    }
  };

  const openEdit = (doc: OpportunityDocument) => {
    setEditing(doc);
    setForm({ name: doc.name, description: doc.description ?? "", category: doc.category });
  };

  const saveEdit = async () => {
    if (!editing || !form.name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .schema("business")
      .from("opportunity_documents")
      .update({
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    setEditing(null);
    await load();
  };

  const remove = async (doc: OpportunityDocument) => {
    const ok = await confirmDialog({
      title: `Delete ${doc.name}?`,
      description: "The file is removed from this quote and its job. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase
      .schema("business")
      .from("opportunity_documents")
      .delete()
      .eq("id", doc.id);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    if (doc.file_path) await supabase.storage.from("job-documents").remove([doc.file_path]);
    setDocs((list) => list.filter((d) => d.id !== doc.id));
  };

  const tagsInUse = QUOTE_DOCUMENT_TAGS.filter(
    (t) => t.value === filter || docs.some((d) => d.category === t.value),
  );

  return (
    <>
      {/* Files can be dropped anywhere on the card, any time */}
      <div
        className="relative"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length) setAddDoc({ category: dropTag, files });
        }}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-brand bg-brand/10 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm dark:bg-dark-150 dark:text-white">
              <Upload className="h-4 w-4 text-brand" aria-hidden="true" />
              Drop to add as {documentTagLabel(dropTag)}
            </div>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-brand" />
              <span>Documents</span>
            </CardTitle>
            {docs.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-3">
                {[{ value: "all", label: "All" }, ...tagsInUse].map((t) => {
                  const count =
                    t.value === "all" ? docs.length : docs.filter((d) => d.category === t.value).length;
                  const active = filter === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFilter(t.value)}
                      className={`px-2.5 py-1 text-xs font-medium border rounded-none transition-colors ${
                        active
                          ? "bg-brand border-brand text-white"
                          : "border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                      }`}
                    >
                      {t.label} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Always-there drop area: drag files in or click to choose */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`flex flex-wrap items-center justify-between gap-3 border-2 border-dashed border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 rounded-none px-4 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                !loading && visible.length === 0 ? "py-8" : "py-3"
              }`}
            >
              <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-300">
                <Upload className="h-5 w-5 text-brand shrink-0" aria-hidden="true" />
                <span>
                  {!loading && visible.length === 0 && "No documents yet. "}
                  Drag drawings, specs or bid docs here, or{" "}
                  <span className="font-semibold text-neutral-900 dark:text-white underline underline-offset-2">
                    choose files
                  </span>
                </span>
              </div>
              <label
                className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300"
                onClick={(e) => e.stopPropagation()}
              >
                Tag as
                <select
                  value={dropTag}
                  onChange={(e) => setDropTag(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="p-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white"
                >
                  {QUOTE_DOCUMENT_TAGS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) setAddDoc({ category: dropTag, files });
                }}
              />
            </div>

            {visible.length > 0 && (
              <div className="space-y-4">
                {visible.map((doc) => (
                  <div
                    key={doc.id}
                    className="border border-neutral-200 dark:border-neutral-700 rounded-none p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3">
                          <FileText className="h-5 w-5 text-brand shrink-0" />
                          <div className="min-w-0">
                            <h4 className="font-medium text-neutral-900 dark:text-white break-all">{doc.name}</h4>
                            <div className="flex items-center space-x-4 text-sm text-neutral-500 dark:text-white flex-wrap gap-y-1">
                              {/* Click the tag to change it */}
                              <span className="relative inline-flex items-center">
                                <select
                                  value={doc.category}
                                  onChange={(e) => void changeTag(doc, e.target.value)}
                                  aria-label={`Tag for ${doc.name}`}
                                  title="Change tag"
                                  className="cursor-pointer appearance-none rounded-none border border-neutral-200 bg-neutral-100 py-0.5 pl-2 pr-6 text-xs font-medium text-neutral-700 transition-colors hover:border-brand hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                >
                                  {QUOTE_DOCUMENT_TAGS.map((t) => (
                                    <option key={t.value} value={t.value}>
                                      {t.label}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown
                                  className="pointer-events-none absolute right-1.5 h-3 w-3 text-neutral-500 dark:text-neutral-400"
                                  aria-hidden="true"
                                />
                              </span>
                              <span>{format(new Date(doc.created_at), "MMM d, yyyy")}</span>
                              {!!doc.file_size && <span>{formatSize(doc.file_size)}</span>}
                            </div>
                            {doc.description && (
                              <p className="text-sm text-neutral-600 dark:text-white mt-1">{doc.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setViewing(doc)} title="View" aria-label={`View ${doc.name}`} className={viewerIconButtonClass}>
                          <Eye className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => openFileUrl(doc.file_url)} title="Download" aria-label={`Download ${doc.name}`} className={viewerIconButtonClass}>
                          <Download className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => openEdit(doc)} title="Edit name, tag and description" aria-label={`Edit ${doc.name}`} className={viewerIconButtonClass}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => void remove(doc)} title="Delete" aria-label={`Delete ${doc.name}`} className={dangerIconButtonClass}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AddJobDocumentsDialog
        category={addDoc?.category ?? null}
        categoryLabel={addDoc ? documentTagLabel(addDoc.category) : ""}
        initialFiles={addDoc?.files}
        pathPrefix={`opportunities/${opportunityId}`}
        saveRow={async (row) => {
          const { error } = await supabase
            .schema("business")
            .from("opportunity_documents")
            .insert({ ...row, opportunity_id: opportunityId, user_id: userId });
          if (error) throw error;
        }}
        onClose={() => setAddDoc(null)}
        onUploaded={() => void load()}
      />

      <FileViewerDialog
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.name ?? ""}
        subtitle={
          viewing
            ? `${documentTagLabel(viewing.category)} • ${format(new Date(viewing.created_at), "MMM d, yyyy")}`
            : undefined
        }
        url={viewing?.file_url}
        fileName={viewing?.file_path}
        fileType={viewing?.file_type}
        onDownload={() => viewing && openFileUrl(viewing.file_url)}
        actions={
          viewing
            ? [
                { icon: Download, label: "Download", onClick: () => openFileUrl(viewing.file_url) },
                {
                  icon: Link2,
                  label: "Copy share link (works for 7 days, outside ampOS)",
                  onClick: () => void copyJobFileShareLink(viewing.file_url, { name: viewing.name }),
                },
              ]
            : []
        }
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && !saving && setEditing(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>Change the name, tag or description of this document.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5 [&>div]:mb-0">
              <label htmlFor="quote-doc-name" className="text-sm font-medium">Name</label>
              <Input
                id="quote-doc-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="quote-doc-tag" className="text-sm font-medium">Tag</label>
              <select
                id="quote-doc-tag"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full p-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white"
              >
                {QUOTE_DOCUMENT_TAGS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="quote-doc-desc" className="text-sm font-medium">Description</label>
              <textarea
                id="quote-doc-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description (optional)"
                className="block h-[72px] min-h-0 w-full resize-none rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-dark-150 dark:text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={saving || !form.name.trim()}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
