import React, { useState } from "react";
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
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/toast";
import { ArrowDown, ArrowUp, Copy, Edit, Plus, Trash2 } from "lucide-react";
import {
  applicationQuestionsService,
  questionTypeUsesOptions,
  toNewDraft,
  APPLICATION_QUESTION_TYPE_LABELS,
  ApplicationQuestionType,
  DraftApplicationQuestion,
} from "@/services/hr/applicationQuestionsService";
import {
  jobRequisitionsService,
  JobRequisition,
} from "@/services/hr/jobRequisitionsService";

interface ApplicationQuestionsBuilderProps {
  questions: DraftApplicationQuestion[];
  onChange: (questions: DraftApplicationQuestion[]) => void;
  /** Excluded from the "copy from another posting" list. Null while creating. */
  currentRequisitionId?: string | null;
}

const TYPE_OPTIONS = (
  Object.keys(APPLICATION_QUESTION_TYPE_LABELS) as ApplicationQuestionType[]
).map((value) => ({ value, label: APPLICATION_QUESTION_TYPE_LABELS[value] }));

const emptyForm = {
  label: "",
  question_type: "short_text" as ApplicationQuestionType,
  help_text: "",
  required: false,
  optionsText: "",
};

/**
 * Edits a list of application questions in memory. It never touches the
 * database, so the same UI works while a requisition is still being created
 * (nothing to attach to yet) and when editing a saved one. The caller decides
 * when to persist.
 */
export const ApplicationQuestionsBuilder: React.FC<
  ApplicationQuestionsBuilderProps
> = ({ questions, onChange, currentRequisitionId = null }) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState("");
  const [copyCandidates, setCopyCandidates] = useState<JobRequisition[]>([]);
  const [copying, setCopying] = useState(false);

  const openAdd = () => {
    setEditingIndex(null);
    setForm(emptyForm);
    setIsEditorOpen(true);
  };

  const openEdit = (index: number) => {
    const question = questions[index];
    setEditingIndex(index);
    setForm({
      label: question.label,
      question_type: question.question_type,
      help_text: question.help_text || "",
      required: question.required,
      optionsText: (question.options || []).join("\n"),
    });
    setIsEditorOpen(true);
  };

  const handleSaveQuestion = () => {
    if (!form.label.trim()) {
      toast({
        title: "Add a question",
        description: "Type the question applicants should answer.",
        variant: "destructive",
      });
      return;
    }

    const usesOptions = questionTypeUsesOptions(form.question_type);
    const options = usesOptions
      ? form.optionsText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];

    if (usesOptions && options.length < 2) {
      toast({
        title: "Add some choices",
        description: "A pick-one or pick-any question needs at least 2 choices.",
        variant: "destructive",
      });
      return;
    }

    const next = [...questions];
    const question: DraftApplicationQuestion = {
      // Keep the id when editing so the saved row is updated, not replaced.
      id: editingIndex === null ? undefined : questions[editingIndex].id,
      label: form.label.trim(),
      question_type: form.question_type,
      options,
      help_text: form.help_text.trim(),
      required: form.required,
    };

    if (editingIndex === null) next.push(question);
    else next[editingIndex] = question;

    onChange(next);
    setIsEditorOpen(false);
  };

  const handleDelete = (index: number) => {
    if (
      !window.confirm(
        `Remove "${questions[index].label}"? Answers already given stay on the candidate.`,
      )
    )
      return;
    onChange(questions.filter((_, i) => i !== index));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const openCopy = async () => {
    try {
      const all = await jobRequisitionsService.getAll();
      setCopyCandidates(all.filter((r) => r.id !== currentRequisitionId));
      setCopySourceId("");
      setIsCopyOpen(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load postings",
        variant: "destructive",
      });
    }
  };

  const handleCopy = async () => {
    if (!copySourceId) return;
    try {
      setCopying(true);
      const source =
        await applicationQuestionsService.getByRequisition(copySourceId);
      setIsCopyOpen(false);
      if (source.length === 0) {
        toast({
          title: "Nothing to copy",
          description: "That posting has no questions.",
        });
        return;
      }
      onChange([...questions, ...source.map(toNewDraft)]);
      toast({
        title: "Questions copied",
        description: `Added ${source.length} question${source.length === 1 ? "" : "s"}. Nothing is saved until you save the posting.`,
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to copy questions",
        variant: "destructive",
      });
    } finally {
      setCopying(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={openAdd}
            className="bg-brand hover:bg-brand/90 text-white"
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Add question
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openCopy}
            leftIcon={<Copy className="h-4 w-4" />}
          >
            Copy from another posting
          </Button>
        </div>

        {questions.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 border border-dashed border-neutral-300 dark:border-neutral-600 rounded-none p-6 text-center">
            No custom questions. Applicants will see only the standard fields.
          </p>
        ) : (
          <div className="space-y-2">
            {questions.map((question, index) => (
              <div
                key={question.id ?? `draft-${index}`}
                className="flex items-start gap-3 border border-neutral-200 dark:border-neutral-700 rounded-none p-3"
              >
                <div className="flex flex-col gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    title="Move up"
                    className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === questions.length - 1}
                    title="Move down"
                    className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">
                    {question.label}
                    {question.required && <span className="text-red-500"> *</span>}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {APPLICATION_QUESTION_TYPE_LABELS[question.question_type]}
                    {question.options.length > 0 &&
                      ` — ${question.options.join(", ")}`}
                  </p>
                  {question.help_text && (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 italic">
                      {question.help_text}
                    </p>
                  )}
                </div>

                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    title="Edit"
                    onClick={() => openEdit(index)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    title="Remove"
                    onClick={() => handleDelete(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / edit one question */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingIndex === null ? "Add question" : "Edit question"}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <Input
              label="Question *"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Do you hold a current NFPA 70E certification?"
            />
            <Select
              label="Answer type"
              value={form.question_type}
              onChange={(e) =>
                setForm({
                  ...form,
                  question_type: e.target.value as ApplicationQuestionType,
                })
              }
              options={TYPE_OPTIONS}
            />
            {questionTypeUsesOptions(form.question_type) && (
              <div className="mb-4">
                <label className="block mb-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Choices (one per line)
                </label>
                <textarea
                  value={form.optionsText}
                  onChange={(e) =>
                    setForm({ ...form, optionsText: e.target.value })
                  }
                  rows={5}
                  placeholder={"Yes\nNo\nIn progress"}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
                />
              </div>
            )}
            <Input
              label="Helper text (optional)"
              value={form.help_text}
              onChange={(e) => setForm({ ...form, help_text: e.target.value })}
              placeholder="Shown in small print under the question"
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.required}
                onChange={(e) => setForm({ ...form, required: e.target.checked })}
                className="rounded-none border-neutral-300 text-brand focus:ring-brand"
              />
              <span className="text-sm text-neutral-700 dark:text-neutral-300">
                Applicants must answer this
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveQuestion}
              className="bg-brand hover:bg-brand/90 text-white"
            >
              {editingIndex === null ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy questions from another posting */}
      <Dialog open={isCopyOpen} onOpenChange={setIsCopyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy questions</DialogTitle>
            <DialogDescription>
              Adds that posting's questions to this list. Nothing is removed.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Select
              label="Copy from"
              value={copySourceId}
              onChange={(e) => setCopySourceId(e.target.value)}
              options={[
                { value: "", label: "Select a posting..." },
                ...copyCandidates.map((r) => ({
                  value: r.id,
                  label: `${r.title}${r.department ? ` — ${r.department}` : ""}`,
                })),
              ]}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCopyOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCopy}
              disabled={copying || !copySourceId}
              className="bg-brand hover:bg-brand/90 text-white"
            >
              {copying ? "Copying..." : "Copy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ApplicationQuestionsBuilder;
