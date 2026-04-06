import React, { useState, useEffect } from 'react';
import Card, { CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/Dialog';
import { Select } from '../../../components/ui/Select';
import { Plus, Edit, Trash2, ChevronUp, ChevronDown, ListChecks } from 'lucide-react';
import {
  interviewStagesService,
  InterviewStage,
  InterviewStageQuestion,
  CreateStageInput,
  CreateQuestionInput,
} from '../../../services/hr/interviewStagesService';
import { toast } from '../../../components/ui/toast';

const slugFromName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export const InterviewStagesSettings: React.FC = () => {
  const [stages, setStages] = useState<InterviewStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<InterviewStage | null>(null);
  const [editingStageQuestions, setEditingStageQuestions] = useState<InterviewStageQuestion[]>([]);
  const [selectedStageForTemplate, setSelectedStageForTemplate] = useState<InterviewStage | null>(null);
  const [saving, setSaving] = useState(false);

  const [stageForm, setStageForm] = useState<CreateStageInput>({
    name: '',
    slug: '',
    display_order: 0,
    default_duration_minutes: 60,
    is_final_stage: false,
  });

  const [questionForm, setQuestionForm] = useState<CreateQuestionInput>({
    stage_id: '',
    label: '',
    question_type: 'text',
    display_order: 0,
    required: false,
  });
  const [editingQuestion, setEditingQuestion] = useState<InterviewStageQuestion | null>(null);
  const [questionFormModalOpen, setQuestionFormModalOpen] = useState(false);

  const loadStages = async () => {
    try {
      setLoading(true);
      const data = await interviewStagesService.getStages();
      setStages(data);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to load stages', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStages();
  }, []);

  const openAddStage = () => {
    setEditingStage(null);
    setStageForm({
      name: '',
      slug: '',
      display_order: stages.length,
      default_duration_minutes: 60,
      is_final_stage: false,
    });
    setStageModalOpen(true);
  };

  const openEditStage = (stage: InterviewStage) => {
    setEditingStage(stage);
    setStageForm({
      name: stage.name,
      slug: stage.slug,
      display_order: stage.display_order,
      default_duration_minutes: stage.default_duration_minutes,
      is_final_stage: stage.is_final_stage,
    });
    setStageModalOpen(true);
  };

  const handleStageNameChange = (name: string) => {
    setStageForm((prev) => ({
      ...prev,
      name,
      slug: editingStage ? prev.slug : slugFromName(name),
    }));
  };

  const handleSaveStage = async () => {
    if (!stageForm.name.trim()) {
      toast({ title: 'Validation', description: 'Stage name is required', variant: 'destructive' });
      return;
    }
    if (!stageForm.slug.trim()) {
      toast({ title: 'Validation', description: 'Slug is required', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      if (editingStage) {
        await interviewStagesService.updateStage(editingStage.id, stageForm);
        toast({ title: 'Success', description: 'Stage updated', variant: 'success' });
      } else {
        await interviewStagesService.createStage(stageForm);
        toast({ title: 'Success', description: 'Stage added', variant: 'success' });
      }
      setStageModalOpen(false);
      loadStages();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to save stage', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStage = async (stage: InterviewStage) => {
    if (!window.confirm(`Delete stage "${stage.name}"? This cannot be undone.`)) return;
    try {
      await interviewStagesService.deleteStage(stage.id);
      toast({ title: 'Success', description: 'Stage removed', variant: 'success' });
      loadStages();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to delete stage', variant: 'destructive' });
    }
  };

  const openTemplateModal = async (stage: InterviewStage) => {
    setSelectedStageForTemplate(stage);
    try {
      const questions = await interviewStagesService.getQuestionsForStage(stage.id);
      setEditingStageQuestions(questions);
      setTemplateModalOpen(true);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to load questions', variant: 'destructive' });
    }
  };

  const openAddQuestion = () => {
    if (!selectedStageForTemplate) return;
    setEditingQuestion(null);
    setQuestionForm({
      stage_id: selectedStageForTemplate.id,
      label: '',
      question_type: 'text',
      display_order: editingStageQuestions.length,
      required: false,
    });
    setQuestionFormModalOpen(true);
  };

  const openEditQuestion = (q: InterviewStageQuestion) => {
    setEditingQuestion(q);
    setQuestionForm({
      stage_id: q.stage_id,
      label: q.label,
      question_type: q.question_type,
      display_order: q.display_order,
      required: q.required,
    });
    setQuestionFormModalOpen(true);
  };

  const handleSaveQuestion = async () => {
    if (!questionForm.label.trim()) {
      toast({ title: 'Validation', description: 'Question label is required', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      if (editingQuestion) {
        await interviewStagesService.updateQuestion(editingQuestion.id, {
          label: questionForm.label,
          question_type: questionForm.question_type,
          required: questionForm.required,
        });
        toast({ title: 'Success', description: 'Question updated', variant: 'success' });
      } else {
        await interviewStagesService.createQuestion(questionForm);
        toast({ title: 'Success', description: 'Question added', variant: 'success' });
      }
      setQuestionFormModalOpen(false);
      if (selectedStageForTemplate) {
        const questions = await interviewStagesService.getQuestionsForStage(selectedStageForTemplate.id);
        setEditingStageQuestions(questions);
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to save question', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (q: InterviewStageQuestion) => {
    if (!window.confirm('Remove this question from the template?')) return;
    try {
      await interviewStagesService.deleteQuestion(q.id);
      if (selectedStageForTemplate) {
        const questions = await interviewStagesService.getQuestionsForStage(selectedStageForTemplate.id);
        setEditingStageQuestions(questions);
      }
      toast({ title: 'Success', description: 'Question removed', variant: 'success' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to delete question', variant: 'destructive' });
    }
  };

  const moveQuestion = async (index: number, direction: 'up' | 'down') => {
    const newOrder = [...editingStageQuestions];
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= newOrder.length) return;
    [newOrder[index], newOrder[swap]] = [newOrder[swap], newOrder[index]];
    const questionIds = newOrder.map((q) => q.id);
    try {
      await interviewStagesService.reorderQuestions(selectedStageForTemplate!.id, questionIds);
      setEditingStageQuestions(newOrder);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to reorder', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Interview Stages & Templates</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Add or remove interview stages and define custom question templates for each stage. These questions are used when conducting interviews.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Stages</CardTitle>
            <CardDescription>Stages appear in the Interview Scheduling dropdown. Reorder by display order.</CardDescription>
          </div>
          <Button onClick={openAddStage}>
            <Plus className="h-4 w-4 mr-2" />
            Add stage
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : stages.length === 0 ? (
            <p className="text-gray-500">No stages yet. Add one to get started.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {stages.map((stage) => (
                <li key={stage.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-900 dark:text-white">{stage.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2 text-sm">({stage.slug})</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      · {stage.default_duration_minutes} min
                    </span>
                    {stage.is_final_stage && (
                      <span className="ml-2 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                        Final
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openTemplateModal(stage)}>
                      <ListChecks className="h-4 w-4 mr-1" />
                      Question template
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEditStage(stage)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteStage(stage)}
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

      {/* Stage create/edit modal */}
      <Dialog open={stageModalOpen} onOpenChange={setStageModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStage ? 'Edit stage' : 'Add stage'}</DialogTitle>
            <DialogDescription>
              {editingStage
                ? 'Update stage name, slug, default duration, or final flag.'
                : 'New stages appear in Interview Scheduling. Use a unique slug (e.g. phone_screen).'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              label="Stage name"
              value={stageForm.name}
              onChange={(e) => handleStageNameChange(e.target.value)}
              placeholder="e.g. Initial/Culture Interview"
            />
            <Input
              label="Slug"
              value={stageForm.slug}
              onChange={(e) => setStageForm((p) => ({ ...p, slug: e.target.value }))}
              placeholder="e.g. initial_culture"
            />
            <Input
              label="Default duration (minutes)"
              type="number"
              value={stageForm.default_duration_minutes?.toString() ?? '60'}
              onChange={(e) => setStageForm((p) => ({ ...p, default_duration_minutes: parseInt(e.target.value, 10) || 60 }))}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stageForm.is_final_stage ?? false}
                onChange={(e) => setStageForm((p) => ({ ...p, is_final_stage: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Final stage (approve/deny only, no feedback form)</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveStage} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Question template modal */}
      <Dialog open={templateModalOpen} onOpenChange={setTemplateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Question template: {selectedStageForTemplate?.name}</DialogTitle>
            <DialogDescription>
              These questions are shown when conducting an interview at this stage. Add, edit, or reorder questions.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Button variant="outline" size="sm" onClick={openAddQuestion} className="mb-4">
              <Plus className="h-4 w-4 mr-2" />
              Add question
            </Button>
            {editingStageQuestions.length === 0 ? (
              <p className="text-gray-500 text-sm">No questions. Add one to build the feedback form for this stage.</p>
            ) : (
              <ul className="space-y-2">
                {editingStageQuestions.map((q, index) => (
                  <li
                    key={q.id}
                    className="flex items-center gap-2 p-3 border border-gray-200 dark:border-gray-700 rounded-md"
                  >
                    <div className="flex flex-col gap-0">
                      <button
                        type="button"
                        onClick={() => moveQuestion(index, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(index, 'down')}
                        disabled={index === editingStageQuestions.length - 1}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{q.label}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {q.question_type} {q.required ? '· Required' : ''}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEditQuestion(q)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteQuestion(q)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setTemplateModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/edit question modal */}
      <Dialog open={questionFormModalOpen} onOpenChange={setQuestionFormModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingQuestion ? 'Edit question' : 'Add question'}</DialogTitle>
            <DialogDescription>Text = one notes field. Checkbox = optional checkbox with notes when checked.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              label="Question / prompt"
              value={questionForm.label}
              onChange={(e) => setQuestionForm((p) => ({ ...p, label: e.target.value }))}
              placeholder="e.g. Getting to know candidate"
            />
            <Select
              label="Type"
              value={questionForm.question_type}
              onChange={(e) => setQuestionForm((p) => ({ ...p, question_type: e.target.value as 'text' | 'checkbox' }))}
              options={[
                { value: 'text', label: 'Text (notes field)' },
                { value: 'checkbox', label: 'Checkbox (with notes when checked)' },
              ]}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={questionForm.required ?? false}
                onChange={(e) => setQuestionForm((p) => ({ ...p, required: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Required</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestionFormModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveQuestion} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
