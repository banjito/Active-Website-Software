import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/Button';

type UploadingFile = {
  file: File;
  previewUrl: string; // only set for images
};

export const FloatingIssueReporter: React.FC = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageUrl = useMemo(() => {
    try { return window.location.href; } catch { return ''; }
  }, []);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  const onSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const uploads: UploadingFile[] = selected.map((file) => ({
      file,
      previewUrl: file.type && file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
    }));
    setFiles((prev) => [...prev, ...uploads]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('normal');
    setFiles([]);
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }
    setSubmitting(true);
    try {
      const reporterId = user?.id || null;

      // 1) Create issue record
      const { data: issue, error: insertErr } = await supabase
        .schema('common')
        .from('issue_reports')
        .insert({
          title: title.trim(),
          description: description.trim(),
          priority,
          page_url: pageUrl,
          reporter_id: reporterId
        })
        .select('*')
        .single();

      if (insertErr) throw insertErr;

      // 2) Upload attachments (if any)
      if (issue && files.length > 0) {
        for (const uf of files) {
          const fileExt = uf.file.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
          const storagePath = `issues/${issue.id}/${fileName}`;

          const { error: upErr } = await supabase.storage
            .from('documents')
            .upload(storagePath, uf.file, { upsert: false });
          if (upErr) throw upErr;

          const { data: pub } = supabase.storage
            .from('documents')
            .getPublicUrl(storagePath);

          await supabase
            .schema('common')
            .from('issue_attachments')
            .insert({
              issue_id: issue.id,
              file_path: storagePath,
              file_url: pub.publicUrl
            });
        }
      }

      setSuccess('Issue submitted. Thank you!');
      resetForm();
      setTimeout(() => setOpen(false), 1000);
    } catch (e: any) {
      console.error('Issue submit error:', e);
      setError(e?.message || 'Failed to submit issue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed left-4 bottom-4 z-50 print:hidden">
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          className="bg-[#f26722] hover:bg-[#e55611] text-white shadow-lg"
        >
          Report Issue
        </Button>
      )}

      {open && (
        <div className="w-[360px] max-w-[92vw] bg-white dark:bg-dark-150 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Report an Issue</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
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
                        <img src={f.previewUrl} alt={f.file.name} className="w-full h-16 object-cover rounded border border-gray-200 dark:border-gray-700" />
                      ) : (
                        <div className="w-full h-16 flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-100 text-xs text-gray-600 dark:text-gray-300 p-1 text-center">
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

            <div className="text-xs text-gray-500 dark:text-gray-400">
              Page: {pageUrl || 'unknown'}
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}
            {success && <div className="text-sm text-green-600">{success}</div>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={() => { resetForm(); setOpen(false); }}
                className="bg-white dark:bg-dark-100 border border-gray-300 dark:border-gray-600"
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-[#f26722] hover:bg-[#e55611] text-white"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingIssueReporter;


