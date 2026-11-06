/**
 * Article email signups from the website, for article publishers.
 *
 * Readers sign up on ampqes.com article pages; the site adds them through
 * common.subscribe_article_reader(). Here publishers search the list, export it
 * to CSV, and mark people unsubscribed. The database decides who can see this.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Mail } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SortHeader, type SortDirection } from "@/components/ui/SortHeader";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { companyConfig } from "@/lib/companyConfig";
import {
  type ArticleSubscriber,
  listArticleSubscribers,
  setArticleSubscriberUnsubscribed,
} from "@/services/articleSubscribersService";

type SortField = "email" | "created" | "first" | "seen" | "returns";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Quote every cell, and stop spreadsheet apps from running a cell that starts like a formula.
function csvCell(value: string | number | null | undefined) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: ArticleSubscriber[]) {
  const header = ["Email", "Signed up", "First article", "Last article", "Last seen", "Return count", "Unsubscribed"];
  const lines = rows.map((r) =>
    [
      r.email,
      r.created_at.slice(0, 10),
      r.first_article_slug,
      r.last_article_slug,
      r.last_seen_at.slice(0, 10),
      r.return_count,
      r.unsubscribed_at ? r.unsubscribed_at.slice(0, 10) : "",
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `article-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ArticleSubscribers() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ArticleSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showUnsubscribed, setShowUnsubscribed] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listArticleSubscribers()
      .then((list) => !cancelled && setRows(list))
      .catch((e) => {
        console.error("Load article subscribers:", e);
        if (!cancelled) setError(e.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = rows.filter((r) => !r.unsubscribed_at).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (showUnsubscribed || !r.unsubscribed_at) &&
        (!q ||
          r.email.includes(q) ||
          (r.first_article_slug ?? "").toLowerCase().includes(q) ||
          (r.last_article_slug ?? "").toLowerCase().includes(q)),
    );
    const key = (r: ArticleSubscriber): string | number => {
      switch (sortField) {
        case "email":
          return r.email;
        case "first":
          return r.first_article_slug ?? "";
        case "seen":
          return r.last_seen_at;
        case "returns":
          return r.return_count;
        default:
          return r.created_at;
      }
    };
    return [...filtered].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      const c = typeof ka === "number" && typeof kb === "number" ? ka - kb : String(ka).localeCompare(String(kb));
      return sortDir === "asc" ? c : -c;
    });
  }, [rows, search, showUnsubscribed, sortField, sortDir]);

  const toggleUnsubscribed = async (r: ArticleSubscriber) => {
    const unsubscribing = !r.unsubscribed_at;
    if (unsubscribing) {
      const ok = await confirmDialog({
        title: "Mark as unsubscribed?",
        description: `${r.email} will be left out of exports. If they sign up again on the website, they're back on the list.`,
        confirmLabel: "Unsubscribe",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusyId(r.id);
    try {
      await setArticleSubscriberUnsubscribed(r.id, unsubscribing, user?.id);
      setRows((list) =>
        list.map((x) =>
          x.id === r.id ? { ...x, unsubscribed_at: unsubscribing ? new Date().toISOString() : null } : x,
        ),
      );
    } catch (e: any) {
      console.error("Update article subscriber:", e);
      toast({ title: "That didn't save", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const columns: [SortField, string][] = [
    ["email", "Email"],
    ["created", "Signed up"],
    ["first", "First article"],
    ["seen", "Last seen"],
    ["returns", "Returns"],
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Link
        to="/articles"
        className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Articles
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-brand" />
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Subscribers</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {loading
                ? "Loading..."
                : `${activeCount} signed up on ${companyConfig.websiteDomain} article pages${
                    rows.length > activeCount ? `, ${rows.length - activeCount} unsubscribed` : ""
                  }.`}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          leftIcon={<Download className="h-4 w-4" />}
          disabled={loading || visible.length === 0}
          onClick={() => downloadCsv(visible)}
        >
          Export CSV
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email or article"
          aria-label="Search subscribers"
          className="w-full max-w-sm rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand dark:border-neutral-600 dark:bg-dark-100 dark:text-white"
        />
        <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            className="rounded-none"
            checked={showUnsubscribed}
            onChange={(e) => setShowUnsubscribed(e.target.checked)}
          />
          Show unsubscribed (also includes them in the export)
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="rounded-none border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-none border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          {rows.length === 0 ? "No one has signed up yet." : "No subscribers match."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-none border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-dark-200 dark:text-neutral-400">
              <tr>
                {columns.map(([field, label]) => (
                  <th key={field} className="px-4 py-2 font-medium">
                    <SortHeader
                      label={label}
                      field={field}
                      sortField={sortField}
                      sortDirection={sortDir}
                      onSort={(f, d) => {
                        setSortField(f);
                        setSortDir(d);
                      }}
                    />
                  </th>
                ))}
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">{r.email}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-300">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{r.first_article_slug ?? ""}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-300">
                    {formatDate(r.last_seen_at)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600 dark:text-neutral-300">
                    {r.return_count || ""}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`whitespace-nowrap text-xs ${
                          r.unsubscribed_at
                            ? "text-neutral-500 dark:text-neutral-400"
                            : "text-green-700 dark:text-green-400"
                        }`}
                      >
                        {r.unsubscribed_at ? `Unsubscribed ${formatDate(r.unsubscribed_at)}` : "Subscribed"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={busyId === r.id}
                        onClick={() => toggleUnsubscribed(r)}
                      >
                        {r.unsubscribed_at ? "Undo" : "Unsubscribe"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
