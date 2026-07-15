import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Phone,
  Mail,
  User as UserIcon,
  MessageSquare,
  RefreshCw,
  Feather,
} from "lucide-react";
import { format } from "date-fns";
import {
  getRecentInteractions,
  getAuthorProfilesByEmail,
  interactionTypeLabel,
  type InteractionFeedItem,
  type AuthorProfile,
} from "@/services/interactionsService";
import { AuthorAvatar } from "@/components/sales/AuthorAvatar";

type FeedFilter = "all" | "call" | "email" | "in_person";

const typeIcon = (type: string) => {
  if (type === "call") return <Phone className="h-4 w-4 text-brand" />;
  if (type === "email")
    return <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
  return <UserIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
};

const typeBg = (type: string) => {
  if (type === "call") return "bg-brand/10";
  if (type === "email") return "bg-blue-100 dark:bg-blue-900";
  return "bg-purple-100 dark:bg-purple-900";
};

const typeBadge = (type: string) => {
  if (type === "call") return "bg-brand/10 text-brand";
  if (type === "email")
    return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
};

export const InteractionsFeed: React.FC<{ limit?: number }> = ({
  limit = 50,
}) => {
  const [items, setItems] = useState<InteractionFeedItem[]>([]);
  const [authorProfiles, setAuthorProfiles] = useState<
    Map<string, AuthorProfile>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FeedFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRecentInteractions(limit);
      setItems(data);
      const profiles = await getAuthorProfilesByEmail(
        data.map((d) => d.author_email),
      );
      setAuthorProfiles(profiles);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Failed to load interactions");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when an interaction is logged anywhere (e.g. the top-bar widget).
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("interactionLogged", handler);
    return () => window.removeEventListener("interactionLogged", handler);
  }, [load]);

  const filtered =
    filter === "all" ? items : items.filter((i) => i.note_type === filter);

  return (
    <div className="bg-white dark:bg-dark-150 rounded-none shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-brand" />
          Interactions Feed
        </h2>
        <button
          onClick={load}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-brand dark:text-neutral-400"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex space-x-4 mb-6 border-b border-neutral-200 dark:border-neutral-700">
        {(["all", "call", "email", "in_person"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium ${
              filter === f
                ? "text-brand border-b-2 border-brand"
                : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            {f === "all"
              ? "All"
              : f === "call"
                ? "Calls"
                : f === "email"
                  ? "Emails"
                  : "In Person"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-neutral-500">
          Loading interactions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">
          <Feather className="h-8 w-8 mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
          <p className="text-sm">No interactions logged yet.</p>
          <p className="text-xs mt-1">
            Use the “Log interaction” button in the top bar to add one.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item, idx) => (
            <div key={item.id} className="relative">
              {idx < filtered.length - 1 && (
                <div className="absolute top-0 left-6 h-full w-0.5 bg-neutral-200 dark:bg-neutral-700" />
              )}
              <div className="flex items-start relative">
                <div className="absolute top-0 left-0 h-12 w-12 flex items-center justify-center z-10">
                  <div
                    className={`h-8 w-8 rounded-none ${typeBg(item.note_type)} flex items-center justify-center border-4 border-white dark:border-neutral-800`}
                  >
                    {typeIcon(item.note_type)}
                  </div>
                </div>
                <div className="ml-16 bg-white dark:bg-dark-150 p-4 rounded-none shadow-sm border border-neutral-200 dark:border-neutral-600 w-full">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                        <Link
                          to={`/sales-dashboard/customers/${item.customer_id}`}
                          className="hover:text-brand hover:underline"
                        >
                          {item.customer_name}
                        </Link>
                        {item.contact_id && (
                          <>
                            <span className="text-neutral-400"> · </span>
                            <Link
                              to={`/sales-dashboard/contacts/${item.contact_id}`}
                              className="hover:text-brand hover:underline"
                            >
                              {item.contact_display_name}
                            </Link>
                          </>
                        )}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {format(
                          new Date(item.occurred_at),
                          "MMM d, yyyy 'at' h:mm a",
                        )}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-none text-xs font-medium shrink-0 ${typeBadge(item.note_type)}`}
                    >
                      {interactionTypeLabel(item.note_type)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">
                    {item.context}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <AuthorAvatar
                      email={item.author_email}
                      profile={authorProfiles.get(
                        (item.author_email || "").toLowerCase(),
                      )}
                      size={24}
                    />
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Logged by: {item.author_email}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InteractionsFeed;
