import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Paperclip,
  Pencil,
  Trash2,
  X,
  Check,
  Download,
  FileText,
  Image,
  File,
  MessageCircle,
} from "lucide-react";
import { supabase, ensureValidSession } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { toast } from "../ui/toast";
import { ProfileView } from "../profile/ProfileView";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface OpportunityNote {
  id: string;
  opportunity_id: string;
  user_id: string;
  content: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
  created_at: string;
  updated_at: string;
  edited: boolean;
  user?: {
    email: string;
    user_metadata?: {
      full_name?: string;
      name?: string;
      profileImage?: string;
    };
  };
}

interface OpportunityNotesProps {
  opportunityId: string;
}

const getUserDisplayName = (note: OpportunityNote): string => {
  if (note.user?.user_metadata?.full_name)
    return note.user.user_metadata.full_name;
  if (note.user?.user_metadata?.name) return note.user.user_metadata.name;
  if (note.user?.email) return note.user.email.split("@")[0];
  if (note.user_id) return `User ${note.user_id.substring(0, 8)}`;
  return "Unknown";
};

const getUserInitials = (note: OpportunityNote): string => {
  const name = getUserDisplayName(note);
  const parts = name.split(" ");
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (type: string | null | undefined) => {
  if (!type) return <File className="w-4 h-4" />;
  if (type.startsWith("image/")) return <Image className="w-4 h-4" />;
  if (type.includes("pdf")) return <FileText className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
};

export default function OpportunityNotes({
  opportunityId,
}: OpportunityNotesProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<OpportunityNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [profileViewUserId, setProfileViewUserId] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);

  // Grow the note box with its content. When empty, fall back to rows={1}
  // (no pixel height) so it renders as a single clean line; only measure once
  // there's text, capped at ~5 lines before scrolling.
  const resizeNoteTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    if (el.value) {
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .schema("business")
        .from("opportunity_notes")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const notesWithUsers = await Promise.all(
        (data || []).map(async (note) => {
          let displayName = "";
          let profileImage: string | undefined;
          let email = "";

          try {
            const { data: profileData, error: profileError } = await supabase
              .schema("common")
              .from("profiles")
              .select("id, full_name, email, avatar_url, profile_image")
              .eq("id", note.user_id)
              .maybeSingle();

            if (!profileError && profileData) {
              email = (profileData as any).email || "";
              displayName =
                (profileData as any).full_name ||
                email?.split("@")[0] ||
                "Unknown";
              profileImage =
                (profileData as any).avatar_url ||
                (profileData as any).profile_image;
            }
          } catch (_) {}

          if (!displayName || !profileImage) {
            try {
              const { data: metaData, error: metaError } = await supabase
                .schema("common")
                .rpc("get_user_metadata", { p_user_id: note.user_id });
              if (!metaError && metaData) {
                const m = metaData as any;
                if (!email) email = m.email || "";
                if (!displayName)
                  displayName =
                    m.full_name || m.name || email?.split("@")[0] || "Unknown";
                if (!profileImage)
                  profileImage = m.profile_image || m.avatar_url;
              }
            } catch (_) {}
          }

          return {
            ...note,
            user: {
              email,
              user_metadata: {
                full_name: displayName,
                name: displayName,
                ...(profileImage ? { profileImage } : {}),
              },
            },
          };
        }),
      );
      setNotes(notesWithUsers);
    } catch (error) {
      console.error("Error fetching opportunity notes:", error);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [opportunityId]);

  useEffect(() => {
    if (notesEndRef.current)
      notesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [notes.length]);


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size <= 10 * 1024 * 1024) setSelectedFile(file);
    else if (file)
      toast({
        title: "File too large",
        description: "Please select a file smaller than 10MB",
        variant: "destructive",
      });
  };

  const uploadFile = async (
    file: File,
  ): Promise<{
    url: string;
    name: string;
    type: string;
    size: number;
  } | null> => {
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `opportunity-notes/${opportunityId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error } = await supabase.storage
        .from("job-documents")
        .upload(fileName, file, { cacheControl: "3600", upsert: false });
      if (error) return null;
      const { data: urlData } = supabase.storage
        .from("job-documents")
        .getPublicUrl(fileName);
      return {
        url: urlData.publicUrl,
        name: file.name,
        type: file.type,
        size: file.size,
      };
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() && !selectedFile) return;
    if (!user?.id) return;

    setSubmitting(true);
    setUploading(!!selectedFile);
    try {
      let attachmentData: {
        url: string;
        name: string;
        type: string;
        size: number;
      } | null = null;
      if (selectedFile) {
        attachmentData = await uploadFile(selectedFile);
        if (!attachmentData && selectedFile) {
          toast({
            title: "Attachment failed",
            description: "Note will be saved without attachment.",
            variant: "destructive",
          });
        }
      }

      const noteData: Record<string, unknown> = {
        opportunity_id: opportunityId,
        user_id: user.id,
        content:
          newNote.trim() ||
          (attachmentData ? `Attached: ${attachmentData.name}` : ""),
      };
      if (attachmentData) {
        noteData.attachment_url = attachmentData.url;
        noteData.attachment_name = attachmentData.name;
        noteData.attachment_type = attachmentData.type;
        noteData.attachment_size = attachmentData.size;
      }

      const { data, error } = await supabase
        .schema("business")
        .from("opportunity_notes")
        .insert(noteData)
        .select()
        .single();

      if (error) throw error;

      const newNoteWithUser: OpportunityNote = {
        ...data,
        user: { email: user.email || "", user_metadata: user.user_metadata },
      };
      setNotes((prev) => [...prev, newNoteWithUser]);
      setNewNote("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Note added", description: "Your note has been saved." });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save note.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const handleEdit = async (noteId: string) => {
    if (!editContent.trim()) return;
    try {
      const sessionOk = await ensureValidSession();
      if (!sessionOk) {
        toast({
          title: "Session expired",
          description: "Please sign in again and try editing the note.",
          variant: "destructive",
        });
        return;
      }
      const { error } = await supabase
        .schema("business")
        .from("opportunity_notes")
        .update({ content: editContent.trim() })
        .eq("id", noteId);
      if (error) throw error;
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                content: editContent.trim(),
                edited: true,
                updated_at: new Date().toISOString(),
              }
            : n,
        ),
      );
      setEditingNoteId(null);
      setEditContent("");
      toast({
        title: "Note updated",
        description: "Your note has been updated.",
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update note.";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this note?")) return;
    const note = notes.find((n) => n.id === noteId);
    if (!note || note.user_id !== user?.id) return;
    try {
      const sessionOk = await ensureValidSession();
      if (!sessionOk) {
        toast({
          title: "Session expired",
          description: "Please sign in again and try deleting the note.",
          variant: "destructive",
        });
        return;
      }
      // Use RPC so delete works regardless of RLS on direct PATCH (avoids 403)
      const { error } = await supabase
        .schema("business")
        .rpc("soft_delete_opportunity_note", { note_id: noteId });
      if (error) throw error;
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast({
        title: "Note deleted",
        description: "Your note has been deleted.",
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete note.";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col min-h-[400px] max-h-[calc(100vh-320px)] bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#f26722]" />
            Opportunity notes
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {notes.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Be the first to add a note to this opportunity.
              </p>
            </div>
          ) : (
            notes.map((note) => {
              const isCurrentUser = note.user_id === user?.id;
              const isEditing = editingNoteId === note.id;
              const profileImageUrl = isCurrentUser
                ? (user?.user_metadata as any)?.profileImage
                : note.user?.user_metadata?.profileImage;
              return (
                <div key={note.id} className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setProfileViewUserId(note.user_id)}
                    className={`flex-shrink-0 h-10 w-10 rounded-full overflow-hidden flex items-center justify-center text-sm font-medium cursor-pointer hover:ring-2 hover:ring-[#f26722] hover:ring-offset-2 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 ${
                      !profileImageUrl &&
                      (isCurrentUser
                        ? "bg-[#f26722] text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300")
                    }`}
                    title="View profile"
                  >
                    {profileImageUrl ? (
                      <img
                        src={profileImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getUserInitials(note)
                    )}
                  </button>
                  <div className="flex-1 max-w-[80%]">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        type="button"
                        onClick={() => setProfileViewUserId(note.user_id)}
                        className="text-sm font-medium text-gray-900 dark:text-white hover:underline focus:outline-none text-left"
                      >
                        {isCurrentUser ? "You" : getUserDisplayName(note)}
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(note.created_at)}
                        {note.edited && " (edited)"}
                      </span>
                    </div>
                    <div
                      className={`rounded-lg px-4 py-3 ${
                        isCurrentUser
                          ? "bg-[#f26722] text-white"
                          : "bg-gray-100 dark:bg-dark-100 text-gray-900 dark:text-white"
                      }`}
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full p-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-150 text-gray-900 dark:text-white resize-none"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(null);
                                setEditContent("");
                              }}
                              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 bg-white dark:bg-dark-150 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEdit(note.id)}
                              className="p-1.5 text-green-600 hover:text-green-700 bg-white dark:bg-dark-150 rounded"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {note.content}
                          </p>
                          {note.attachment_url && (
                            <div
                              className={`mt-2 pt-2 border-t ${isCurrentUser ? "border-white/20" : "border-gray-200 dark:border-gray-600"}`}
                            >
                              <a
                                href={note.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-2 text-sm ${isCurrentUser ? "text-white/90 hover:text-white" : "text-blue-600 dark:text-blue-400 hover:underline"}`}
                              >
                                {getFileIcon(note.attachment_type)}
                                <span className="truncate max-w-[200px]">
                                  {note.attachment_name}
                                </span>
                                {note.attachment_size != null && (
                                  <span className="text-xs opacity-70">
                                    ({formatFileSize(note.attachment_size)})
                                  </span>
                                )}
                                <Download className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {isCurrentUser && !isEditing && (
                      <div className="flex gap-1 mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditContent(note.content);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(note.id)}
                          className="p-1 text-gray-400 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={notesEndRef} />
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-1.5">
          {selectedFile && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-100 rounded-lg">
              {getFileIcon(selectedFile.type)}
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
                {selectedFile.name}
              </span>
              <span className="text-xs text-gray-500">
                {formatFileSize(selectedFile.size)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              ref={(el) => {
                if (el) resizeNoteTextarea(el);
              }}
              value={newNote}
              onChange={(e) => {
                setNewNote(e.target.value);
                resizeNoteTextarea(e.target);
              }}
              placeholder="Add a note..."
              rows={1}
              className="flex-1 min-w-0 px-2 py-1.5 text-sm leading-normal rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-100 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent resize-none overflow-y-auto"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded shrink-0"
              title="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="submit"
              disabled={submitting || (!newNote.trim() && !selectedFile)}
              className="p-1.5 bg-[#f26722] text-white rounded hover:bg-[#e55611] disabled:opacity-50 shrink-0"
              title="Send"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
          {uploading && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Uploading...
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Enter for a new line · ⌘/Ctrl+Enter to send
          </p>
        </div>
      </div>
      <ProfileView
        isOpen={!!profileViewUserId}
        onClose={() => setProfileViewUserId(null)}
        userId={profileViewUserId ?? undefined}
      />
    </>
  );
}
