import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/AuthContext";
import { Dialog } from "@headlessui/react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Pin,
  PinOff,
  Globe,
  Eye,
  Clock,
  Megaphone,
  FileText,
  Link2,
  BookOpen,
  ImagePlus,
  Loader2,
  ExternalLink,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "../../../components/ui/toast";
import {
  onboardingService,
  ESignForm,
} from "../../../services/hr/onboardingService";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface Announcement {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  author_name: string;
  author_id: string;
  category: string;
  is_pinned: boolean;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

interface AnnouncementFormData {
  title: string;
  content: string;
  excerpt: string;
  category: string;
  is_pinned: boolean;
  is_published: boolean;
  published_at: string;
  expires_at: string;
  linked_document_url: string;
}

interface AttachmentItem {
  url: string;
  name: string;
}

const initialFormData: AnnouncementFormData = {
  title: "",
  content: "",
  excerpt: "",
  category: "general",
  is_pinned: false,
  is_published: true,
  published_at: "",
  expires_at: "",
  linked_document_url: "",
};

interface DocOption {
  id: string;
  name: string;
  file_url: string | null;
  form_type: string;
}

interface HelpGuideOption {
  id: string;
  title: string;
  description?: string | null;
}

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "company", label: "Company News" },
  { value: "hr", label: "HR Update" },
  { value: "safety", label: "Safety" },
  { value: "event", label: "Event" },
  { value: "policy", label: "Policy Change" },
  { value: "benefit", label: "Benefits" },
  { value: "training", label: "Training" },
];

function getCategoryBadgeColor(category: string) {
  switch (category) {
    case "company":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "hr":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "safety":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "event":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "policy":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "benefit":
      return "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200";
    case "training":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
    default:
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200";
  }
}

export function Announcements() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] =
    useState<AnnouncementFormData>(initialFormData);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<
    "all" | "published" | "draft" | "scheduled"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [availableDocs, setAvailableDocs] = useState<DocOption[]>([]);
  const [availableGuides, setAvailableGuides] = useState<HelpGuideOption[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [linkType, setLinkType] = useState<"document" | "guide">("document");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(
    null,
  );
  const [documentViewerTitle, setDocumentViewerTitle] = useState("");
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const showTooltip = (text: string) => (e: React.MouseEvent) =>
    setTooltip({ text, x: e.clientX, y: e.clientY });
  const moveTooltip = (e: React.MouseEvent) =>
    setTooltip((prev) =>
      prev ? { ...prev, x: e.clientX, y: e.clientY } : null,
    );
  const hideTooltip = () => setTooltip(null);

  const ATTACHMENT_MARKER = "📎 [Attachment](";
  const HELP_GUIDE_MARKER = "📘 [View Help Guide](";
  const DOC_MARKER = "📄 [View & Acknowledge Document](";

  function extractAttachmentUrls(content: string): string[] {
    const matches = content.matchAll(/📎 \[Attachment\]\(([^)]+)\)/g);
    return Array.from(matches)
      .map((m) => m[1])
      .filter(Boolean);
  }

  function stripSystemLinks(content: string): string {
    return content
      .replace(/\n\n---\n📘 \[View Help Guide\]\([^)]+\)/g, "")
      .replace(/\n\n---\n📄 \[View & Acknowledge Document\]\([^)]+\)/g, "")
      .replace(/\n\n---\n📎 \[Attachment\]\([^)]+\)/g, "");
  }

  function appendSystemLinks(
    baseContent: string,
    linkedUrl: string,
    currentLinkType: "document" | "guide",
    attachmentUrls: string[],
  ): string {
    let finalContent = stripSystemLinks(baseContent);
    if (linkedUrl) {
      if (currentLinkType === "guide") {
        const guidePath = linkedUrl.startsWith("/")
          ? linkedUrl
          : `/${linkedUrl.replace(/^\//, "")}`;
        if (!finalContent.includes(guidePath)) {
          finalContent += `\n\n---\n${HELP_GUIDE_MARKER}${guidePath})`;
        }
      } else if (!finalContent.includes(linkedUrl)) {
        finalContent += `\n\n---\n${DOC_MARKER}${linkedUrl})`;
      }
    }
    attachmentUrls.forEach((url) => {
      if (!finalContent.includes(url)) {
        finalContent += `\n\n---\n${ATTACHMENT_MARKER}${url})`;
      }
    });
    return finalContent;
  }

  useEffect(() => {
    if (user) {
      fetchAnnouncements();
      fetchAvailableDocs();
      fetchHelpGuides();
    }
  }, [user]);

  async function fetchHelpGuides() {
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("help_guides")
        .select("id, title, description")
        .order("title");
      if (error) {
        if (error.code === "42P01") {
          setAvailableGuides([]);
          return;
        }
        throw error;
      }
      setAvailableGuides(
        (data || []).map(
          (g: { id: string; title: string; description?: string | null }) => ({
            id: g.id,
            title: g.title,
            description: g.description ?? undefined,
          }),
        ),
      );
    } catch (err) {
      console.error("Error fetching help guides:", err);
      setAvailableGuides([]);
    }
  }

  async function fetchAvailableDocs() {
    try {
      const allForms = await onboardingService.getESignForms({});
      const docs: DocOption[] = allForms
        .filter(
          (f) =>
            f.requires_acknowledgment ||
            ["policy", "agreement", "standard"].includes(f.form_type || ""),
        )
        .filter((f) => f.status !== "archived")
        .map((f) => {
          const customDocs = (f as any).custom_fields?.attached_documents;
          const fileUrl =
            Array.isArray(customDocs) && customDocs[0]?.file_url
              ? customDocs[0].file_url
              : null;
          return {
            id: f.id,
            name: f.name,
            file_url: fileUrl,
            form_type: f.form_type || "",
          };
        });
      setAvailableDocs(docs);
    } catch (err) {
      console.error("Error fetching documents:", err);
    }
  }

  async function fetchAnnouncements() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .schema("common")
        .from("announcements")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error("Error fetching announcements:", err);
      toast({
        title: "Error",
        description: "Failed to load announcements",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function getStatus(
    a: Announcement,
  ): "published" | "scheduled" | "draft" | "expired" {
    if (!a.is_published) return "draft";
    if (a.expires_at && new Date(a.expires_at) < new Date()) return "expired";
    if (a.published_at && new Date(a.published_at) > new Date())
      return "scheduled";
    return "published";
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "published":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "scheduled":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "expired":
        return "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300";
      default:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    }
  }

  const filteredAnnouncements = announcements.filter((a) => {
    const matchesStatus =
      filterStatus === "all" || getStatus(a) === filterStatus;
    if (!matchesStatus) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      (a.excerpt || "").toLowerCase().includes(q) ||
      stripSystemLinks(a.content).toLowerCase().includes(q) ||
      a.author_name.toLowerCase().includes(q)
    );
  });

  function openCreateForm() {
    setFormData(initialFormData);
    setIsEditing(false);
    setEditingId(null);
    setShowDocPicker(false);
    setLinkType("document");
    setAttachments([]);
    setIsFormOpen(true);
  }

  function openEditForm(a: Announcement) {
    // Extract linked help guide path if present
    const guideMatch = a.content.match(/📘 \[View Help Guide\]\(([^)]+)\)/);
    const docMatch = a.content.match(
      /📄 \[View & Acknowledge Document\]\(([^)]+)\)/,
    );
    const linkedUrl = guideMatch ? guideMatch[1] : docMatch ? docMatch[1] : "";
    const isGuide = !!guideMatch;
    const attachmentUrls = extractAttachmentUrls(a.content);
    const cleanContent = stripSystemLinks(a.content);
    setFormData({
      title: a.title,
      content: cleanContent,
      excerpt: a.excerpt || "",
      category: a.category || "general",
      is_pinned: a.is_pinned,
      is_published: a.is_published,
      published_at: a.published_at
        ? format(new Date(a.published_at), "yyyy-MM-dd'T'HH:mm")
        : "",
      expires_at: a.expires_at
        ? format(new Date(a.expires_at), "yyyy-MM-dd'T'HH:mm")
        : "",
      linked_document_url: linkedUrl,
    });
    setLinkType(isGuide ? "guide" : "document");
    setShowDocPicker(!!linkedUrl);
    setAttachments(
      attachmentUrls.map((url) => ({
        url,
        name: decodeURIComponent(url.split("/").pop() || "attachment"),
      })),
    );
    setIsEditing(true);
    setEditingId(a.id);
    setIsFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    try {
      setFormLoading(true);
      const finalContent = appendSystemLinks(
        formData.content,
        formData.linked_document_url,
        linkType,
        attachments.map((a) => a.url),
      );
      const payload: any = {
        title: formData.title,
        content: finalContent,
        excerpt: formData.excerpt || null,
        category: formData.category,
        is_pinned: formData.is_pinned,
        is_published: formData.is_published,
        published_at: formData.published_at
          ? new Date(formData.published_at).toISOString()
          : formData.is_published
            ? new Date().toISOString()
            : null,
        expires_at: formData.expires_at
          ? new Date(formData.expires_at).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      };

      if (isEditing && editingId) {
        const { error } = await supabase
          .schema("common")
          .from("announcements")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast({
          title: "Updated",
          description: "Announcement updated successfully",
          variant: "success",
        });
      } else {
        payload.author_name =
          user.user_metadata?.name || user.email || "Unknown";
        payload.author_id = user.id;
        const { error } = await supabase
          .schema("common")
          .from("announcements")
          .insert([payload]);
        if (error) throw error;
        toast({
          title: "Created",
          description: "Announcement created successfully",
          variant: "success",
        });
      }

      setIsFormOpen(false);
      setFormData(initialFormData);
      fetchAnnouncements();
    } catch (err) {
      console.error("Error saving announcement:", err);
      toast({
        title: "Error",
        description: "Failed to save announcement",
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  }

  async function handleAttachmentUpload(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Only image files are supported for announcements.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload images under 10MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploadingAttachment(true);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `announcement-attachments/${user.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("user-uploads")
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
        });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("user-uploads").getPublicUrl(path);
      const url = data?.publicUrl;
      if (!url)
        throw new Error("Unable to build public URL for uploaded image");

      setAttachments((prev) => [...prev, { url, name: file.name }]);
      toast({
        title: "Uploaded",
        description: "Image attached to announcement.",
        variant: "success",
      });
    } catch (err: any) {
      console.error("Error uploading announcement attachment:", err);
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload image.",
        variant: "destructive",
      });
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const { error } = await supabase
        .schema("common")
        .from("announcements")
        .delete()
        .eq("id", deleteId);
      if (error) throw error;
      toast({
        title: "Deleted",
        description: "Announcement deleted",
        variant: "success",
      });
      setDeleteConfirmOpen(false);
      setDeleteId(null);
      fetchAnnouncements();
    } catch (err) {
      console.error("Error deleting announcement:", err);
      toast({
        title: "Error",
        description: "Failed to delete announcement",
        variant: "destructive",
      });
    }
  }

  async function togglePin(a: Announcement) {
    try {
      const { error } = await supabase
        .schema("common")
        .from("announcements")
        .update({
          is_pinned: !a.is_pinned,
          updated_at: new Date().toISOString(),
        })
        .eq("id", a.id);
      if (error) throw error;
      fetchAnnouncements();
    } catch (err) {
      console.error("Error toggling pin:", err);
    }
  }

  async function togglePublish(a: Announcement) {
    try {
      const newPublished = !a.is_published;
      const { error } = await supabase
        .schema("common")
        .from("announcements")
        .update({
          is_published: newPublished,
          published_at:
            newPublished && !a.published_at
              ? new Date().toISOString()
              : a.published_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", a.id);
      if (error) throw error;
      toast({
        title: newPublished ? "Published" : "Unpublished",
        description: `Announcement ${newPublished ? "is now live" : "has been unpublished"}`,
        variant: "success",
      });
      fetchAnnouncements();
    } catch (err) {
      console.error("Error toggling publish:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-[#f26722]" />
            Announcements
          </h1>
        </div>
        <button
          onClick={openCreateForm}
          className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#f26722] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Announcement
        </button>
      </div>

      {/* Filter tabs + search */}
      <div className="flex items-center gap-3">
        <div className="flex space-x-1 bg-zinc-100 dark:bg-dark-150 rounded-lg p-1 w-fit">
          {(["all", "published", "scheduled", "draft"] as const).map(
            (status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filterStatus === status
                    ? "bg-white dark:bg-neutral-800 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <span className="ml-1.5 text-xs text-zinc-400">
                  {status === "all"
                    ? announcements.length
                    : announcements.filter((a) => getStatus(a) === status)
                        .length}
                </span>
              </button>
            ),
          )}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search…"
            className="block w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-dark-150 pl-2 pr-3 py-1.5 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
          />
        </div>
      </div>

      {/* Announcements list */}
      {filteredAnnouncements.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-dark-150 rounded-lg shadow">
          <Megaphone className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-zinc-900 dark:text-white">
            No announcements
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {filterStatus === "all"
              ? "Get started by creating your first announcement."
              : `No ${filterStatus} announcements found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAnnouncements.map((a) => {
            const status = getStatus(a);
            return (
              <div
                key={a.id}
                onClick={() => {
                  const guideMatch = a.content.match(
                    /📘 \[View Help Guide\]\(([^)]+)\)/,
                  );
                  const docMatch = a.content.match(
                    /📄 \[View & Acknowledge Document\]\(([^)]+)\)/,
                  );
                  if (guideMatch) {
                    const path = guideMatch[1];
                    window.open(
                      path.startsWith("/") ? path : `/${path}`,
                      "_blank",
                    );
                  } else if (docMatch) {
                    setDocumentViewerUrl(docMatch[1]);
                    setDocumentViewerTitle(a.title);
                    setDocumentViewerOpen(true);
                  }
                }}
                className={`bg-white dark:bg-dark-150 rounded-lg shadow p-5 border-l-4 cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:shadow-lg ${
                  a.is_pinned ? "border-[#f26722]" : "border-transparent"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {a.is_pinned && (
                        <Pin className="h-3.5 w-3.5 text-[#f26722] flex-shrink-0" />
                      )}
                      <h3 className="text-base font-semibold text-zinc-900 dark:text-white truncate">
                        {a.title}
                      </h3>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(status)}`}
                      >
                        {status}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryBadgeColor(a.category)}`}
                      >
                        {CATEGORIES.find((c) => c.value === a.category)
                          ?.label || a.category}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mt-1">
                      {a.excerpt || stripSystemLinks(a.content)}
                    </p>
                    {a.content.includes("📘 [View Help Guide]") && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-[#f26722] font-medium">
                        <BookOpen className="h-3 w-3" />
                        Linked help guide
                      </span>
                    )}
                    {a.content.includes("📄 [View & Acknowledge Document]") && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-[#f26722] font-medium">
                        <FileText className="h-3 w-3" />
                        Linked document acknowledgment
                      </span>
                    )}
                    {extractAttachmentUrls(a.content).length > 0 && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-[#f26722] font-medium ml-2">
                        <ImagePlus className="h-3 w-3" />
                        {extractAttachmentUrls(a.content).length} image
                        attachment
                        {extractAttachmentUrls(a.content).length > 1 ? "s" : ""}
                      </span>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>By {a.author_name}</span>
                      <span>
                        Created {format(new Date(a.created_at), "MMM d, yyyy")}
                      </span>
                      {a.published_at && status === "scheduled" && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Publishes{" "}
                          {format(
                            new Date(a.published_at),
                            "MMM d, yyyy h:mm a",
                          )}
                        </span>
                      )}
                      {a.expires_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expires{" "}
                          {format(new Date(a.expires_at), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1 ml-4 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      onMouseEnter={showTooltip(a.is_pinned ? "Unpin" : "Pin")}
                      onMouseMove={moveTooltip}
                      onMouseLeave={hideTooltip}
                    >
                      <button
                        onClick={() => togglePin(a)}
                        className={`p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${a.is_pinned ? "text-[#f26722]" : "text-zinc-400"}`}
                      >
                        {a.is_pinned ? (
                          <PinOff className="h-4 w-4" />
                        ) : (
                          <Pin className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <div
                      onMouseEnter={showTooltip(
                        a.is_published ? "Unpublish" : "Publish",
                      )}
                      onMouseMove={moveTooltip}
                      onMouseLeave={hideTooltip}
                    >
                      <button
                        onClick={() => togglePublish(a)}
                        className={`p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${a.is_published ? "text-green-600" : "text-zinc-400"}`}
                      >
                        <Globe
                          className={`h-4 w-4 ${a.is_published ? "" : "opacity-50"}`}
                        />
                      </button>
                    </div>
                    <div
                      onMouseEnter={showTooltip("View")}
                      onMouseMove={moveTooltip}
                      onMouseLeave={hideTooltip}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const guideMatch = a.content.match(
                            /📘 \[View Help Guide\]\(([^)]+)\)/,
                          );
                          const docMatch = a.content.match(
                            /📄 \[View & Acknowledge Document\]\(([^)]+)\)/,
                          );
                          if (guideMatch) {
                            const path = guideMatch[1];
                            window.open(
                              path.startsWith("/") ? path : `/${path}`,
                              "_blank",
                            );
                          } else if (docMatch) {
                            setDocumentViewerUrl(docMatch[1]);
                            setDocumentViewerTitle(a.title);
                            setDocumentViewerOpen(true);
                          }
                        }}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-[#f26722] hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                    <div
                      onMouseEnter={showTooltip("Edit")}
                      onMouseMove={moveTooltip}
                      onMouseLeave={hideTooltip}
                    >
                      <button
                        onClick={() => openEditForm(a)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                    <div
                      onMouseEnter={showTooltip("Delete")}
                      onMouseMove={moveTooltip}
                      onMouseLeave={hideTooltip}
                    >
                      <button
                        onClick={() => {
                          setDeleteId(a.id);
                          setDeleteConfirmOpen(true);
                        }}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating tooltip */}
      {tooltip && (
        <span
          className="pointer-events-none fixed z-50 whitespace-nowrap rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-zinc-900"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translateX(-100%)",
          }}
        >
          {tooltip.text}
        </span>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-2xl rounded-lg bg-white dark:bg-neutral-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <Dialog.Title className="text-lg font-medium text-zinc-900 dark:text-white">
                {isEditing ? "Edit Announcement" : "New Announcement"}
              </Dialog.Title>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-zinc-400 hover:text-zinc-500 dark:hover:text-zinc-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="block w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  placeholder="Announcement title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                  Excerpt
                </label>
                <input
                  type="text"
                  value={formData.excerpt}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      excerpt: e.target.value,
                    }))
                  }
                  className="block w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  placeholder="Short summary shown on the portal (optional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                  Content *
                </label>
                <textarea
                  required
                  rows={6}
                  value={formData.content}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      content: e.target.value,
                    }))
                  }
                  className="block w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  placeholder="Full announcement content..."
                />
              </div>

              <div className="border border-zinc-200 dark:border-zinc-700 rounded-md p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <label className="text-sm font-medium text-zinc-700 dark:text-white">
                    Image attachments
                  </label>
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-[#f26722] rounded-md cursor-pointer hover:bg-[#f26722]/90">
                    {uploadingAttachment ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-3.5 w-3.5" />
                    )}
                    {uploadingAttachment ? "Uploading..." : "Attach image"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAttachmentUpload}
                      className="hidden"
                      disabled={uploadingAttachment}
                    />
                  </label>
                </div>
                {attachments.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Attach screenshots/images to appear with this announcement.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {attachments.map((attachment, idx) => (
                      <div
                        key={attachment.url}
                        className="relative border border-zinc-200 dark:border-zinc-700 rounded overflow-hidden bg-zinc-50 dark:bg-dark-200"
                      >
                        <img
                          src={attachment.url}
                          alt={attachment.name || `Attachment ${idx + 1}`}
                          className="w-full h-28 object-contain bg-zinc-100 dark:bg-dark-300"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((prev) =>
                              prev.filter((a) => a.url !== attachment.url),
                            )
                          }
                          className="absolute top-1 right-1 bg-black/60 text-white rounded p-1 hover:bg-black/80"
                          aria-label="Remove attachment"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        category: e.target.value,
                      }))
                    }
                    className="block w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Publish Date
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.published_at}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        published_at: e.target.value,
                      }))
                    }
                    className="block w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Leave empty to publish immediately when toggled on
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-white mb-1">
                    Expiration Date
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.expires_at}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        expires_at: e.target.value,
                      }))
                    }
                    className="block w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-dark-150 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#f26722]"
                  />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Leave empty for no expiration
                  </p>
                </div>

                <div className="flex flex-col justify-end gap-3 pb-1">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="is_published"
                      checked={formData.is_published}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          is_published: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-zinc-300 rounded"
                    />
                    <label
                      htmlFor="is_published"
                      className="ml-2 text-sm text-zinc-700 dark:text-white"
                    >
                      Publish this announcement
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="is_pinned"
                      checked={formData.is_pinned}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          is_pinned: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-zinc-300 rounded"
                    />
                    <label
                      htmlFor="is_pinned"
                      className="ml-2 text-sm text-zinc-700 dark:text-white"
                    >
                      Pin to top
                    </label>
                  </div>
                </div>
              </div>

              {/* Link Document or Help Guide */}
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDocPicker(!showDocPicker);
                      if (showDocPicker)
                        setFormData((prev) => ({
                          ...prev,
                          linked_document_url: "",
                        }));
                    }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 ${
                      showDocPicker
                        ? "bg-[#f26722]"
                        : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${showDocPicker ? "translate-x-5" : "translate-x-1"}`}
                    />
                  </button>
                  <label
                    className="text-sm font-medium flex items-center gap-1.5 cursor-pointer text-zinc-700 dark:text-white"
                    onClick={() => {
                      setShowDocPicker(!showDocPicker);
                      if (showDocPicker)
                        setFormData((prev) => ({
                          ...prev,
                          linked_document_url: "",
                        }));
                    }}
                  >
                    <Link2 className="h-4 w-4 text-[#f26722]" />
                    Link a document or help guide
                  </label>
                </div>

                {showDocPicker && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLinkType("document");
                          setFormData((prev) => ({
                            ...prev,
                            linked_document_url: "",
                          }));
                        }}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                          linkType === "document"
                            ? "bg-[#f26722] text-white"
                            : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600"
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5 inline mr-1.5 align-middle" />
                        Document Acknowledgment
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLinkType("guide");
                          setFormData((prev) => ({
                            ...prev,
                            linked_document_url: "",
                          }));
                        }}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                          linkType === "guide"
                            ? "bg-[#f26722] text-white"
                            : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600"
                        }`}
                      >
                        <BookOpen className="h-3.5 w-3.5 inline mr-1.5 align-middle" />
                        Help Guide
                      </button>
                    </div>

                    {linkType === "document" ? (
                      <>
                        {availableDocs.length === 0 ? (
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            No document acknowledgments available. Create one in
                            Compliance &rarr; Document Acknowledgment first.
                          </p>
                        ) : (
                          <div className="space-y-1 max-h-40 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-md p-2">
                            {availableDocs.map((doc) => (
                              <button
                                key={doc.id}
                                type="button"
                                onClick={() =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    linked_document_url: doc.file_url || "",
                                  }))
                                }
                                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                                  formData.linked_document_url === doc.file_url
                                    ? "bg-[#f26722]/10 text-[#f26722] border border-[#f26722]/30"
                                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                                }`}
                              >
                                <FileText className="h-4 w-4 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">
                                    {doc.name}
                                  </p>
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {doc.form_type}
                                  </p>
                                </div>
                                {formData.linked_document_url ===
                                  doc.file_url && (
                                  <span className="text-xs bg-[#f26722] text-white px-2 py-0.5 rounded-full">
                                    Selected
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        {formData.linked_document_url &&
                          linkType === "document" && (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              Document linked. Employees will see an
                              &quot;Acknowledge&quot; button on this
                              announcement.
                            </p>
                          )}
                      </>
                    ) : (
                      <>
                        {availableGuides.length === 0 ? (
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            No help guides available. Create one in the Help
                            Center first.
                          </p>
                        ) : (
                          <div className="space-y-1 max-h-40 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-md p-2">
                            {availableGuides.map((guide) => {
                              const guidePath = `/help-center/guide/${guide.id}`;
                              const isSelected =
                                formData.linked_document_url === guidePath;
                              return (
                                <button
                                  key={guide.id}
                                  type="button"
                                  onClick={() =>
                                    setFormData((prev) => ({
                                      ...prev,
                                      linked_document_url: guidePath,
                                    }))
                                  }
                                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                                    isSelected
                                      ? "bg-[#f26722]/10 text-[#f26722] border border-[#f26722]/30"
                                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                                  }`}
                                >
                                  <BookOpen className="h-4 w-4 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">
                                      {guide.title}
                                    </p>
                                    {guide.description && (
                                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                                        {guide.description}
                                      </p>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <span className="text-xs bg-[#f26722] text-white px-2 py-0.5 rounded-full">
                                      Selected
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {formData.linked_document_url &&
                          linkType === "guide" && (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              Help guide linked. Employees will see a &quot;View
                              Help Guide&quot; link on this announcement.
                            </p>
                          )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-dark-150 border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-dark-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-[#f26722] rounded-md hover:bg-[#f26722]/90 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 disabled:opacity-50"
                >
                  {formLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : isEditing ? (
                    "Update Announcement"
                  ) : (
                    "Create Announcement"
                  )}
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-sm rounded-lg bg-white dark:bg-neutral-900 p-6 shadow-xl">
            <Dialog.Title className="text-lg font-medium text-zinc-900 dark:text-white mb-2">
              Delete Announcement
            </Dialog.Title>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Are you sure you want to delete this announcement? This action
              cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-dark-150 border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-dark-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Document Viewer Modal */}
      <Dialog
        open={documentViewerOpen}
        onClose={() => {
          setDocumentViewerOpen(false);
          setDocumentViewerUrl(null);
          setDocumentViewerTitle("");
        }}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-5xl rounded-lg bg-white dark:bg-neutral-900 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-zinc-200 dark:border-zinc-700">
              <Dialog.Title className="text-lg font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#f26722]" />
                {documentViewerTitle || "Document"}
              </Dialog.Title>
              <button
                onClick={() => {
                  setDocumentViewerOpen(false);
                  setDocumentViewerUrl(null);
                  setDocumentViewerTitle("");
                }}
                className="text-zinc-400 hover:text-zinc-500 dark:hover:text-zinc-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {documentViewerUrl ? (
                <iframe
                  title="Document Viewer"
                  src={documentViewerUrl}
                  className="w-full h-[80vh] border-0"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-zinc-500 dark:text-zinc-400">
                  No document available.
                </div>
              )}
            </div>
            <div className="flex justify-end p-4 border-t border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => {
                  setDocumentViewerOpen(false);
                  setDocumentViewerUrl(null);
                  setDocumentViewerTitle("");
                }}
                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-dark-150 border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-dark-200"
              >
                Close
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}

export default Announcements;
