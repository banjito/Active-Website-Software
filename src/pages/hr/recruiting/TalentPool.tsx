import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card, {
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import {
  ArrowRight,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit,
  ExternalLink,
  Eye,
  Filter,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  StickyNote,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "../../../components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  prospectsService,
  CandidateMatch,
  Prospect,
  ProspectActivity,
  ProspectInput,
  ProspectSort,
  ProspectSource,
  ProspectStatus,
  TalentPoolAccess,
  TalentPoolMember,
} from "@/services/hr/prospectsService";
import {
  jobRequisitionsService,
  JobRequisition,
} from "@/services/hr/jobRequisitionsService";
import { normalizeEmail, normalizeLinkedin } from "@/lib/talentPool/normalize";
import { TalentPoolImportDialog } from "./TalentPoolImportDialog";

const PAGE_SIZE = 50;

const STATUS_OPTIONS: Array<{ value: ProspectStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "future_roles", label: "Future roles" },
  { value: "not_interested", label: "Not interested" },
  { value: "promoted", label: "In pipeline" },
];
const EDITABLE_STATUSES = STATUS_OPTIONS.filter((s) => s.value !== "promoted");

const SOURCE_OPTIONS: Array<{ value: ProspectSource; label: string }> = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

const statusLabel = (status: ProspectStatus) =>
  STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
const sourceLabel = (source: ProspectSource) =>
  SOURCE_OPTIONS.find((s) => s.value === source)?.label ?? source;

const getStatusColor = (status: ProspectStatus) => {
  switch (status) {
    case "new":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "contacted":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "interested":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "future_roles":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "not_interested":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "promoted":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    default:
      return "bg-neutral-100 text-neutral-800 dark:bg-dark-200 dark:text-neutral-200";
  }
};

const selectClass =
  "px-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand";
const labelClass = "block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1";
const thClass =
  "px-4 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider";

const fullName = (p: { first_name: string; last_name: string | null }) =>
  [p.first_name, p.last_name].filter(Boolean).join(" ");

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : "";
const formatDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

const toLocalInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

const emptyForm = (): ProspectInput => ({
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  linkedin_url: "",
  job_title: "",
  current_org: "",
  location: "",
  source: "other",
  status: "new",
  availability: "",
  needs_follow_up: false,
  owner_id: null,
});

export const TalentPool: React.FC = () => {
  const navigate = useNavigate();
  const [access, setAccess] = useState<TalentPoolAccess | null>(null);
  const [members, setMembers] = useState<TalentPoolMember[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ProspectStatus | "all" | "">("");
  const [filterSource, setFilterSource] = useState<ProspectSource | "">("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterFollowUp, setFilterFollowUp] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ProspectSort>("created_at");
  const [ascending, setAscending] = useState(false);

  const [rows, setRows] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<ProspectStatus, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkOwner, setBulkOwner] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [promoteFor, setPromoteFor] = useState<Prospect | null>(null);
  const [deleteFor, setDeleteFor] = useState<Prospect | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Selection is current-page only.
  useEffect(() => {
    setSelected(new Set());
  }, [search, filterStatus, filterSource, filterOwner, filterFollowUp, page, sort, ascending]);

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, filterSource, filterOwner, filterFollowUp, sort, ascending]);

  const loadMembers = useCallback(async () => {
    try {
      setMembers(await prospectsService.listMembers());
    } catch {
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const result = await prospectsService.getAccess();
        setAccess(result);
        if (result.can_access) loadMembers();
      } catch (error) {
        setAccess({ can_access: false, can_manage: false, promotion_enabled: false });
      }
    })();
  }, [loadMembers]);

  const load = useCallback(async () => {
    if (!access?.can_access) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    const filters = { search, source: filterSource, owner: filterOwner, followUp: filterFollowUp };
    try {
      const [list, statusCounts] = await Promise.all([
        prospectsService.list({ ...filters, status: filterStatus, page, pageSize: PAGE_SIZE, sort, ascending }),
        prospectsService.getCounts(filters),
      ]);
      if (requestId !== requestRef.current) return;
      setRows(list.rows);
      setTotal(list.total);
      setCounts(statusCounts);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      toast({ title: "Could not load prospects", description: errorMessage(error), variant: "destructive" });
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [access?.can_access, search, filterStatus, filterSource, filterOwner, filterFollowUp, page, sort, ascending]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    load();
    setDetailRefreshKey((k) => k + 1);
  };

  const handleSort = (field: ProspectSort) => {
    if (sort === field) setAscending((a) => !a);
    else {
      setSort(field);
      setAscending(field === "name" || field === "location");
    }
  };

  const selectableIds = rows.filter((r) => r.status !== "promoted").map((r) => r.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = async (kind: "status" | "owner") => {
    const ids = [...selected];
    setBulkBusy(true);
    try {
      const updated =
        kind === "status"
          ? await prospectsService.bulkUpdateStatus(ids, bulkStatus as Exclude<ProspectStatus, "promoted">)
          : await prospectsService.bulkAssignOwner(ids, bulkOwner === "unassigned" ? null : bulkOwner);
      toast({ title: `Updated ${updated} of ${ids.length} prospects`, variant: "success" });
      setBulkStatus("");
      setBulkOwner("");
      setSelected(new Set());
      load();
    } catch (error) {
      toast({ title: "Bulk update not applied", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteFor) return;
    setDeleting(true);
    try {
      await prospectsService.delete(deleteFor.id);
      toast({ title: "Prospect deleted", variant: "success" });
      if (detailId === deleteFor.id) setDetailId(null);
      setDeleteFor(null);
      load();
    } catch (error) {
      toast({ title: "Could not delete", description: errorMessage(error), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const onPromoted = (candidateId: string, alreadyPromoted: boolean) => {
    setPromoteFor(null);
    refresh();
    toast({
      title: alreadyPromoted ? "Already in the pipeline" : "Added to Candidate Tracking",
      description: "Interviews, offers, and onboarding continue there.",
      variant: "success",
      duration: 10000,
      action: {
        label: "Open candidate",
        onClick: () => navigate(`/hr/recruiting/candidate-tracking?candidateId=${candidateId}`),
      },
    });
  };

  if (!access) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <LoadingSpinner size="md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasFilters = !!(search || filterStatus || filterSource || filterOwner || filterFollowUp);
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Talent Pool</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            Sourced prospects not yet in the hiring pipeline
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.can_access && (
            <Button
              variant="outline"
              onClick={() => setImportOpen(true)}
              leftIcon={<Upload className="h-4 w-4" />}
            >
              Import CSV
            </Button>
          )}
          {access.can_access && (
            <Button
              className="bg-brand hover:bg-brand/90 text-white"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Add Prospect
            </Button>
          )}
        </div>
      </div>

      {!access.can_access ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <ShieldCheck className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">
                You don't have Talent Pool access
              </h3>
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                Ask an administrator to add you.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Status stats; click to filter */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {STATUS_OPTIONS.map((status) => {
              const active = filterStatus === status.value;
              return (
                <button
                  key={status.value}
                  type="button"
                  onClick={() => setFilterStatus(active ? "" : status.value)}
                  className="text-left"
                >
                  <Card className={active ? "ring-2 ring-brand" : "hover:bg-neutral-50 dark:hover:bg-dark-100"}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                        {status.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                        {counts ? counts[status.value] : "–"}
                      </div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search name, email, phone, title, company, LinkedIn..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-dark-150 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-neutral-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as ProspectStatus | "all" | "")}
                className={selectClass}
              >
                <option value="">Active (not in pipeline)</option>
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value as ProspectSource | "")}
                className={selectClass}
              >
                <option value="">All sources</option>
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className={selectClass}>
                <option value="">Any owner</option>
                <option value="unassigned">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 px-2">
                <input
                  type="checkbox"
                  checked={filterFollowUp}
                  onChange={(e) => setFilterFollowUp(e.target.checked)}
                  className="rounded-none accent-brand"
                />
                Needs follow-up
              </label>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-brand/10 text-brand text-sm">
              <span className="font-medium">{selected.size} selected</span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className={`${selectClass} py-1 text-sm`}
                disabled={bulkBusy}
              >
                <option value="">Change status...</option>
                {EDITABLE_STATUSES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" disabled={!bulkStatus || bulkBusy} onClick={() => runBulk("status")}>
                Apply
              </Button>
              <select
                value={bulkOwner}
                onChange={(e) => setBulkOwner(e.target.value)}
                className={`${selectClass} py-1 text-sm`}
                disabled={bulkBusy}
              >
                <option value="">Assign owner...</option>
                <option value="unassigned">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" disabled={!bulkOwner || bulkBusy} onClick={() => runBulk("owner")}>
                Apply
              </Button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="ml-auto flex items-center gap-1 hover:underline"
              >
                <X className="h-4 w-4" /> Clear
              </button>
            </div>
          )}

          {loading && rows.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <LoadingSpinner size="md" />
                </div>
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-neutral-400" />
                  <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">No prospects found</h3>
                  <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                    {hasFilters || page > 1
                      ? "Try adjusting your search or filters"
                      : "Get started by adding a prospect"}
                  </p>
                  {page > 1 && (
                    <Button variant="outline" className="mt-4" onClick={() => setPage(1)}>
                      Back to first page
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
                  <table className="w-full">
                    <thead className="bg-neutral-50 dark:bg-dark-100 border-b border-neutral-200 dark:border-dark-200">
                      <tr>
                        <th className="px-4 py-3 w-8">
                          <input
                            type="checkbox"
                            aria-label="Select all on this page"
                            checked={allSelected}
                            disabled={selectableIds.length === 0}
                            onChange={toggleAll}
                            className="rounded-none accent-brand"
                          />
                        </th>
                        <SortHeader label="Name" field="name" sort={sort} onSort={handleSort} />
                        <th className={thClass}>Contact</th>
                        <SortHeader label="Location" field="location" sort={sort} onSort={handleSort} />
                        <SortHeader label="Source" field="source" sort={sort} onSort={handleSort} />
                        <SortHeader label="Status" field="status" sort={sort} onSort={handleSort} />
                        <th className={thClass}>Owner</th>
                        <SortHeader label="Last contact" field="last_contact_date" sort={sort} onSort={handleSort} />
                        <th className={`${thClass} text-right`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-dark-150 divide-y divide-neutral-200 dark:divide-dark-200">
                      {rows.map((p) => (
                        <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-dark-100">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              aria-label={`Select ${fullName(p)}`}
                              checked={selected.has(p.id)}
                              disabled={p.status === "promoted"}
                              onChange={() => toggleOne(p.id)}
                              className="rounded-none accent-brand"
                            />
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setDetailId(p.id)}
                              className="text-sm font-medium text-neutral-900 dark:text-white hover:text-brand text-left"
                            >
                              {fullName(p)}
                              {p.needs_follow_up && (
                                <span className="ml-2 px-1.5 py-0.5 rounded-none text-[10px] font-medium bg-brand/10 text-brand">
                                  Follow up
                                </span>
                              )}
                            </button>
                            <div className="text-sm text-neutral-500 dark:text-neutral-400 max-w-[18rem] truncate">
                              {[p.job_title, p.current_org].filter(Boolean).join(" · ")}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              {p.phone && <span>{p.phone}</span>}
                              {p.email && (
                                <a href={`mailto:${p.email}`} title={p.email} className="text-neutral-500 hover:text-brand">
                                  <Mail className="h-4 w-4" />
                                </a>
                              )}
                              {p.linkedin_url && (
                                <a
                                  href={p.linkedin_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="LinkedIn profile"
                                  className="text-neutral-500 hover:text-brand"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                              {!p.phone && !p.email && !p.linkedin_url && (
                                <span className="text-neutral-400">None</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-white max-w-[12rem] truncate">
                            {p.location}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                            {sourceLabel(p.source)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 rounded-none text-xs font-medium ${getStatusColor(p.status)}`}>
                              {statusLabel(p.status)}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-neutral-900 dark:text-white">
                            {p.owner_name ?? <span className="text-neutral-400">Unassigned</span>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                            {formatDate(p.last_contact_date)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => setDetailId(p.id)} title="View">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {p.status === "promoted" && p.candidate_id ? (
                                <Link
                                  to={`/hr/recruiting/candidate-tracking?candidateId=${p.candidate_id}`}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-sm text-brand hover:underline"
                                >
                                  Candidate <ArrowRight className="h-4 w-4" />
                                </Link>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  title="Edit"
                                  onClick={() => {
                                    setEditing(p);
                                    setFormOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-dark-200 text-sm text-neutral-600 dark:text-neutral-400">
                  <span>
                    Showing {firstShown}-{lastShown} of {total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => p - 1)}
                      leftIcon={<ChevronLeft className="h-4 w-4" />}
                    >
                      Prev
                    </Button>
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((p) => p + 1)}
                      rightIcon={<ChevronRight className="h-4 w-4" />}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {formOpen && (
        <ProspectFormDialog
          prospect={editing}
          members={members}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            refresh();
          }}
        />
      )}

      {importOpen && (
        <TalentPoolImportDialog members={members} onClose={() => setImportOpen(false)} onImported={load} />
      )}

      {detailId && (
        <ProspectDetailDialog
          prospectId={detailId}
          refreshKey={detailRefreshKey}
          promotionEnabled={access.promotion_enabled}
          onClose={() => setDetailId(null)}
          onChanged={load}
          onEdit={(p) => {
            setEditing(p);
            setFormOpen(true);
          }}
          onPromote={(p) => setPromoteFor(p)}
          onDelete={(p) => setDeleteFor(p)}
        />
      )}

      {promoteFor && (
        <PromoteDialog prospect={promoteFor} onClose={() => setPromoteFor(null)} onPromoted={onPromoted} />
      )}

      <Dialog open={!!deleteFor} onOpenChange={(open) => !open && setDeleteFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete prospect?</DialogTitle>
            <DialogDescription>
              {deleteFor ? fullName(deleteFor) : ""} and their whole activity log will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SortHeader: React.FC<{
  label: string;
  field: ProspectSort;
  sort: ProspectSort;
  onSort: (field: ProspectSort) => void;
}> = ({ label, field, sort, onSort }) => (
  <th className={thClass}>
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200 uppercase ${sort === field ? "text-neutral-800 dark:text-neutral-100" : ""}`}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  </th>
);

// ---------------------------------------------------------------------------
// Add / edit
// ---------------------------------------------------------------------------
const ProspectFormDialog: React.FC<{
  prospect: Prospect | null;
  members: TalentPoolMember[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ prospect, members, onClose, onSaved }) => {
  const [form, setForm] = useState<ProspectInput>(() =>
    prospect
      ? {
          first_name: prospect.first_name,
          last_name: prospect.last_name ?? "",
          email: prospect.email ?? "",
          phone: prospect.phone ?? "",
          linkedin_url: prospect.linkedin_url ?? "",
          job_title: prospect.job_title ?? "",
          current_org: prospect.current_org ?? "",
          location: prospect.location ?? "",
          source: prospect.source,
          status: prospect.status === "promoted" ? "new" : prospect.status,
          availability: prospect.availability ?? "",
          needs_follow_up: prospect.needs_follow_up,
          owner_id: prospect.owner_id,
        }
      : emptyForm(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = (field: keyof ProspectInput, value: any) => setForm((f) => ({ ...f, [field]: value }));
  const text = (field: keyof ProspectInput) => ({
    name: field,
    value: (form[field] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(field, e.target.value),
    error: errors[field],
  });

  const handleSave = async () => {
    const next: Record<string, string> = {};
    if (!form.first_name?.trim()) next.first_name = "First name is required";
    if (form.email?.trim() && !normalizeEmail(form.email)) next.email = "Enter a valid email";
    if (form.linkedin_url?.trim() && !normalizeLinkedin(form.linkedin_url))
      next.linkedin_url = "Use a profile link like linkedin.com/in/name";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      if (prospect) {
        await prospectsService.update(prospect.id, form, prospect.updated_at);
        toast({ title: "Prospect updated", variant: "success" });
      } else {
        await prospectsService.create(form);
        toast({ title: "Prospect added", variant: "success" });
      }
      onSaved();
    } catch (error) {
      toast({ title: "Could not save", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prospect ? "Edit Prospect" : "Add Prospect"}</DialogTitle>
          <DialogDescription>
            {prospect ? "Update prospect information" : "Enter what you know; only a first name is required"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="First Name *" {...text("first_name")} required />
            <Input label="Last Name" {...text("last_name")} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Email" type="email" {...text("email")} />
            <Input label="Phone" type="tel" {...text("phone")} />
          </div>
          <Input label="LinkedIn URL" {...text("linkedin_url")} placeholder="https://www.linkedin.com/in/..." />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Current Title" {...text("job_title")} />
            <Input label="Current Company" {...text("current_org")} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Location" {...text("location")} placeholder="City, State or Country" />
            <Input label="Availability" {...text("availability")} placeholder="e.g. 2 wk on 1 wk off" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Source</label>
              <select
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
                className={`${selectClass} w-full`}
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className={`${selectClass} w-full`}
              >
                {EDITABLE_STATUSES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Owner</label>
              <select
                value={form.owner_id ?? ""}
                onChange={(e) => set("owner_id", e.target.value || null)}
                className={`${selectClass} w-full`}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={!!form.needs_follow_up}
              onChange={(e) => set("needs_follow_up", e.target.checked)}
              className="rounded-none accent-brand"
            />
            Needs follow-up
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-brand hover:bg-brand/90 text-white">
            {saving ? "Saving..." : prospect ? "Save Changes" : "Add Prospect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Detail + activity
// ---------------------------------------------------------------------------
const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  note: <StickyNote className="h-4 w-4" />,
  call: <Phone className="h-4 w-4" />,
  text: <MessageSquare className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  status_change: <ArrowRight className="h-4 w-4" />,
  promoted: <UserPlus className="h-4 w-4" />,
};

const ACTIVITY_LABELS: Record<string, string> = {
  note: "Note",
  call: "Call",
  text: "Text",
  email: "Email",
  status_change: "Status changed",
  promoted: "Promoted",
};

const statusChangeText = (body: string | null) =>
  (body ?? "")
    .split(" → ")
    .map((s) => statusLabel(s as ProspectStatus))
    .join(" → ");

const ProspectDetailDialog: React.FC<{
  prospectId: string;
  refreshKey: number;
  promotionEnabled: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (p: Prospect) => void;
  onPromote: (p: Prospect) => void;
  onDelete: (p: Prospect) => void;
}> = ({ prospectId, refreshKey, promotionEnabled, onClose, onChanged, onEdit, onPromote, onDelete }) => {
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [activity, setActivity] = useState<ProspectActivity[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [composerType, setComposerType] = useState<"note" | "call" | "text" | "email">("note");
  const [composerBody, setComposerBody] = useState("");
  const [composerWhen, setComposerWhen] = useState(() => toLocalInput(new Date()));
  const [posting, setPosting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        prospectsService.getById(prospectId),
        prospectsService.getActivity(prospectId, { page: activityPage, pageSize: 25 }),
      ]);
      setProspect(p);
      setActivity(a.rows);
      setActivityTotal(a.total);
    } catch (error) {
      toast({ title: "Could not load prospect", description: errorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [prospectId, activityPage]);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshKey]);

  const readOnly = prospect?.status === "promoted";

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied`, variant: "success", duration: 2000 });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const postActivity = async () => {
    if (!prospect) return;
    if (composerType === "note" && !composerBody.trim()) return;
    setPosting(true);
    try {
      await prospectsService.addActivity(prospect.id, {
        type: composerType,
        body: composerBody,
        occurred_at: composerType === "note" ? null : new Date(composerWhen).toISOString(),
      });
      setComposerBody("");
      setComposerWhen(toLocalInput(new Date()));
      setActivityPage(1);
      await loadAll();
      onChanged();
    } catch (error) {
      toast({ title: "Could not add activity", description: errorMessage(error), variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const activityPages = Math.max(1, Math.ceil(activityTotal / 25));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{prospect ? fullName(prospect) : "Prospect"}</DialogTitle>
          <DialogDescription>
            {prospect ? [prospect.job_title, prospect.current_org].filter(Boolean).join(" · ") || "Prospect" : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && !prospect ? (
          <div className="text-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ) : !prospect ? (
          <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            This prospect is no longer available.
          </p>
        ) : (
          <div className="space-y-6 py-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`px-2 py-1 rounded-none text-xs font-medium ${getStatusColor(prospect.status)}`}>
                {statusLabel(prospect.status)}
              </span>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                Owner: {prospect.owner_name ?? "Unassigned"}
              </span>
              {prospect.needs_follow_up && (
                <span className="px-2 py-1 rounded-none text-xs font-medium bg-brand/10 text-brand">Needs follow-up</span>
              )}
              {prospect.has_import_refs && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">Imported from spreadsheet</span>
              )}
            </div>

            {readOnly && prospect.candidate_id && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 text-sm">
                <span>
                  In the hiring pipeline since {formatDate(prospect.promoted_at)}. Candidate Tracking is now the source of truth; this record is read-only.
                </span>
                <Link
                  to={`/hr/recruiting/candidate-tracking?candidateId=${prospect.candidate_id}`}
                  className="inline-flex items-center gap-1 font-medium hover:underline"
                >
                  Open candidate <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <DetailRow label="Email">
                {prospect.email ? (
                  <span className="flex items-center gap-2">
                    <a href={`mailto:${prospect.email}`} className="text-brand hover:underline break-all">
                      {prospect.email}
                    </a>
                    <IconButton title="Copy email" onClick={() => copy(prospect.email!, "Email")}>
                      <Copy className="h-4 w-4" />
                    </IconButton>
                  </span>
                ) : null}
              </DetailRow>
              <DetailRow label="Phone">
                {prospect.phone ? (
                  <span className="flex items-center gap-2">
                    <a href={`tel:${prospect.phone}`} className="hover:underline">
                      {prospect.phone}
                    </a>
                    <IconButton title="Copy phone" onClick={() => copy(prospect.phone!, "Phone")}>
                      <Copy className="h-4 w-4" />
                    </IconButton>
                  </span>
                ) : null}
              </DetailRow>
              <DetailRow label="LinkedIn">
                {prospect.linkedin_url ? (
                  <a
                    href={prospect.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand hover:underline break-all"
                  >
                    Open profile <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </DetailRow>
              <DetailRow label="Location">{prospect.location}</DetailRow>
              <DetailRow label="Source">{sourceLabel(prospect.source)}</DetailRow>
              <DetailRow label="Availability">{prospect.availability}</DetailRow>
              <DetailRow label="Last contact">{formatDateTime(prospect.last_contact_date)}</DetailRow>
              <DetailRow label="Added">{formatDate(prospect.created_at)}</DetailRow>
            </div>

            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-brand hover:bg-brand/90 text-white"
                  disabled={!promotionEnabled}
                  onClick={() => onPromote(prospect)}
                  leftIcon={<UserPlus className="h-4 w-4" />}
                  title={promotionEnabled ? undefined : "Disabled until candidate records are access-protected"}
                >
                  Promote to Candidate
                </Button>
                <Button variant="outline" onClick={() => onEdit(prospect)} leftIcon={<Edit className="h-4 w-4" />}>
                  Edit
                </Button>
                <Button variant="outline" onClick={() => onDelete(prospect)} leftIcon={<Trash2 className="h-4 w-4" />}>
                  Delete
                </Button>
                {!promotionEnabled && (
                  <p className="w-full text-xs text-neutral-500 dark:text-neutral-400">
                    Promotion is turned off until candidate records are protected from public and all-staff access.
                  </p>
                )}
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">Activity</h3>

              {!readOnly && (
                <div className="border border-neutral-200 dark:border-dark-200 p-3 space-y-3 mb-4">
                  <div className="flex flex-wrap gap-2">
                    {(["note", "call", "text", "email"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setComposerType(t)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-none border ${
                          composerType === t
                            ? "border-brand bg-brand/10 text-brand"
                            : "border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-dark-100"
                        }`}
                      >
                        {ACTIVITY_ICONS[t]}
                        {t === "note" ? "Add note" : `Log ${t}`}
                      </button>
                    ))}
                  </div>
                  {composerType !== "note" && (
                    <div className="max-w-xs">
                      <label className={labelClass}>When</label>
                      <input
                        type="datetime-local"
                        value={composerWhen}
                        max={toLocalInput(new Date())}
                        onChange={(e) => setComposerWhen(e.target.value)}
                        className={`${selectClass} w-full`}
                      />
                    </div>
                  )}
                  <Textarea
                    value={composerBody}
                    onChange={(e) => setComposerBody(e.target.value)}
                    placeholder={composerType === "note" ? "Write a note..." : "Optional details"}
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="bg-brand hover:bg-brand/90 text-white"
                      disabled={posting || (composerType === "note" ? !composerBody.trim() : !composerWhen)}
                      onClick={postActivity}
                    >
                      {posting ? "Saving..." : composerType === "note" ? "Add note" : `Log ${composerType}`}
                    </Button>
                  </div>
                </div>
              )}

              {activity.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No activity yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-dark-200 border border-neutral-200 dark:border-dark-200">
                  {activity.map((a) => (
                    <li key={a.id} className="flex gap-3 p-3">
                      <div className="mt-0.5 text-neutral-500 dark:text-neutral-400">{ACTIVITY_ICONS[a.type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-neutral-500 dark:text-neutral-400">
                          <span className="font-medium text-neutral-800 dark:text-neutral-200">
                            {ACTIVITY_LABELS[a.type]}
                          </span>
                          <span>
                            {a.original_author
                              ? `${a.original_author} (imported by ${a.created_by_name ?? "unknown"})`
                              : a.created_by_name ?? "Unknown user"}
                          </span>
                          <span>
                            {a.occurred_at
                              ? formatDateTime(a.occurred_at)
                              : a.imported
                                ? "Date unknown"
                                : formatDateTime(a.created_at)}
                          </span>
                        </div>
                        {a.body && (
                          <p className="mt-1 text-sm text-neutral-900 dark:text-white whitespace-pre-wrap break-words">
                            {a.type === "status_change" ? statusChangeText(a.body) : a.body}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {activityPages > 1 && (
                <div className="flex items-center justify-end gap-2 mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  <Button variant="outline" size="sm" disabled={activityPage <= 1} onClick={() => setActivityPage((p) => p - 1)}>
                    Newer
                  </Button>
                  <span>
                    {activityPage} / {activityPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={activityPage >= activityPages}
                    onClick={() => setActivityPage((p) => p + 1)}
                  >
                    Older
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{label}</div>
    <div className="mt-1 text-neutral-900 dark:text-white">
      {children || <span className="text-neutral-400">None</span>}
    </div>
  </div>
);

const IconButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({
  title,
  onClick,
  children,
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="text-neutral-500 hover:text-brand"
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// Promote to Candidate
// ---------------------------------------------------------------------------
const CANDIDATE_SOURCE_LABELS: Record<ProspectSource, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  referral: "Referral",
  other: "Other",
};

const PromoteDialog: React.FC<{
  prospect: Prospect;
  onClose: () => void;
  onPromoted: (candidateId: string, alreadyPromoted: boolean) => void;
}> = ({ prospect, onClose, onPromoted }) => {
  const [form, setForm] = useState({
    first_name: prospect.first_name,
    last_name: prospect.last_name ?? "",
    email: prospect.email ?? "",
    phone: prospect.phone ?? "",
    position_applied: "",
    requisition_id: "",
    source: CANDIDATE_SOURCE_LABELS[prospect.source],
    summary: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [requisitions, setRequisitions] = useState<JobRequisition[]>([]);
  const [matches, setMatches] = useState<CandidateMatch[] | null>(null);
  const [checkedEmail, setCheckedEmail] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(""); // candidate id, or "new"
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    jobRequisitionsService
      .getAll()
      .then((data) => setRequisitions((data || []).filter((r) => r.status === "approved" || r.status === "posted")))
      .catch(() => setRequisitions([]));
  }, []);

  const set = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === "email" || field === "first_name" || field === "last_name") {
      setMatches(null);
      setChoice("");
    }
  };

  const identityKey = `${form.email.trim().toLowerCase()}|${form.first_name.trim().toLowerCase()}|${form.last_name.trim().toLowerCase()}`;
  const linkingExisting = !!choice && choice !== "new";

  const validate = () => {
    const next: Record<string, string> = {};
    if (!linkingExisting) {
      if (!form.first_name.trim()) next.first_name = "Required";
      if (!form.last_name.trim()) next.last_name = "Required; do not use a placeholder";
      if (!normalizeEmail(form.email)) next.email = "A real email is required";
      if (!form.position_applied.trim()) next.position_applied = "Required";
      if (!form.source.trim()) next.source = "Required";
      if (form.first_name.length > 100) next.first_name = "100 characters max";
      if (form.last_name.length > 100) next.last_name = "100 characters max";
      if (form.position_applied.length > 255) next.position_applied = "255 characters max";
      if (form.source.length > 100) next.source = "100 characters max";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const checkMatches = async () => {
    if (!form.email.trim() && !(form.first_name.trim() && form.last_name.trim())) {
      setErrors({ email: "Enter an email or full name to search" });
      return;
    }
    setChecking(true);
    try {
      const found = await prospectsService.findCandidateMatches(form);
      setMatches(found);
      setCheckedEmail(identityKey);
      setChoice(found.length === 0 ? "new" : "");
    } catch (error) {
      toast({ title: "Could not search Candidate Tracking", description: errorMessage(error), variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    if (!matches || checkedEmail !== identityKey || !choice) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await prospectsService.promoteToCandidate(prospect.id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        position_applied: form.position_applied.trim(),
        source: form.source.trim(),
        requisition_id: form.requisition_id || null,
        summary: form.summary.trim() || null,
        existing_candidate_id: linkingExisting ? choice : null,
        acknowledged_candidate_ids: matches.map((m) => m.id),
      });
      if (result.kind === "conflicts") {
        const known = new Set(matches.map((m) => m.id));
        setMatches([...matches, ...result.conflicts.filter((c) => !known.has(c.id))]);
        setChoice("");
        toast({
          title: "New matching application found",
          description: "Review the matches again before continuing.",
          variant: "warning",
        });
        return;
      }
      onPromoted(result.candidateId, result.alreadyPromoted);
    } catch (error) {
      toast({ title: "Promotion not completed", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const matchesCurrent = matches !== null && checkedEmail === identityKey;

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Promote to Candidate</DialogTitle>
          <DialogDescription>
            Adds {fullName(prospect)} to Candidate Tracking at Screening. No login, onboarding, interview, or offer is created.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="First Name *" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} error={errors.first_name} />
            <Input label="Last Name *" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} error={errors.last_name} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Email *" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
            <Input
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              hint={form.phone.trim().length > 20 ? "Longer than Candidate Tracking allows; it will be left off" : undefined}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Open Requisition</label>
              <select
                value={form.requisition_id}
                onChange={(e) => {
                  const req = requisitions.find((r) => r.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    requisition_id: e.target.value,
                    position_applied: req ? req.title : f.position_applied,
                  }));
                }}
                className={`${selectClass} w-full`}
              >
                <option value="">None</option>
                {requisitions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Position *"
              value={form.position_applied}
              onChange={(e) => set("position_applied", e.target.value)}
              error={errors.position_applied}
            />
          </div>
          <Input label="Source *" value={form.source} onChange={(e) => set("source", e.target.value)} error={errors.source} />
          <Textarea
            label="Summary for the candidate record (optional)"
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            rows={3}
            hint="The Talent Pool activity log is not copied. Only this summary goes to the candidate's notes."
          />

          <div className="border border-neutral-200 dark:border-dark-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">Existing applications</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Required before promoting. Matches by email or full name.
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={checkMatches} disabled={checking}>
                {checking ? "Checking..." : matchesCurrent ? "Check again" : "Check Candidate Tracking"}
              </Button>
            </div>

            {matchesCurrent && matches!.length === 0 && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">No existing applications found.</p>
            )}

            {matchesCurrent && matches!.length > 0 && (
              <div className="space-y-2">
                {matches!.map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-start gap-3 p-2 border rounded-none cursor-pointer ${
                      choice === m.id ? "border-brand bg-brand/5" : "border-neutral-200 dark:border-dark-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="promote-choice"
                      checked={choice === m.id}
                      onChange={() => setChoice(m.id)}
                      className="mt-1 accent-brand"
                    />
                    <div className="text-sm">
                      <div className="font-medium text-neutral-900 dark:text-white">
                        Link to: {m.first_name} {m.last_name}{" "}
                        <span className="text-xs font-normal text-neutral-500">(matched by {m.match})</span>
                      </div>
                      <div className="text-neutral-600 dark:text-neutral-400">
                        {m.position_applied} · {m.status.replace(/_/g, " ")} · {m.email}
                        {m.applied_date ? ` · applied ${formatDate(m.applied_date)}` : ""}
                      </div>
                    </div>
                  </label>
                ))}
                <label
                  className={`flex items-start gap-3 p-2 border rounded-none cursor-pointer ${
                    choice === "new" ? "border-brand bg-brand/5" : "border-neutral-200 dark:border-dark-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="promote-choice"
                    checked={choice === "new"}
                    onChange={() => setChoice("new")}
                    className="mt-1 accent-brand"
                  />
                  <div className="text-sm">
                    <div className="font-medium text-neutral-900 dark:text-white">Create a separate new application</div>
                    <div className="text-neutral-600 dark:text-neutral-400">
                      Choose this only if none of the above is this person applying for this role.
                    </div>
                  </div>
                </label>
                {linkingExisting && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Linking leaves that application's status, contact details, and notes unchanged.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !matchesCurrent || !choice}
            className="bg-brand hover:bg-brand/90 text-white"
            leftIcon={<UserPlus className="h-4 w-4" />}
          >
            {submitting ? "Promoting..." : linkingExisting ? "Link and Promote" : "Promote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
