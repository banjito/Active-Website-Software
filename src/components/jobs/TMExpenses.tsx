import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, Check, X, FileDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";
import { toast } from "../ui/toast";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/Table";
import { format } from "date-fns";

interface JobExpense {
  id: string;
  job_id: string;
  expense_date: string;
  category: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number;
  total_amount: number;
  billable: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

interface TMExpensesProps {
  jobId: string;
  jobNumber?: string | null;
}

const CATEGORIES = [
  { value: "labor", label: "Labor" },
  { value: "materials", label: "Materials" },
  { value: "equipment", label: "Equipment" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "travel", label: "Travel" },
  { value: "other", label: "Other" },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label])
);

const COMMON_UNITS = [
  { value: "", label: "— none —" },
  { value: "hrs", label: "hrs" },
  { value: "ea", label: "ea" },
  { value: "ft", label: "ft" },
  { value: "lbs", label: "lbs" },
  { value: "gal", label: "gal" },
  { value: "day", label: "day" },
  { value: "lot", label: "lot" },
];

const emptyForm = () => ({
  expense_date: format(new Date(), "yyyy-MM-dd"),
  category: "labor",
  description: "",
  quantity: "",
  unit: "",
  unit_price: "",
  billable: true,
  notes: "",
});

export default function TMExpenses({ jobId, jobNumber }: TMExpensesProps) {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<JobExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .schema("neta_ops")
      .from("job_expenses")
      .select("*")
      .eq("job_id", jobId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading expenses", variant: "destructive" });
    } else {
      setExpenses((data as JobExpense[]) ?? []);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const computedTotal = () => {
    const qty = parseFloat(form.quantity) || null;
    const price = parseFloat(form.unit_price) || 0;
    return qty != null ? qty * price : price;
  };

  const openAdd = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (expense: JobExpense) => {
    setForm({
      expense_date: expense.expense_date,
      category: expense.category,
      description: expense.description,
      quantity: expense.quantity != null ? String(expense.quantity) : "",
      unit: expense.unit ?? "",
      unit_price: String(expense.unit_price),
      billable: expense.billable,
      notes: expense.notes ?? "",
    });
    setEditingId(expense.id);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) {
      toast({ title: "Description is required", variant: "destructive" });
      return;
    }
    const total = computedTotal();
    setSaving(true);

    const payload = {
      job_id: jobId,
      expense_date: form.expense_date,
      category: form.category,
      description: form.description.trim(),
      quantity: form.quantity !== "" ? parseFloat(form.quantity) : null,
      unit: form.unit || null,
      unit_price: parseFloat(form.unit_price) || 0,
      total_amount: total,
      billable: form.billable,
      notes: form.notes.trim() || null,
      created_by: user?.id ?? null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase
        .schema("neta_ops")
        .from("job_expenses")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingId));
    } else {
      ({ error } = await supabase
        .schema("neta_ops")
        .from("job_expenses")
        .insert(payload));
    }

    setSaving(false);
    if (error) {
      toast({ title: "Error saving expense", variant: "destructive" });
    } else {
      toast({ title: editingId ? "Expense updated" : "Expense added" });
      setShowForm(false);
      fetchExpenses();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense entry?")) return;
    const { error } = await supabase
      .schema("neta_ops")
      .from("job_expenses")
      .delete()
      .eq("id", id);
    if (error) {
      toast({ title: "Error deleting expense", variant: "destructive" });
    } else {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const exportCSV = () => {
    const headers = [
      "Date",
      "Category",
      "Description",
      "Qty",
      "Unit",
      "Unit Price",
      "Total",
      "Billable",
      "Notes",
    ];
    const rows = expenses.map((e) => [
      e.expense_date,
      CATEGORY_LABELS[e.category] ?? e.category,
      `"${e.description.replace(/"/g, '""')}"`,
      e.quantity ?? "",
      e.unit ?? "",
      e.unit_price.toFixed(2),
      e.total_amount.toFixed(2),
      e.billable ? "Yes" : "No",
      `"${(e.notes ?? "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `TM-expenses-job${jobNumber ?? jobId}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
  };

  const billableTotal = expenses
    .filter((e) => e.billable)
    .reduce((s, e) => s + e.total_amount, 0);
  const nonBillableTotal = expenses
    .filter((e) => !e.billable)
    .reduce((s, e) => s + e.total_amount, 0);
  const grandTotal = billableTotal + nonBillableTotal;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
          T&amp;M Expense Log
        </h3>
        <div className="flex gap-2">
          {expenses.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              leftIcon={<FileDown className="w-4 h-4" />}
            >
              Export CSV
            </Button>
          )}
          <Button size="sm" onClick={openAdd} leftIcon={<Plus className="w-4 h-4" />}>
            Add Expense
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {expenses.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-none p-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              Billable
            </p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">
              ${billableTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-none p-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              Non-Billable
            </p>
            <p className="text-xl font-bold text-neutral-600 dark:text-neutral-300">
              ${nonBillableTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-none p-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              Grand Total
            </p>
            <p className="text-xl font-bold text-neutral-900 dark:text-white">
              ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-neutral-200 dark:border-neutral-700 rounded-none overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Billable</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-6 text-neutral-400">
                  Loading…
                </TableCell>
              </TableRow>
            ) : expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-neutral-400">
                  No expenses logged yet. Click <strong>Add Expense</strong> to start tracking.
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(expense.expense_date + "T00:00:00"), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-none bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                      {CATEGORY_LABELS[expense.category] ?? expense.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm max-w-[180px]">
                    {expense.description}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {expense.quantity != null ? expense.quantity : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-500">
                    {expense.unit ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    ${expense.unit_price.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-sm">
                    ${expense.total_amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    {expense.billable ? (
                      <Check className="w-4 h-4 text-green-500 mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-neutral-400 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-500 max-w-[160px] truncate">
                    {expense.notes ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(expense)}
                        className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="p-1 text-neutral-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Expense" : "Add T&M Expense"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                type="date"
                label="Date *"
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                required
              />
              <Select
                label="Category *"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                options={CATEGORIES}
                required
              />
            </div>

            <Input
              label="Description *"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What was purchased or performed?"
              required
            />

            <div className="grid grid-cols-3 gap-4">
              <Input
                type="number"
                step="any"
                label="Quantity"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                placeholder="e.g. 4"
              />
              <Select
                label="Unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                options={COMMON_UNITS}
              />
              <div>
                <Input
                  type="number"
                  step="0.01"
                  label="Unit Price ($) *"
                  value={form.unit_price}
                  onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            {/* Computed total preview */}
            <div className="flex items-center gap-3 py-1">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                Computed total:
              </span>
              <span className="text-base font-semibold text-neutral-900 dark:text-white">
                ${computedTotal().toFixed(2)}
              </span>
              <label className="ml-auto flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.billable}
                  onChange={(e) => setForm({ ...form, billable: e.target.checked })}
                  className="w-4 h-4 accent-brand"
                />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Billable to customer
                </span>
              </label>
            </div>

            <Textarea
              label="Notes / Change Details"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any scope changes, delays, or context for this expense…"
              rows={3}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save Changes" : "Add Expense"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
