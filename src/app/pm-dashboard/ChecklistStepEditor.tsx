import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/toast';
import {
  AUTO_RULE_LABELS,
  CHECKLIST_PHASES,
  DUE_ANCHOR_LABELS,
  saveChecklistSteps,
  type AutoRule,
  type ChecklistPhase,
  type ChecklistStep,
  type DueAnchor,
} from '@/services/jobChecklistService';

// Plain controls: the shared Input and Select add a bottom margin meant for forms
const FIELD =
  'rounded-none border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100';

function NativeSelect({
  options,
  className = '',
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={`${FIELD} ${className}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const phaseOptions = CHECKLIST_PHASES.map((p) => ({ value: p, label: p }));
const anchorOptions = [
  { value: '', label: 'No due date' },
  ...(Object.keys(DUE_ANCHOR_LABELS) as DueAnchor[]).map((a) => ({ value: a, label: DUE_ANCHOR_LABELS[a] })),
];
const directionOptions = [
  { value: 'after', label: 'after' },
  { value: 'before', label: 'before' },
];
const autoOptions = [
  { value: '', label: 'A person ticks it' },
  ...(Object.keys(AUTO_RULE_LABELS) as AutoRule[]).map((r) => ({ value: r, label: AUTO_RULE_LABELS[r] })),
];

interface ChecklistStepEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current (not archived) steps */
  steps: ChecklistStep[];
  onSaved: () => void;
}

export default function ChecklistStepEditor({ open, onOpenChange, steps, onSaved }: ChecklistStepEditorProps) {
  const [draft, setDraft] = useState<ChecklistStep[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(steps.map((s) => ({ ...s })));
  }, [open, steps]);

  const visible = draft.filter((s) => !s.archived_at);

  const update = (id: string, patch: Partial<ChecklistStep>) =>
    setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const move = (id: string, delta: number) =>
    setDraft((prev) => {
      const shown = prev.filter((s) => !s.archived_at);
      const from = shown.findIndex((s) => s.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= shown.length) return prev;
      const reordered = [...shown];
      [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
      return [...reordered, ...prev.filter((s) => s.archived_at)];
    });

  const addStep = () =>
    setDraft((prev) => [
      ...prev.filter((s) => !s.archived_at),
      {
        id: crypto.randomUUID(),
        key: null,
        name: '',
        phase: 'Setup',
        sort_order: 0,
        due_anchor: null,
        due_offset_days: 0,
        auto_rule: null,
        archived_at: null,
      },
      ...prev.filter((s) => s.archived_at),
    ]);

  const handleSave = async () => {
    if (visible.some((s) => !s.name.trim())) {
      toast({ title: 'Error', description: 'Every step needs a name.', variant: 'destructive' });
      return;
    }
    // Order on screen becomes the saved order
    const ordered = visible.map((s, i) => ({ ...s, sort_order: (i + 1) * 10 }));
    const removed = draft.filter((s) => s.archived_at && steps.some((orig) => orig.id === s.id));
    setSaving(true);
    try {
      await saveChecklistSteps([...ordered, ...removed]);
      toast({ title: 'Saved', description: 'Checklist steps updated.' });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error('[ChecklistStepEditor] Save failed:', err);
      toast({
        title: 'Error',
        description: `Could not save steps: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Job checklist steps</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Every job shows these steps, in this order. Removing a step hides it; past ticks stay in history.
        </p>
        <div className="max-h-[60vh] overflow-auto border border-neutral-200 dark:border-neutral-700">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="w-16 px-2 py-2 font-medium" />
                <th className="px-2 py-2 font-medium">Step</th>
                <th className="w-32 px-2 py-2 font-medium">Phase</th>
                <th className="px-2 py-2 font-medium">Due</th>
                <th className="w-56 px-2 py-2 font-medium">Ticks itself when</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((step, i) => (
                <tr key={step.id} className="border-t border-neutral-200 dark:border-neutral-700">
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => move(step.id, -1)}
                        className="p-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30 dark:text-neutral-400 dark:hover:text-neutral-100"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={i === visible.length - 1}
                        onClick={() => move(step.id, 1)}
                        className="p-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30 dark:text-neutral-400 dark:hover:text-neutral-100"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label="Step name"
                      className={`${FIELD} w-full`}
                      value={step.name}
                      onChange={(e) => update(step.id, { name: e.target.value })}
                      placeholder="Example: PO received"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <NativeSelect
                      aria-label="Phase"
                      value={step.phase}
                      onChange={(e) => update(step.id, { phase: e.target.value as ChecklistPhase })}
                      options={phaseOptions}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      {step.due_anchor && (
                        <>
                          <input
                            aria-label="Days"
                            type="number"
                            min={0}
                            className={`${FIELD} w-16`}
                            value={String(Math.abs(step.due_offset_days))}
                            onChange={(e) => {
                              const n = Math.max(0, Math.round(Number(e.target.value) || 0));
                              update(step.id, { due_offset_days: step.due_offset_days < 0 ? -n : n });
                            }}
                          />
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">days</span>
                          <NativeSelect
                            aria-label="Before or after"
                            value={step.due_offset_days < 0 ? 'before' : 'after'}
                            onChange={(e) =>
                              update(step.id, {
                                due_offset_days:
                                  Math.abs(step.due_offset_days) * (e.target.value === 'before' ? -1 : 1),
                              })
                            }
                            options={directionOptions}
                          />
                        </>
                      )}
                      <NativeSelect
                        aria-label="Due date counted from"
                        value={step.due_anchor ?? ''}
                        onChange={(e) =>
                          update(step.id, { due_anchor: (e.target.value || null) as DueAnchor | null })
                        }
                        options={anchorOptions}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <NativeSelect
                      aria-label="Ticks itself when"
                      value={step.auto_rule ?? ''}
                      onChange={(e) => update(step.id, { auto_rule: (e.target.value || null) as AutoRule | null })}
                      options={autoOptions}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-label={`Remove ${step.name || 'step'}`}
                      onClick={() =>
                        steps.some((orig) => orig.id === step.id)
                          ? update(step.id, { archived_at: new Date().toISOString() })
                          : setDraft((prev) => prev.filter((s) => s.id !== step.id))
                      }
                      className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={addStep} leftIcon={<Plus className="h-4 w-4" />}>
            Add step
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={saving}>
            Save steps
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
