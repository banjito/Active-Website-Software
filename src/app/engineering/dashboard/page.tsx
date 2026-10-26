import React, { useLayoutEffect, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Briefcase, LayoutTemplate, Plus } from "lucide-react";
import { useDivision } from "@/App";
import { companyConfig } from "@/lib/companyConfig";
import { ce } from "@/components/engineering/engineeringTheme";
import EngineeringJobsTab from "@/components/engineering/EngineeringJobsTab";
import EngineeringReportBuilderTab, {
  ENGINEERING_BUILDER_PATH,
  RETURN_TO_ENGINEERING,
} from "@/components/engineering/EngineeringReportBuilderTab";

const JOBS_PATH = "/engineering/jobs";

/** The 40px blueprint grid over midnight that deepens into navy. */
const BLUEPRINT_STYLE: React.CSSProperties = {
  backgroundColor: "#0c0a34",
  backgroundImage:
    "linear-gradient(#14114e 1px, transparent 1px), linear-gradient(90deg, #14114e 1px, transparent 1px), linear-gradient(180deg, #0c0a34 0%, #0c0a34 50%, #1b0f56 100%)",
  backgroundSize: "40px 40px, 40px 40px, 100% 100%",
};

// A still frame of the C&E constellation: points joined to near neighbors.
const STARS: [number, number, number, number][] = [
  [60, 40, 2, 0.4], [140, 90, 2, 0.7], [210, 30, 1.5, 0.5], [260, 120, 2.5, 0.8],
  [330, 70, 2, 0.6], [390, 150, 2, 0.7], [450, 50, 2.5, 0.8], [500, 110, 2, 0.55],
  [560, 30, 1.5, 0.45], [600, 160, 2, 0.6], [180, 180, 1.5, 0.4], [300, 200, 2, 0.5],
  [420, 190, 1.5, 0.6], [540, 200, 2, 0.5], [80, 140, 1.5, 0.35],
];
const LINKS: [number, number][] = [
  [0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 6], [4, 5], [5, 7], [6, 7], [6, 8],
  [7, 9], [8, 7], [3, 10], [10, 14], [14, 1], [3, 11], [5, 12], [12, 13], [13, 9], [11, 12],
];

function Constellation() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 640 240"
      preserveAspectRatio="xMaxYMid slice"
      className="pointer-events-none absolute right-0 top-0 hidden h-full w-[640px] md:block"
    >
      <g stroke="#ffffff" strokeOpacity={0.18} strokeWidth={1}>
        {LINKS.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={STARS[a][0]} y1={STARS[a][1]} x2={STARS[b][0]} y2={STARS[b][1]} />
        ))}
      </g>
      <g fill="#ffffff">
        {STARS.map(([x, y, r, o]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fillOpacity={o} />
        ))}
      </g>
    </svg>
  );
}

const TABS = [
  { path: JOBS_PATH, label: "Jobs", icon: Briefcase },
  { path: ENGINEERING_BUILDER_PATH, label: "Report builder", icon: LayoutTemplate },
];

/**
 * Engineering portal: two tabs, Jobs and Report builder. /engineering,
 * /engineering/dashboard and /engineering/jobs all open the Jobs tab.
 */
export default function EngineeringDashboard() {
  const { setDivision } = useDivision();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onBuilder = pathname.startsWith(ENGINEERING_BUILDER_PATH);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    setDivision("engineering");
  }, [setDivision]);

  return (
    // Negative margins undo the layout's padding so the title band runs edge to edge.
    <div className={`-m-3 min-h-full sm:-m-4 lg:-m-6 ${ce.page}`}>
      <div className="relative overflow-hidden print:hidden" style={BLUEPRINT_STYLE}>
        <Constellation />
        <div className="relative mx-auto flex max-w-[1360px] flex-col gap-7 px-4 pt-10 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-2.5">
              <div className={`${ce.eyebrow} text-[#f8894f]`}>{companyConfig.engineeringName}</div>
              <h1 className="m-0 text-[30px] font-bold leading-9 text-white sm:text-[40px] sm:leading-[46px]">
                Engineering
              </h1>
              <div aria-hidden className={`h-[3px] w-14 ${ce.spark}`} />
            </div>
            {onBuilder && (
              <button
                type="button"
                onClick={() => navigate("/custom-forms/builder", RETURN_TO_ENGINEERING)}
                className="inline-flex h-11 items-center gap-2 rounded-none bg-white px-5 text-sm font-semibold text-[#1b0f56] hover:bg-[#f4f3f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0a34]"
              >
                <Plus className="h-[18px] w-[18px]" aria-hidden />
                New template
              </button>
            )}
          </div>
          <div role="tablist" aria-label="Engineering sections" className="flex gap-0.5">
            {TABS.map(({ path, label, icon: Icon }) => {
              const active = path === ENGINEERING_BUILDER_PATH ? onBuilder : !onBuilder;
              return (
                <Link
                  key={path}
                  to={path}
                  role="tab"
                  aria-selected={active}
                  className={`flex items-center gap-2.5 px-5 py-3.5 text-sm font-semibold no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${
                    active
                      ? `${ce.surface} ${ce.ink} shadow-[inset_0_2px_0_rgb(var(--brand-rgb))]`
                      : "text-[#c4c8d2] hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1360px] px-4 pb-28 pt-8 sm:px-8">
        {onBuilder ? <EngineeringReportBuilderTab /> : <EngineeringJobsTab />}
      </div>
    </div>
  );
}
