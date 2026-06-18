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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/toast";
import { ProfileView } from "@/components/profile/ProfileView";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface IssueNote {
  id: string;
  issue_id: string;
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

interface IssueNotesProps {
  issueId: string;
  /** Allowed users can add notes */
  canComment: boolean;
}

const getUserDisplayName = (note: IssueNote): string => {
  if (note.user?.user_metadata?.full_name)
    return note.user.user_metadata.full_name;
  if (note.user?.user_metadata?.name) return note.user.user_metadata.name;
  if (note.user?.email) return note.user.email.split("@")[0];
  if (note.user_id) return `User ${note.user_id.substring(0, 8)}`;
  return "Unknown";
};

const getUserInitials = (note: IssueNote): string => {
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

export default function IssueNotes({ issueId, canComment }: IssueNotesProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<IssueNote[]>([]);
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

  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .schema("common")
        .from("issue_notes")
        .select("*")
        .eq("issue_id", issueId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const notesWithUsers = await Promise.all(
        (data || []).map(async (note) => {
          let displayName = "";
          let profileImage: string | undefined;
          let email = "";
          try {
            const { data: profileData } = await supabase
              .schema("common")
              .from("profiles")
              .select("id, full_name, email, avatar_url, profile_image")
              .eq("id", note.user_id)
              .maybeSingle();
            if (profileData) {
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
          if (!displayName) {
            try {
              const { data: metaData } = await supabase
                .schema("common")
                .rpc("get_user_metadata", { p_user_id: note.user_id });
              if (metaData) {
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
    } catch (err) {
      console.error("Error fetching issue notes:", err);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [issueId]);

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
      const fileName = `issue-notes/${issueId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error } = await supabase.storage
        .from("documents")
        .upload(fileName, file, { cacheControl: "3600", upsert: false });
      if (error) return null;
      const { data: urlData } = supabase.storage
        .from("documents")
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
    if ((!newNote.trim() && !selectedFile) || !user?.id || !canComment) return;
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
        if (!attachmentData && selectedFile)
          toast({
            title: "Attachment failed",
            description: "Note will be saved without attachment.",
            variant: "destructive",
          });
      }
      const noteData: Record<string, unknown> = {
        issue_id: issueId,
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
        .schema("common")
        .from("issue_notes")
        .insert(noteData)
        .select()
        .single();
      if (error) throw error;
      const newNoteWithUser: IssueNote = {
        ...data,
        user: { email: user.email || "", user_metadata: user.user_metadata },
      };
      setNotes((prev) => [...prev, newNoteWithUser]);
      setNewNote("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({
        title: "Note added",
        description: "Your comment has been saved.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to save note.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const handleEdit = async (noteId: string) => {
    if (!editContent.trim()) return;
    try {
      const { error } = await supabase
        .schema("common")
        .from("issue_notes")
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
        description: "Your comment has been updated.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note || note.user_id !== user?.id) return;
    if (!confirm("Delete this comment?")) return;
    try {
      const { error } = await supabase
        .schema("common")
        .from("issue_notes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", noteId);
      if (error) throw error;
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast({
        title: "Comment deleted",
        description: "Your comment has been removed.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col min-h-[280px] max-h-[400px] bg-white dark:bg-dark-150 rounded-lg border border-neutral-200 dark:border-neutral-700">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[#f26722]" />
            Comments & feedback
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {canComment
              ? "Add a comment or feedback."
              : "Only authorized users can add comments."}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notes.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="mx-auto h-10 w-10 text-neutral-400 dark:text-neutral-500" />
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {canComment
                  ? "No comments yet. Be the first to add feedback."
                  : "No comments yet."}
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
                <div
                  key={note.id}
                  className={`flex gap-2 ${isCurrentUser ? "flex-row-reverse" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => setProfileViewUserId(note.user_id)}
                    className={`flex-shrink-0 h-8 w-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-medium cursor-pointer hover:ring-2 hover:ring-[#f26722] ${
                      !profileImageUrl &&
                      (isCurrentUser
                        ? "bg-[#f26722] text-white"
                        : "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300")
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
                  <div
                    className={`flex-1 max-w-[85%] ${isCurrentUser ? "text-right" : ""}`}
                  >
                    <div
                      className={`flex items-center gap-1.5 mb-0.5 ${isCurrentUser ? "justify-end" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => setProfileViewUserId(note.user_id)}
                        className={`text-xs font-medium text-neutral-900 dark:text-white hover:underline ${isCurrentUser ? "text-right" : "text-left"}`}
                      >
                        {isCurrentUser ? "You" : getUserDisplayName(note)}
                      </button>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {formatDate(note.created_at)}
                        {note.edited && " (edited)"}
                      </span>
                    </div>
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${isCurrentUser ? "bg-[#f26722] text-white" : "bg-neutral-100 dark:bg-dark-100 text-neutral-900 dark:text-white"}`}
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full p-2 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-150 text-neutral-900 dark:text-white resize-none"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(null);
                                setEditContent("");
                              }}
                              className="p-1 text-neutral-500 hover:text-neutral-700 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEdit(note.id)}
                              className="p-1 text-green-600 hover:text-green-700 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap break-words">
                            {note.content}
                          </p>
                          {note.attachment_url && (
                            <div
                              className={`mt-1.5 pt-1.5 border-t ${isCurrentUser ? "border-white/20" : "border-neutral-200 dark:border-neutral-600"}`}
                            >
                              <a
                                href={note.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-1.5 text-xs ${isCurrentUser ? "text-white/90 hover:text-white" : "text-blue-600 dark:text-blue-400 hover:underline"}`}
                              >
                                {getFileIcon(note.attachment_type)}
                                <span className="truncate max-w-[180px]">
                                  {note.attachment_name}
                                </span>
                                {note.attachment_size != null && (
                                  <span className="opacity-70">
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
                      <div className="flex gap-0.5 mt-0.5 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditContent(note.content);
                          }}
                          className="p-0.5 text-neutral-400 hover:text-neutral-600"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(note.id)}
                          className="p-0.5 text-neutral-400 hover:text-red-500"
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
        {canComment && (
          <div className="border-t border-neutral-200 dark:border-neutral-700 px-3 py-2">
            {selectedFile && (
              <div className="mb-2 flex items-center gap-2 px-2 py-1.5 bg-neutral-100 dark:bg-dark-100 rounded text-sm">
                {getFileIcon(selectedFile.type)}
                <span className="flex-1 truncate text-neutral-700 dark:text-neutral-300">
                  {selectedFile.name}
                </span>
                <span className="text-xs text-neutral-500">
                  {formatFileSize(selectedFile.size)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="p-0.5 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 min-w-0 h-8 px-2 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-dark-100 text-neutral-900 dark:text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
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
                className="p-1.5 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 rounded shrink-0"
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
              <p className="mt-0.5 text-[10px] text-neutral-500">
                Uploading...
              </p>
            )}
          </div>
        )}
      </div>
      <ProfileView
        isOpen={!!profileViewUserId}
        onClose={() => setProfileViewUserId(null)}
        userId={profileViewUserId ?? undefined}
      />
    </>
  );
}
