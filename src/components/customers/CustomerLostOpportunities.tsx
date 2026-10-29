import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { lostReasonLabel } from "@/components/jobs/MarkLostModal";

interface LostOpportunity {
  id: string;
  quote_number: string | null;
  title: string | null;
  lost_reason_category: string | null;
  lost_reason: string | null;
  lost_at: string | null;
}

// Past losses for a customer, so the next bid knows what lost the last one.
// Renders nothing when the customer has no lost opportunities.
export default function CustomerLostOpportunities({
  customerId,
}: {
  customerId?: string;
}) {
  const [rows, setRows] = useState<LostOpportunity[]>([]);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .schema("business")
          .from("opportunities")
          .select(
            "id, quote_number, title, lost_reason_category, lost_reason, lost_at",
          )
          .eq("customer_id", customerId)
          .eq("status", "lost")
          .order("lost_at", { ascending: false, nullsFirst: false })
          .limit(20);
        if (error) throw error;
        if (!cancelled) setRows((data as LostOpportunity[]) || []);
      } catch (err) {
        console.error("Error loading lost opportunities:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (rows.length === 0) return null;

  return (
    <div className="bg-white dark:bg-dark-150 rounded-none border border-neutral-200 dark:border-neutral-700 shadow-sm">
      <div className="p-6 border-b border-neutral-200 dark:border-neutral-700">
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">
          Lost Opportunities
        </h2>
      </div>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
        {rows.map((r) => (
          <li key={r.id} className="px-6 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Link
                to={`/sales-dashboard/opportunities/${r.id}`}
                className="text-sm font-medium text-neutral-900 dark:text-white hover:text-brand"
              >
                {r.quote_number ? `${r.quote_number} · ` : ""}
                {r.title || "Untitled"}
              </Link>
              {r.lost_at && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {format(new Date(r.lost_at), "MMM d, yyyy")}
                </span>
              )}
            </div>
            {r.lost_reason_category ? (
              <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">
                <span className="font-semibold">
                  {lostReasonLabel(r.lost_reason_category)}:
                </span>{" "}
                {r.lost_reason}
              </p>
            ) : (
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                No reason recorded
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
