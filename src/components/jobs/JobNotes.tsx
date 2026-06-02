import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Pencil, Trash2, X, Check, Download, FileText, Image, File } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { toast } from '../ui/toast';
import { ProfileView } from '../profile/ProfileView';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface JobNote {
  id: string;
  job_id: string;
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

interface JobNotesProps {
  jobId: string;
}

// Get user display name
const getUserDisplayName = (note: JobNote): string => {
  if (note.user?.user_metadata?.full_name) {
    return note.user.user_metadata.full_name;
  }
  if (note.user?.user_metadata?.name) {
    return note.user.user_metadata.name;
  }
  if (note.user?.email) {
    return note.user.email.split('@')[0];
  }
  // Last resort: show a shortened user ID instead of "Unknown User"
  if (note.user_id) {
    return `User ${note.user_id.substring(0, 8)}`;
  }
  return 'Unknown User';
};

// Get user initials
const getUserInitials = (note: JobNote): string => {
  const name = getUserDisplayName(note);
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

// Format date for display
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit'
  });
};

// Format file size
const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Get file icon based on type
const getFileIcon = (type: string | null | undefined) => {
  if (!type) return <File className="w-4 h-4" />;
  if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
  if (type.includes('pdf')) return <FileText className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
};

export default function JobNotes({ jobId }: JobNotesProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [profileViewUserId, setProfileViewUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);

  // Fetch notes
  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .schema('neta_ops')
        .from('job_notes')
        .select('*')
        .eq('job_id', jobId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch user info for each note (name and profile picture for display)
      const notesWithUsers = await Promise.all(
        (data || []).map(async (note) => {
          let displayName = '';
          let profileImage: string | undefined;
          let email = '';

          try {
            const { data: profileData, error: profileError } = await supabase
              .schema('common')
              .from('profiles')
              .select('id, full_name, email, avatar_url, profile_image')
              .eq('id', note.user_id)
              .maybeSingle();

            if (!profileError && profileData) {
              email = (profileData as any).email || '';
              displayName = (profileData as any).full_name || email?.split('@')[0] || 'Unknown User';
              profileImage = (profileData as any).avatar_url || (profileData as any).profile_image;
            }
          } catch (profileErr) {
            console.warn('Error fetching profile for user:', note.user_id, profileErr);
          }

          if (!displayName || !profileImage) {
            try {
              const { data: metaData, error: metaError } = await supabase
                .schema('common')
                .rpc('get_user_metadata', { p_user_id: note.user_id });
              if (!metaError && metaData) {
                const m = metaData as any;
                if (!email) email = m.email || '';
                if (!displayName) displayName = m.full_name || m.name || email?.split('@')[0] || 'Unknown User';
                if (!profileImage) profileImage = m.profile_image || m.avatar_url;
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
                ...(profileImage ? { profileImage } : {})
              }
            }
          };
        })
      );

      setNotes(notesWithUsers);
    } catch (error) {
      console.error('Error fetching notes:', error);
      // Try without user metadata
      try {
        const { data } = await supabase
          .schema('neta_ops')
          .from('job_notes')
          .select('*')
          .eq('job_id', jobId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });
        setNotes(data || []);
      } catch (e) {
        console.error('Fallback fetch failed:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [jobId]);

  // Scroll to bottom when new notes are added
  useEffect(() => {
    if (notesEndRef.current) {
      notesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [notes.length]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Limit file size to 10MB
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please select a file smaller than 10MB',
          variant: 'destructive'
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  // Upload file to storage - uses 'job-documents' bucket (same as contract uploads)
  const uploadFile = async (file: File): Promise<{ url: string; name: string; type: string; size: number } | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const fileName = `job-notes/${jobId}/${uniqueId}.${fileExt}`;
      
      // Try job-documents bucket first (commonly used for job-related files)
      let bucket = 'job-documents';
      let uploadError = null;
      
      const { error: err1 } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      uploadError = err1;
      
      // If job-documents fails, try documents bucket as fallback
      if (uploadError) {
        console.warn('job-documents bucket failed, trying documents bucket:', uploadError);
        bucket = 'documents';
        const { error: err2 } = await supabase.storage
          .from(bucket)
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });
        
        if (err2) {
          console.error('Both buckets failed:', err2);
          throw err2;
        }
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return {
        url: publicUrl,
        name: file.name,
        type: file.type,
        size: file.size
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  };

  // Submit new note
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() && !selectedFile) return;
    if (!user?.id) return;

    setSubmitting(true);
    setUploading(!!selectedFile);

    try {
      let attachmentData = null;
      
      // Upload file if selected
      if (selectedFile) {
        attachmentData = await uploadFile(selectedFile);
        if (!attachmentData && selectedFile) {
          // File upload failed but we still have text - continue without attachment
          toast({
            title: 'Attachment failed',
            description: 'Could not upload file, but note will be saved without attachment.',
            variant: 'destructive'
          });
        }
      }

      const noteData: any = {
        job_id: jobId,
        user_id: user.id,
        content: newNote.trim() || (attachmentData ? `Attached: ${attachmentData.name}` : '')
      };

      if (attachmentData) {
        noteData.attachment_url = attachmentData.url;
        noteData.attachment_name = attachmentData.name;
        noteData.attachment_type = attachmentData.type;
        noteData.attachment_size = attachmentData.size;
      }

      const { data, error } = await supabase
        .schema('neta_ops')
        .from('job_notes')
        .insert(noteData)
        .select()
        .single();

      if (error) throw error;

      // Add the new note to the list with current user info
      const newNoteWithUser: JobNote = {
        ...data,
        user: {
          email: user.email || '',
          user_metadata: user.user_metadata
        }
      };

      setNotes(prev => [...prev, newNoteWithUser]);
      setNewNote('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      toast({
        title: 'Note added',
        description: 'Your note has been saved successfully.'
      });
    } catch (error: any) {
      console.error('Error submitting note:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save note. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  // Edit note
  const handleEdit = async (noteId: string) => {
    if (!editContent.trim()) return;

    try {
      const { error } = await supabase
        .schema('neta_ops')
        .from('job_notes')
        .update({ content: editContent.trim() })
        .eq('id', noteId);

      if (error) throw error;

      setNotes(prev => prev.map(note => 
        note.id === noteId 
          ? { ...note, content: editContent.trim(), edited: true, updated_at: new Date().toISOString() }
          : note
      ));

      setEditingNoteId(null);
      setEditContent('');

      toast({
        title: 'Note updated',
        description: 'Your note has been updated successfully.'
      });
    } catch (error: any) {
      console.error('Error updating note:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update note.',
        variant: 'destructive'
      });
    }
  };

  // Delete note (soft delete)
  const handleDelete = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      // Find the note to verify ownership
      const noteToDelete = notes.find(n => n.id === noteId);
      if (!noteToDelete) {
        throw new Error('Note not found');
      }
      
      // Double-check that the current user owns this note
      if (noteToDelete.user_id !== user?.id) {
        throw new Error('You can only delete your own notes');
      }

      const { error, data } = await supabase
        .schema('neta_ops')
        .from('job_notes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', noteId)
        .eq('user_id', user.id)  // Additional safety: only update if user_id matches
        .select();

      if (error) {
        console.error('Delete error details:', {
          error,
          noteId,
          userId: user?.id,
          noteUserId: noteToDelete.user_id
        });
        throw error;
      }

      // Verify the update actually happened
      if (!data || data.length === 0) {
        throw new Error('Note could not be updated. You may not have permission to delete this note.');
      }

      setNotes(prev => prev.filter(note => note.id !== noteId));

      toast({
        title: 'Note deleted',
        description: 'Your note has been deleted.'
      });
    } catch (error: any) {
      console.error('Error deleting note:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete note.',
        variant: 'destructive'
      });
    }
  };

  // Start editing a note
  const startEditing = (note: JobNote) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditContent('');
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
    <div className="flex flex-col min-h-[700px] max-h-[calc(100vh-300px)] bg-white dark:bg-dark-150 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Job Notes</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Team updates and communication for this job
        </p>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {notes.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">No notes yet</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Be the first to add a note to this job.
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
                className={`flex gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <button
                  type="button"
                  onClick={() => setProfileViewUserId(note.user_id)}
                  className={`flex-shrink-0 h-10 w-10 rounded-full overflow-hidden flex items-center justify-center text-sm font-medium cursor-pointer hover:ring-2 hover:ring-[#f26722] hover:ring-offset-2 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 ${
                    !profileImageUrl && (isCurrentUser ? 'bg-[#f26722] text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300')
                  }`}
                  title="View profile"
                >
                  {profileImageUrl ? (
                    <img src={profileImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    getUserInitials(note)
                  )}
                </button>

                {/* Note Content */}
                <div className={`flex-1 max-w-[80%] ${isCurrentUser ? 'text-right' : ''}`}>
                  {/* User name and time */}
                  <div className={`flex items-center gap-2 mb-1 ${isCurrentUser ? 'justify-end' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setProfileViewUserId(note.user_id)}
                      className={`text-sm font-medium text-gray-900 dark:text-white hover:underline focus:outline-none ${isCurrentUser ? 'text-right' : 'text-left'}`}
                    >
                      {isCurrentUser ? 'You' : getUserDisplayName(note)}
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(note.created_at)}
                      {note.edited && ' (edited)'}
                    </span>
                  </div>

                  {/* Note bubble */}
                  <div className={`rounded-lg px-4 py-3 ${
                    isCurrentUser 
                      ? 'bg-[#f26722] text-white' 
                      : 'bg-gray-100 dark:bg-dark-100 text-gray-900 dark:text-white'
                  }`}>
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
                            onClick={cancelEditing}
                            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white dark:bg-dark-150 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(note.id)}
                            className="p-1.5 text-green-600 hover:text-green-700 bg-white dark:bg-dark-150 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
                        
                        {/* Attachment */}
                        {note.attachment_url && (
                          <div className={`mt-2 pt-2 border-t ${
                            isCurrentUser ? 'border-white/20' : 'border-gray-200 dark:border-gray-600'
                          }`}>
                            <a
                              href={note.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-2 text-sm ${
                                isCurrentUser 
                                  ? 'text-white/90 hover:text-white' 
                                  : 'text-blue-600 dark:text-blue-400 hover:underline'
                              }`}
                            >
                              {getFileIcon(note.attachment_type)}
                              <span className="truncate max-w-[200px]">{note.attachment_name}</span>
                              {note.attachment_size && (
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

                  {/* Edit/Delete buttons for current user's notes */}
                  {isCurrentUser && !isEditing && (
                    <div className="flex gap-1 mt-1 justify-end">
                      <button
                        onClick={() => startEditing(note)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
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

      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        {/* Selected file preview */}
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
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              className="w-full px-4 py-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-dark-100 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:border-transparent"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
          </div>
          
          {/* Attachment button */}
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
            className="p-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-100 rounded-lg transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting || (!newNote.trim() && !selectedFile)}
            className="p-3 bg-[#f26722] text-white rounded-lg hover:bg-[#e55611] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
        
        {uploading && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Uploading attachment...
          </p>
        )}
        
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Press Enter to send, Shift+Enter for new line
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

