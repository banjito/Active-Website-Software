import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ApplicationQuestionsBuilder } from "@/components/hr/ApplicationQuestionsBuilder";
import {
  applicationQuestionsService,
  toDraft,
  DraftApplicationQuestion,
} from "@/services/hr/applicationQuestionsService";
import { JobRequisition } from "@/services/hr/jobRequisitionsService";

interface ApplicationQuestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requisition: JobRequisition | null;
  /** Lets the parent refresh anything that counts questions. */
  onSaved?: () => void;
}

/**
 * Manage the custom questions on an existing job posting. Edits are held in
 * memory and written when Save is pressed, so a half-finished change can be
 * abandoned with Cancel.
 */
export const ApplicationQuestionsDialog: React.FC<
  ApplicationQuestionsDialogProps
> = ({ open, onOpenChange, requisition, onSaved }) => {
  const [questions, setQuestions] = useState<DraftApplicationQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const requisitionId = requisition?.id ?? null;

  const loadQuestions = useCallback(async () => {
    if (!requisitionId) return;
    try {
      setLoading(true);
      const loaded =
        await applicationQuestionsService.getByRequisition(requisitionId);
      setQuestions(loaded.map(toDraft));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load questions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [requisitionId]);

  useEffect(() => {
    if (open && requisitionId) loadQuestions();
    if (!open) setQuestions([]);
  }, [open, requisitionId, loadQuestions]);

  const handleSave = async () => {
    if (!requisitionId) return;
    try {
      setSaving(true);
      await applicationQuestionsService.saveForRequisition(
        requisitionId,
        questions,
      );
      toast({
        title: "Saved",
        description: "Application questions updated.",
        variant: "success",
      });
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save questions",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Application Questions</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <ApplicationQuestionsBuilder
              questions={questions}
              onChange={setQuestions}
              currentRequisitionId={requisitionId}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-brand hover:bg-brand/90 text-white"
          >
            {saving ? "Saving..." : "Save Questions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApplicationQuestionsDialog;
