import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, UserCog } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { employeeEmailRegex } from "@/lib/companyConfig";
import {
  DIRECTOR_DIVISION_ID,
  fetchDivisionLeads,
  type DivisionLeads,
} from "@/services/divisionLeadsService";

interface PmOption {
  id: string;
  name: string;
  email: string;
}

// Read from common.profiles, not admin_get_users(), so non-admins can see and pick
// the PM. Loaded once per page load and shared by every picker.
let staffPromise: Promise<PmOption[]> | null = null;

function loadStaff(): Promise<PmOption[]> {
  if (!staffPromise) {
    staffPromise = (async () => {
      const { data, error } = await supabase
        .schema("common")
        .from("profiles")
        .select("id, full_name, email, hidden, is_active");
      if (error) {
        staffPromise = null;
        throw error;
      }
      return (data ?? [])
        .filter(
          (p: any) =>
            p.hidden !== true &&
            p.is_active !== false &&
            !!p.email &&
            employeeEmailRegex.test(p.email),
        )
        .map((p: any) => ({
          id: p.id,
          name: (p.full_name || "").trim() || p.email,
          email: p.email,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    })();
  }
  return staffPromise;
}

interface ProjectManagerPickerProps {
  value: string | null | undefined;
  /** The job's location, so its PM can be listed first */
  division: string | null | undefined;
  onChange: (id: string | null, name: string | null) => void | Promise<void>;
  chipClassName: string;
  labelClassName: string;
}

export default function ProjectManagerPicker({
  value,
  division,
  onChange,
  chipClassName,
  labelClassName,
}: ProjectManagerPickerProps) {
  const [staff, setStaff] = useState<PmOption[]>([]);
  const [leads, setLeads] = useState<DivisionLeads>({});
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadStaff()
      .then((s) => alive && setStaff(s))
      .catch((err) => console.error("[ProjectManagerPicker] Could not load staff:", err));
    fetchDivisionLeads()
      .then((l) => alive && setLeads(l ?? {}))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const locationLead =
    division && division !== DIRECTOR_DIVISION_ID ? leads[division] : undefined;

  const currentName = useMemo(() => {
    if (!value) return null;
    return (
      staff.find((s) => s.id === value)?.name ??
      (locationLead?.id === value ? locationLead.name : null) ??
      (staff.length ? "Unknown user" : "…")
    );
  }, [value, staff, locationLead]);

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = staff.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
    // The location's PM goes first
    return [
      ...matches.filter((s) => s.id === locationLead?.id),
      ...matches.filter((s) => s.id !== locationLead?.id),
    ];
  }, [staff, search, locationLead]);

  const pick = async (id: string | null, name: string | null) => {
    setOpen(false);
    setSearch("");
    await onChange(id, name);
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" className={chipClassName} onClick={() => setOpen((v) => !v)}>
        <span className={labelClassName}>PM</span>
        <UserCog className="h-3.5 w-3.5 text-brand" />
        {currentName ?? <span className="text-neutral-400 dark:text-neutral-500">Not assigned</span>}
        <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-none border border-neutral-300 bg-white shadow-lg dark:border-neutral-600 dark:bg-dark-150 sm:left-auto sm:right-0">
          <div className="p-3">
            <input
              type="text"
              placeholder="Search people..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full rounded-none border border-neutral-300 bg-white p-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand dark:border-neutral-600 dark:bg-dark-100 dark:text-white"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {options.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => void pick(s.id, s.name)}
                className={`flex w-full flex-col border-b border-neutral-100 px-3 py-2 text-left last:border-b-0 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-dark-100 ${
                  s.id === value ? "bg-neutral-50 dark:bg-dark-100" : ""
                }`}
              >
                <span className="font-medium text-neutral-900 dark:text-white">
                  {s.name}
                  {s.id === locationLead?.id && (
                    <span className="ml-2 rounded-none border border-brand px-1 font-mono text-[10px] font-normal text-brand">
                      default
                    </span>
                  )}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{s.email}</span>
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No people found
              </div>
            )}
          </div>
          <div className="flex border-t border-neutral-200 dark:border-neutral-700">
            {value && (
              <button
                type="button"
                onClick={() => void pick(null, null)}
                className="flex-1 px-3 py-1.5 text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSearch("");
              }}
              className="flex-1 px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
