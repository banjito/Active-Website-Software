import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui";
import { DollarSign, Calendar } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface WeeklyBidItem {
  id: string;
  title: string;
  expectedValue: number;
  created_at: string;
  excludeFromTotal: boolean;
  opportunity_type:
    | "large_acceptance"
    | "small_acceptance"
    | "maintenance"
    | "other"
    | "time_materials"
    | "engineering";
}

// Category totals breakdown
interface CategoryTotals {
  large_acceptance: number;
  small_acceptance: number;
  maintenance: number;
  other: number;
  time_materials: number;
  engineering: number;
}

interface BidsOverviewData {
  thisWeekBids: WeeklyBidItem[];
  lastWeekBids: WeeklyBidItem[];
}

interface WeekGroup {
  range: string;
  items: WeeklyBidItem[];
  totalValue: number;
}

const BidsOverview: React.FC = () => {
  const [data, setData] = useState<BidsOverviewData>({
    thisWeekBids: [],
    lastWeekBids: [],
  });
  const [thisWeekRange, setThisWeekRange] = useState<string>("");
  const [lastWeekRange, setLastWeekRange] = useState<string>("");
  const [showAllWeeks, setShowAllWeeks] = useState<boolean>(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [allWeeks, setAllWeeks] = useState<WeekGroup[]>([]);
  const [allTimeTotal, setAllTimeTotal] = useState<number>(0);
  const [historyPage, setHistoryPage] = useState<number>(0); // 0-based pages
  const weeksPerPage = 4;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBidsData = async () => {
      try {
        setLoading(true);

        // Calculate date ranges for this week and last week (Sunday to Saturday)
        const now = new Date();
        const startOfThisWeek = new Date(now);
        startOfThisWeek.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
        startOfThisWeek.setHours(0, 0, 0, 0);

        const startOfLastWeek = new Date(startOfThisWeek);
        startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

        const endOfLastWeek = new Date(startOfThisWeek);
        endOfLastWeek.setDate(startOfThisWeek.getDate() - 1); // Saturday (day before this week's Sunday)
        endOfLastWeek.setHours(23, 59, 59, 999);

        console.log("Current date:", now.toISOString());
        console.log("Week calculation (Sunday to Saturday):", {
          startOfThisWeek: startOfThisWeek.toISOString(),
          startOfLastWeek: startOfLastWeek.toISOString(),
          endOfLastWeek: endOfLastWeek.toISOString(),
        });

        // Fetch opportunities data from Supabase - include both legacy and new letter proposals
        // Use select('*') to avoid errors if opportunity_type column doesn't exist yet
        const { data: opportunities, error: opportunitiesError } =
          await supabase
            .schema("business")
            .from("opportunities")
            .select("*")
            .order("created_at", { ascending: false }); // Order by created_at for now, we'll sort later

        if (opportunitiesError) throw opportunitiesError;

        console.log("All opportunities fetched:", opportunities?.length);

        // Filter to only include opportunities that have letter proposals (check both new system and legacy)
        const relevantOpps = (opportunities || []).filter((o) => {
          // For date filtering, use letter_proposal_date if available, otherwise use created_at for legacy data
          const dateToUse = o.letter_proposal_date
            ? o.letter_proposal_date
            : o.created_at;
          const d = new Date(dateToUse);
          return d >= startOfLastWeek; // anything from last week up through now
        });
        console.log(
          "Relevant opps (last week through this week):",
          relevantOpps.length,
        );

        // Load letter proposals for NET 30 price extraction (fallback to quoted_amount)
        let opportunitiesWithLetterProposals = relevantOpps || [];
        try {
          const ids = (relevantOpps || []).map((o) => o.id);
          if (ids.length) {
            const { data: letters } = await supabase
              .schema("business")
              .from("letter_proposals")
              .select("id, opportunity_id, html, created_at")
              .in("opportunity_id", ids)
              .order("created_at", { ascending: false });

            const byOpp: Record<string, any[]> = {};
            (letters || []).forEach((lp: any) => {
              if (!byOpp[lp.opportunity_id]) byOpp[lp.opportunity_id] = [];
              byOpp[lp.opportunity_id].push(lp);
            });
            // Ensure newest-first per opportunity
            Object.keys(byOpp).forEach((k) => {
              byOpp[k].sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime(),
              );
            });

            opportunitiesWithLetterProposals = (relevantOpps || []).map(
              (o: any) => ({
                ...o,
                letter_proposals: byOpp[o.id] || [],
              }),
            );
          }
        } catch (e) {
          console.warn(
            "Letter proposals load failed (continuing with quoted_amount):",
            e,
          );
        }

        // Filter to only include opportunities that have letter proposals (either new system with date or legacy with actual letter proposals)
        opportunitiesWithLetterProposals =
          opportunitiesWithLetterProposals.filter((o: any) => {
            return (
              o.letter_proposal_date ||
              (o.letter_proposals && o.letter_proposals.length > 0)
            );
          });

        const getNet30Price = (o: any): number => {
          // Prefer explicitly saved quoted_amount so manual edits are honored
          const parsedQuoted =
            typeof o.quoted_amount === "number"
              ? isFinite(o.quoted_amount)
                ? o.quoted_amount
                : 0
              : Number(
                  String(o.quoted_amount ?? "").replace(/[^0-9.-]/g, ""),
                ) || 0;
          if (parsedQuoted > 0) return parsedQuoted;

          // Fallback: extract NET 30 from the latest letter proposal
          const letters = (o as any).letter_proposals as any[] | undefined;
          if (!letters || !letters.length) return 0;
          const latest = letters[0];
          if (!latest?.html) return 0;
          const m = latest.html.match(
            /Option\s*1:\s*Where\s*NET\s*30\s*Terms\s*are\s*applicable[^$]*\$([0-9,]+(?:\.[0-9]{2})?)/i,
          );
          if (m && m[1]) return Number(m[1].replace(/,/g, "")) || 0;
          return 0;
        };

        // Save human-readable ranges for display
        const formatRange = (s: Date, e: Date) =>
          `${s.toLocaleDateString()} - ${e.toLocaleDateString()}`;
        setThisWeekRange(
          formatRange(
            startOfThisWeek,
            new Date(
              startOfThisWeek.getFullYear(),
              startOfThisWeek.getMonth(),
              startOfThisWeek.getDate() + 6,
            ),
          ),
        );
        setLastWeekRange(
          formatRange(startOfLastWeek, new Date(startOfThisWeek.getTime() - 1)),
        );

        // Helper to infer opportunity type from quoted amount if not set
        const inferOpportunityType = (
          o: any,
          amount: number,
        ):
          | "large_acceptance"
          | "small_acceptance"
          | "maintenance"
          | "other" => {
          const existingType = (o as any).opportunity_type;
          if (existingType) return existingType;
          // Infer from quoted amount: >= $100k = Large, < $100k = Small
          if (amount > 0) {
            return amount >= 100000 ? "large_acceptance" : "small_acceptance";
          }
          return "other";
        };

        // Compute weekly buckets using NET 30 from letter proposals when available,
        // otherwise fall back to quoted_amount - grouped by letter proposal creation date (or created_at for legacy)
        const thisWeekBids = (opportunitiesWithLetterProposals || [])
          .filter((o) => {
            const dateToUse = o.letter_proposal_date || o.created_at;
            return new Date(dateToUse) >= startOfThisWeek;
          })
          .map((o) => {
            const value = getNet30Price(o);
            return {
              id: String(o.id),
              title: o.title ?? "Untitled Opportunity",
              expectedValue: value,
              created_at: o.letter_proposal_date || o.created_at,
              excludeFromTotal: !!o.exclude_from_quoted_total,
              opportunity_type: inferOpportunityType(o, value),
            };
          });

        const lastWeekBids = (opportunitiesWithLetterProposals || [])
          .filter((o) => {
            const dateToUse = o.letter_proposal_date || o.created_at;
            const d = new Date(dateToUse);
            return d >= startOfLastWeek && d <= endOfLastWeek;
          })
          .map((o) => {
            const value = getNet30Price(o);
            return {
              id: String(o.id),
              title: o.title ?? "Untitled Opportunity",
              expectedValue: value,
              created_at: o.letter_proposal_date || o.created_at,
              excludeFromTotal: !!o.exclude_from_quoted_total,
              opportunity_type: inferOpportunityType(o, value),
            };
          });

        console.log(
          "This week bids:",
          thisWeekBids.length,
          "Total value:",
          thisWeekBids.reduce((s, b) => s + b.expectedValue, 0),
        );
        console.log(
          "Last week bids:",
          lastWeekBids.length,
          "Total value:",
          lastWeekBids.reduce((s, b) => s + b.expectedValue, 0),
        );

        setData({ thisWeekBids, lastWeekBids });
      } catch (err) {
        console.error("Error fetching bids data:", err);
        setError("Failed to load bids data");
      } finally {
        setLoading(false);
      }
    };

    fetchBidsData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "awarded":
      case "decision - forecasted win":
        return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400";
      case "lost":
      case "decision - forecast lose":
      case "no quote":
        return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400";
      case "quote":
      case "decision":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400";
      default:
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-900/50 dark:text-white";
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Sum of bid values, excluding any flagged as excluded from the quoted total
  const sumValue = (bids: WeeklyBidItem[]): number =>
    bids.reduce(
      (sum, bid) => sum + (bid.excludeFromTotal ? 0 : bid.expectedValue),
      0,
    );

  // Persist + optimistically toggle whether a bid counts toward quoted totals
  const toggleExclude = async (id: string, exclude: boolean) => {
    setData((prev) => ({
      thisWeekBids: prev.thisWeekBids.map((b) =>
        b.id === id ? { ...b, excludeFromTotal: exclude } : b,
      ),
      lastWeekBids: prev.lastWeekBids.map((b) =>
        b.id === id ? { ...b, excludeFromTotal: exclude } : b,
      ),
    }));
    setAllWeeks((prev) =>
      prev.map((g) => {
        const items = g.items.map((b) =>
          b.id === id ? { ...b, excludeFromTotal: exclude } : b,
        );
        return { ...g, items, totalValue: sumValue(items) };
      }),
    );

    const { error: updateError } = await supabase
      .schema("business")
      .from("opportunities")
      .update({ exclude_from_quoted_total: exclude })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to update exclude_from_quoted_total:", updateError);
      // Revert optimistic change on failure
      setData((prev) => ({
        thisWeekBids: prev.thisWeekBids.map((b) =>
          b.id === id ? { ...b, excludeFromTotal: !exclude } : b,
        ),
        lastWeekBids: prev.lastWeekBids.map((b) =>
          b.id === id ? { ...b, excludeFromTotal: !exclude } : b,
        ),
      }));
      setAllWeeks((prev) =>
        prev.map((g) => {
          const items = g.items.map((b) =>
            b.id === id ? { ...b, excludeFromTotal: !exclude } : b,
          );
          return { ...g, items, totalValue: sumValue(items) };
        }),
      );
    }
  };

  // Calculate category totals from bid items (excludes flagged bids)
  const getCategoryTotals = (bids: WeeklyBidItem[]): CategoryTotals => {
    return bids.reduce(
      (acc, bid) => {
        if (bid.excludeFromTotal) return acc;
        const type = bid.opportunity_type || "other";
        acc[type] = (acc[type] || 0) + bid.expectedValue;
        return acc;
      },
      {
        large_acceptance: 0,
        small_acceptance: 0,
        maintenance: 0,
        other: 0,
        time_materials: 0,
        engineering: 0,
      } as CategoryTotals,
    );
  };

  // Format opportunity type for display
  const formatOpportunityType = (type: string): string => {
    switch (type) {
      case "large_acceptance":
        return "Large Acceptance";
      case "small_acceptance":
        return "Small Acceptance";
      case "maintenance":
        return "Maintenance";
      case "engineering":
        return "Engineering";
      case "time_materials":
        return "Time & Materials (T&M)";
      case "other":
        return "Other";
      default:
        return "Other";
    }
  };

  // Get badge color for opportunity type
  const getTypeColor = (type: string): string => {
    switch (type) {
      case "large_acceptance":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-400";
      case "small_acceptance":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400";
      case "maintenance":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400";
      case "engineering":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-400";
      case "time_materials":
        return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400";
      case "other":
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400";
      default:
        return "bg-neutral-100 text-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400";
    }
  };

  const loadAllWeeks = async () => {
    try {
      setHistoryLoading(true);
      // Get all opportunities ever (paginate to bypass default 1000 limit)
      const pageSize = 1000;
      let from = 0;
      let allOpps: any[] = [];
      /* eslint-disable no-constant-condition */
      while (true) {
        // Use select('*') to avoid errors if opportunity_type column doesn't exist yet
        const { data: page, error: pageErr } = await supabase
          .schema("business")
          .from("opportunities")
          .select("*")
          .order("created_at", { ascending: false }) // Order by created_at, we'll filter for letter proposals later
          .range(from, from + pageSize - 1);
        if (pageErr) throw pageErr;
        const batch = page || [];
        allOpps = allOpps.concat(batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      const opps = allOpps;

      // Fetch all letter proposals and map by opportunity_id
      let withLetters = opps || [];
      try {
        const ids = (opps || []).map((o) => o.id);
        // Avoid overly long URLs by keeping the IN list small
        const chunkSize = 100;
        const byOpp: Record<string, any[]> = {};
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);
          const { data: letters } = await supabase
            .schema("business")
            .from("letter_proposals")
            .select("id, opportunity_id, html, created_at")
            .in("opportunity_id", chunk)
            .order("created_at", { ascending: false });
          (letters || []).forEach((lp: any) => {
            if (!byOpp[lp.opportunity_id]) byOpp[lp.opportunity_id] = [];
            byOpp[lp.opportunity_id].push(lp);
          });
        }
        // Ensure newest-first per opportunity across chunks
        Object.keys(byOpp).forEach((k) => {
          byOpp[k].sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          );
        });
        withLetters = (opps || []).map((o: any) => ({
          ...o,
          letter_proposals: byOpp[o.id] || [],
        }));

        // Filter to only include opportunities that have letter proposals (either new system with date or legacy with actual letter proposals)
        withLetters = withLetters.filter((o: any) => {
          return (
            o.letter_proposal_date ||
            (o.letter_proposals && o.letter_proposals.length > 0)
          );
        });
      } catch (_e) {
        // best-effort; continue with quoted_amount fallback
      }

      const parseNum = (v: any): number => {
        if (v === null || v === undefined) return 0;
        if (typeof v === "number") return isFinite(v) ? v : 0;
        const n = Number(String(v).replace(/[^0-9.-]/g, ""));
        return isFinite(n) ? n : 0;
      };

      const getNet30 = (o: any): number => {
        // Prefer explicitly saved quoted_amount so manual edits are honored
        const parsedQuoted = parseNum(o.quoted_amount);
        if (parsedQuoted > 0) return parsedQuoted;

        // Fallback: extract NET 30 from the latest letter proposal
        const letters = (o as any).letter_proposals as any[] | undefined;
        if (!letters || !letters.length) return 0;
        const latest = letters[0];
        const m = latest?.html?.match(
          /Option\s*1:\s*Where\s*NET\s*30\s*Terms\s*are\s*applicable[^$]*\$([0-9,]+(?:\.[0-9]{2})?)/i,
        );
        if (m && m[1]) return Number(m[1].replace(/,/g, "")) || 0;
        return 0;
      };

      const weekKey = (d: Date) => {
        const start = new Date(d);
        start.setDate(d.getDate() - d.getDay());
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return {
          key: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
          start,
          end,
        };
      };

      // Helper to infer opportunity type from quoted amount if not set
      const inferType = (
        o: any,
        amount: number,
      ): "large_acceptance" | "small_acceptance" | "maintenance" | "other" => {
        if (o.opportunity_type) return o.opportunity_type;
        // Infer from quoted amount: >= $100k = Large, < $100k = Small
        if (amount > 0) {
          return amount >= 100000 ? "large_acceptance" : "small_acceptance";
        }
        return "other";
      };

      const map: Record<string, WeekGroup> = {};
      (withLetters || []).forEach((o: any) => {
        // Use letter_proposal_date if available, otherwise fall back to created_at for legacy data
        const dateToUse = o.letter_proposal_date || o.created_at;
        const d = new Date(dateToUse);
        const { key } = weekKey(d);
        const value = getNet30(o);
        const item: WeeklyBidItem = {
          id: String(o.id),
          title: o.title ?? "Untitled Opportunity",
          expectedValue: value,
          created_at: dateToUse, // Store the date used for grouping as the reference date
          excludeFromTotal: !!o.exclude_from_quoted_total,
          opportunity_type: inferType(o, value),
        };
        if (!map[key]) map[key] = { range: key, items: [], totalValue: 0 };
        map[key].items.push(item);
        if (!item.excludeFromTotal) map[key].totalValue += item.expectedValue;
      });

      const groups = Object.values(map).sort((a, b) => {
        const aStart = new Date(a.range.split(" - ")[0]).getTime();
        const bStart = new Date(b.range.split(" - ")[0]).getTime();
        return bStart - aStart; // newest first
      });

      // Recompute to exclude truly zero-value weeks from paging perception if desired
      setAllWeeks(groups);
      const allTotal = groups.reduce((sum, g) => sum + g.totalValue, 0);
      setAllTimeTotal(allTotal);
      setHistoryPage(0);
      setShowAllWeeks(true);
    } catch (e) {
      console.error("Failed to load history:", e);
      setError("Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
            Bids Overview
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card
              key={i}
              className="border border-neutral-200 dark:border-neutral-700 dark:bg-dark-150"
            >
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-neutral-200 dark:bg-dark-150 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-neutral-200 dark:bg-dark-150 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
            Bids Overview
          </h2>
        </div>
        <Card className="border border-neutral-200 dark:border-neutral-700 dark:bg-dark-150">
          <CardContent className="p-6">
            <div className="text-center text-neutral-500 dark:text-white">
              {error}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
          Weekly Bids
        </h2>
        <div className="text-sm text-neutral-600 dark:text-white">
          (Total all time:{" "}
          <span className="font-semibold text-neutral-900 dark:text-white">
            {formatCurrency(
              allWeeks.length
                ? allWeeks.reduce((s, g) => s + g.totalValue, 0)
                : allTimeTotal,
            )}
          </span>
          )
        </div>
      </div>

      {/* Weekly Bids Summary (Sunday–Saturday) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* This Week Card */}
        <Card className="border border-neutral-200 dark:border-neutral-700 dark:bg-dark-150">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-neutral-900 dark:text-white">
                  This Week
                </CardTitle>
                <CardDescription className="text-sm text-neutral-500 dark:text-white">
                  {thisWeekRange}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-50 dark:bg-blue-900/50">
                    <Calendar className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-neutral-500 dark:text-white">
                      Total Bids
                    </p>
                    <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                      {data.thisWeekBids.length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-50 dark:bg-green-900/50">
                    <DollarSign className="h-4 w-4 text-green-500 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-neutral-500 dark:text-white">
                      Total Value
                    </p>
                    <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                      {formatCurrency(sumValue(data.thisWeekBids))}
                    </p>
                  </div>
                </div>
              </div>
              {/* Category Breakdown */}
              {data.thisWeekBids.length > 0 && (
                <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                    BY CATEGORY
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(getCategoryTotals(data.thisWeekBids)).map(
                      ([type, total]) =>
                        total > 0 && (
                          <div
                            key={type}
                            className="flex items-center justify-between p-2 rounded bg-neutral-50 dark:bg-dark-200"
                          >
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(type)}`}
                            >
                              {formatOpportunityType(type)}
                            </span>
                            <span className="text-sm font-medium text-neutral-900 dark:text-white">
                              {formatCurrency(total)}
                            </span>
                          </div>
                        ),
                    )}
                  </div>
                </div>
              )}
              {/* List this week's bids */}
              <div className="max-h-64 overflow-auto divide-y divide-neutral-200 dark:divide-neutral-700">
                {data.thisWeekBids.map((b) => (
                  <div
                    key={b.id}
                    className="py-2 flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                          {b.title}
                        </p>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${getTypeColor(b.opportunity_type)}`}
                        >
                          {
                            formatOpportunityType(b.opportunity_type).split(
                              " ",
                            )[0]
                          }
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-white">
                        {new Date(b.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <div
                        className={`text-sm font-semibold ${b.excludeFromTotal ? "text-neutral-400 line-through dark:text-neutral-500" : "text-neutral-900 dark:text-white"}`}
                      >
                        {formatCurrency(b.expectedValue)}
                      </div>
                      <label
                        className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 cursor-pointer"
                        title="Exclude this quote from totals (e.g. revised or duplicate)"
                      >
                        <input
                          type="checkbox"
                          checked={b.excludeFromTotal}
                          onChange={(e) => toggleExclude(b.id, e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600 text-[#f26722] focus:ring-[#f26722]"
                        />
                        Exclude
                      </label>
                    </div>
                  </div>
                ))}
                {data.thisWeekBids.length === 0 && (
                  <div className="py-4 text-sm text-neutral-500 dark:text-white text-center">
                    No bids this week
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Last Week Card */}
        <Card className="border border-neutral-200 dark:border-neutral-700 dark:bg-dark-150">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Last Week
                </CardTitle>
                <CardDescription className="text-sm text-neutral-500 dark:text-white">
                  {lastWeekRange}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-purple-50 dark:bg-purple-900/50">
                    <Calendar className="h-4 w-4 text-purple-500 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-neutral-500 dark:text-white">
                      Total Bids
                    </p>
                    <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                      {data.lastWeekBids.length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-orange-50 dark:bg-orange-900/50">
                    <DollarSign className="h-4 w-4 text-orange-500 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-neutral-500 dark:text-white">
                      Total Value
                    </p>
                    <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                      {formatCurrency(sumValue(data.lastWeekBids))}
                    </p>
                  </div>
                </div>
              </div>
              {/* Category Breakdown */}
              {data.lastWeekBids.length > 0 && (
                <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                    BY CATEGORY
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(getCategoryTotals(data.lastWeekBids)).map(
                      ([type, total]) =>
                        total > 0 && (
                          <div
                            key={type}
                            className="flex items-center justify-between p-2 rounded bg-neutral-50 dark:bg-dark-200"
                          >
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(type)}`}
                            >
                              {formatOpportunityType(type)}
                            </span>
                            <span className="text-sm font-medium text-neutral-900 dark:text-white">
                              {formatCurrency(total)}
                            </span>
                          </div>
                        ),
                    )}
                  </div>
                </div>
              )}
              {/* List last week's bids */}
              <div className="max-h-64 overflow-auto divide-y divide-neutral-200 dark:divide-neutral-700">
                {data.lastWeekBids.map((b) => (
                  <div
                    key={b.id}
                    className="py-2 flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                          {b.title}
                        </p>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${getTypeColor(b.opportunity_type)}`}
                        >
                          {
                            formatOpportunityType(b.opportunity_type).split(
                              " ",
                            )[0]
                          }
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-white">
                        {new Date(b.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <div
                        className={`text-sm font-semibold ${b.excludeFromTotal ? "text-neutral-400 line-through dark:text-neutral-500" : "text-neutral-900 dark:text-white"}`}
                      >
                        {formatCurrency(b.expectedValue)}
                      </div>
                      <label
                        className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 cursor-pointer"
                        title="Exclude this quote from totals (e.g. revised or duplicate)"
                      >
                        <input
                          type="checkbox"
                          checked={b.excludeFromTotal}
                          onChange={(e) => toggleExclude(b.id, e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600 text-[#f26722] focus:ring-[#f26722]"
                        />
                        Exclude
                      </label>
                    </div>
                  </div>
                ))}
                {data.lastWeekBids.length === 0 && (
                  <div className="py-4 text-sm text-neutral-500 dark:text-white text-center">
                    No bids last week
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History toggle */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => {
            if (!showAllWeeks && !allWeeks.length) {
              loadAllWeeks();
            } else {
              setShowAllWeeks((v) => !v);
            }
          }}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-neutral-100 dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 text-neutral-800 dark:text-white hover:bg-neutral-200 dark:hover:bg-dark-200"
        >
          {showAllWeeks ? (
            "Hide History"
          ) : historyLoading ? (
            <LoadingSpinner size="xs" />
          ) : (
            "Show All Bids History"
          )}
        </button>
      </div>

      {/* All-time weekly groups */}
      {showAllWeeks && (
        <Card className="border border-neutral-200 dark:border-neutral-700 dark:bg-dark-150">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-neutral-900 dark:text-white">
                  All Bids History (Weekly)
                </CardTitle>
                <CardDescription className="text-sm text-neutral-500 dark:text-white">
                  Every opportunity ever, grouped Sunday–Saturday, with NET
                  30/quoted totals
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                  disabled={historyPage === 0}
                  className={`px-2 py-1 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 ${historyPage === 0 ? "opacity-50 cursor-not-allowed" : "bg-neutral-100 dark:bg-dark-150 hover:bg-neutral-200 dark:hover:bg-dark-200"} text-neutral-800 dark:text-white`}
                >
                  Prev 4 weeks
                </button>
                <button
                  onClick={() =>
                    setHistoryPage((p) =>
                      (p + 1) * weeksPerPage < allWeeks.length ? p + 1 : p,
                    )
                  }
                  disabled={(historyPage + 1) * weeksPerPage >= allWeeks.length}
                  className={`px-2 py-1 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 ${(historyPage + 1) * weeksPerPage >= allWeeks.length ? "opacity-50 cursor-not-allowed" : "bg-neutral-100 dark:bg-dark-150 hover:bg-neutral-200 dark:hover:bg-dark-200"} text-neutral-800 dark:text-white`}
                >
                  Next 4 weeks
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {allWeeks
                .slice(
                  historyPage * weeksPerPage,
                  (historyPage + 1) * weeksPerPage,
                )
                .map((group) => (
                  <div
                    key={group.range}
                    className="border-t border-neutral-200 dark:border-neutral-700 pt-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-neutral-600 dark:text-white">
                        {group.range}
                      </div>
                      <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {formatCurrency(group.totalValue)}
                      </div>
                    </div>
                    {/* Category breakdown for this week */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {Object.entries(getCategoryTotals(group.items)).map(
                        ([type, total]) =>
                          total > 0 && (
                            <span
                              key={type}
                              className={`text-xs px-2 py-1 rounded-full ${getTypeColor(type)}`}
                            >
                              {formatOpportunityType(type)}:{" "}
                              {formatCurrency(total)}
                            </span>
                          ),
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {group.items.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between p-2 rounded border border-neutral-200 dark:border-neutral-700"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                                {b.title}
                              </p>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full ${getTypeColor(b.opportunity_type)}`}
                              >
                                {
                                  formatOpportunityType(
                                    b.opportunity_type,
                                  ).split(" ")[0]
                                }
                              </span>
                            </div>
                            <p className="text-xs text-neutral-500 dark:text-white">
                              {new Date(b.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <div
                              className={`text-sm font-semibold ${b.excludeFromTotal ? "text-neutral-400 line-through dark:text-neutral-500" : "text-neutral-900 dark:text-white"}`}
                            >
                              {formatCurrency(b.expectedValue)}
                            </div>
                            <label
                              className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 cursor-pointer"
                              title="Exclude this quote from totals (e.g. revised or duplicate)"
                            >
                              <input
                                type="checkbox"
                                checked={b.excludeFromTotal}
                                onChange={(e) =>
                                  toggleExclude(b.id, e.target.checked)
                                }
                                className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600 text-[#f26722] focus:ring-[#f26722]"
                              />
                              Exclude
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              {!allWeeks.length && (
                <div className="text-sm text-neutral-500 dark:text-white">
                  No history found.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BidsOverview;
