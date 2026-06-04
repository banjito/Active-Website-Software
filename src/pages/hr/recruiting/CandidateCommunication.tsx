import React, { useState, useEffect } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/Dialog';
import {
  Mail,
  Send,
  Plus,
  Edit,
  Trash2,
  Copy,
  Users,
  FileText,
} from 'lucide-react';
import { candidatesService, Candidate } from '../../../services/hr/candidatesService';
import {
  candidateCommunicationService,
  CandidateCommunicationTemplate,
  fillTemplate,
  getPlaceholderList,
} from '../../../services/hr/candidateCommunicationService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from '../../../components/ui/toast';

export const CandidateCommunication: React.FC = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [templates, setTemplates] = useState<CandidateCommunicationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [composeModalOpen, setComposeModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CandidateCommunicationTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', body: '' });
  const [saving, setSaving] = useState(false);

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [previewCandidateIndex, setPreviewCandidateIndex] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cands, tmpls] = await Promise.all([
        candidatesService.getAll(),
        candidateCommunicationService.getTemplates().catch(() => []),
      ]);
      setCandidates(cands);
      setTemplates(tmpls);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      subject: '',
      body: `Hi {{first_name}},

Thank you for your interest in the {{position_applied}} role.

Best regards,
Your Team`,
    });
    setTemplateModalOpen(true);
  };

  const openEditTemplate = (t: CandidateCommunicationTemplate) => {
    setEditingTemplate(t);
    setTemplateForm({ name: t.name, subject: t.subject, body: t.body });
    setTemplateModalOpen(true);
  };

  const handleSaveTemplate = async () => {
    const name = templateForm.name?.trim();
    if (!name) {
      toast({ title: 'Validation', description: 'Template name is required', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      if (editingTemplate) {
        await candidateCommunicationService.updateTemplate(editingTemplate.id, {
          name,
          subject: templateForm.subject,
          body: templateForm.body,
        });
        toast({ title: 'Success', description: 'Template updated', variant: 'success' });
      } else {
        await candidateCommunicationService.createTemplate({
          name,
          subject: templateForm.subject,
          body: templateForm.body,
        });
        toast({ title: 'Success', description: 'Template created', variant: 'success' });
      }
      setTemplateModalOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to save template', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (t: CandidateCommunicationTemplate) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try {
      await candidateCommunicationService.deleteTemplate(t.id);
      toast({ title: 'Success', description: 'Template deleted', variant: 'success' });
      loadData();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to delete', variant: 'destructive' });
    }
  };

  const openCompose = () => {
    setSelectedCandidateIds([]);
    setSelectedTemplateId(templates[0]?.id ?? '');
    setPreviewCandidateIndex(0);
    setComposeModalOpen(true);
  };

  const toggleCandidate = (id: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectedCandidates = candidates.filter((c) => selectedCandidateIds.includes(c.id));
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const previewCandidate = selectedCandidates[previewCandidateIndex] ?? null;
  const filled =
    selectedTemplate && previewCandidate
      ? fillTemplate(selectedTemplate.subject, selectedTemplate.body, previewCandidate)
      : { subject: '', body: '' };

  const copyToClipboard = (subject: string, body: string, candidate: Candidate) => {
    const text = `Subject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(text).then(
      () => toast({ title: 'Copied', description: `Email for ${candidate.first_name} ${candidate.last_name} copied to clipboard`, variant: 'success' }),
      () => toast({ title: 'Error', description: 'Failed to copy', variant: 'destructive' })
    );
  };

  const openInEmail = (candidate: Candidate, subject: string, body: string) => {
    const mailto = `mailto:${encodeURIComponent(candidate.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto);
  };

  const placeholders = getPlaceholderList();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Candidate Communication</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Create email templates, select candidates, and fill in their info—like offer letters—then copy or open in your email client.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openNewTemplate}>
            <Plus className="mr-2 h-4 w-4" />
            New template
          </Button>
          <Button className="bg-[#f26722] hover:bg-[#f26722]/90 text-white" onClick={openCompose}>
            <Mail className="mr-2 h-4 w-4" />
            Compose with template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Templates
            </CardTitle>
            <CardDescription>
              Reusable email templates. Use placeholders like {placeholders.slice(0, 3).join(', ')} to fill in candidate details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-6"><LoadingSpinner size="md" /></div>
            ) : templates.length === 0 ? (
              <p className="text-gray-500">No templates yet. Create one to get started.</p>
            ) : (
              <ul className="space-y-2">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">{t.name}</span>
                      {t.subject && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{t.subject}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => openEditTemplate(t)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteTemplate(t)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Quick compose
            </CardTitle>
            <CardDescription>
              Select candidates and a template, then preview the filled email and copy or open in your mail client.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={openCompose}
              disabled={templates.length === 0 || candidates.length === 0}
            >
              <Mail className="mr-2 h-4 w-4" />
              Compose with template
            </Button>
            {templates.length === 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">Create at least one template first.</p>
            )}
            {candidates.length === 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">No candidates in the system yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Template create/edit modal */}
      <Dialog open={templateModalOpen} onOpenChange={setTemplateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit template' : 'New template'}</DialogTitle>
            <DialogDescription>
              Use placeholders in subject and body: {placeholders.join(', ')}. They will be replaced with each candidate&apos;s info.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              label="Template name"
              value={templateForm.name}
              onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Interview follow-up"
            />
            <Input
              label="Subject line"
              value={templateForm.subject}
              onChange={(e) => setTemplateForm((p) => ({ ...p, subject: e.target.value }))}
              placeholder="e.g. Follow-up: {{position_applied}} at AMP"
            />
            <Textarea
              label="Body"
              value={templateForm.body}
              onChange={(e) => setTemplateForm((p) => ({ ...p, body: e.target.value }))}
              rows={12}
              placeholder="Hi {{first_name}}, ..."
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compose: select candidates + template, preview filled email */}
      <Dialog open={composeModalOpen} onOpenChange={setComposeModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compose with template</DialogTitle>
            <DialogDescription>
              Select one or more candidates and a template. Preview the filled email, then copy or open in your email client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Template</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              >
                <option value="">Select a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Candidates</label>
              <div className="border border-gray-300 dark:border-gray-600 rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                {candidates.length === 0 ? (
                  <p className="text-gray-500 text-sm">No candidates.</p>
                ) : (
                  candidates.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCandidateIds.includes(c.id)}
                        onChange={() => toggleCandidate(c.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-900 dark:text-white">
                        {c.first_name} {c.last_name} – {c.position_applied}
                      </span>
                      <span className="text-xs text-gray-500">({c.email})</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            {selectedCandidates.length > 0 && selectedTemplate && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Preview</label>
                  {selectedCandidates.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Candidate:</span>
                      <select
                        value={previewCandidateIndex}
                        onChange={(e) => setPreviewCandidateIndex(Number(e.target.value))}
                        className="text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-dark-100"
                      >
                        {selectedCandidates.map((c, i) => (
                          <option key={c.id} value={i}>
                            {c.first_name} {c.last_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50 space-y-3">
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Subject:</span>
                    <p className="text-gray-900 dark:text-white mt-0.5">{filled.subject || '(empty)'}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Body:</span>
                    <pre className="mt-0.5 text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans">
                      {filled.body || '(empty)'}
                    </pre>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(filled.subject, filled.body, previewCandidate!)}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy for {previewCandidate?.first_name}
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                      onClick={() => openInEmail(previewCandidate!, filled.subject, filled.body)}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Open in email
                    </Button>
                  </div>
                </div>
                {selectedCandidates.length > 1 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Copy or open for all selected:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedCandidates.map((c) => {
                        const { subject: s, body: b } = fillTemplate(
                          selectedTemplate.subject,
                          selectedTemplate.body,
                          c
                        );
                        return (
                          <div key={c.id} className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(s, b, c)}
                            >
                              Copy {c.first_name}
                            </Button>
                            <Button
                              size="sm"
                              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                              onClick={() => openInEmail(c, s, b)}
                            >
                              Email {c.first_name}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setComposeModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
