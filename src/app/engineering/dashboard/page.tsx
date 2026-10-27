import React, { useLayoutEffect, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Briefcase, FileCode } from "lucide-react";
import { useDivision } from "@/App";
import { companyConfig } from "@/lib/companyConfig";
import { blueprintStyle, ce } from "@/components/engineering/engineeringTheme";
import Constellation from "@/components/engineering/Constellation";
import EngineeringJobsTab from "@/components/engineering/EngineeringJobsTab";
import EngineeringReportBuilderTab, {
  ENGINEERING_BUILDER_PATH,
} from "@/components/engineering/EngineeringReportBuilderTab";

const JOBS_PATH = "/engineering/jobs";

const TABS = [
  { path: JOBS_PATH, label: "Jobs", icon: Briefcase },
  { path: ENGINEERING_BUILDER_PATH, label: "Report builder", icon: FileCode },
];

/**
 * Engineering portal: two tabs, Jobs and Report builder. /engineering,
 * /engineering/dashboard and /engineering/jobs all open the Jobs tab.
 */
export default function EngineeringDashboard() {
  const { setDivision } = useDivision();
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
      <div className="relative overflow-hidden print:hidden" style={blueprintStyle}>
        <Constellation />
        <div className="relative mx-auto flex max-w-[1360px] flex-col gap-7 px-4 pt-10 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-2.5">
              <h1 className="m-0 leading-none">
                <img
                  src={companyConfig.engineeringLogoPath}
                  alt={companyConfig.engineeringName}
                  className="h-14 w-auto sm:h-20"
                />
                <span className="sr-only"> Engineering</span>
              </h1>
              <div aria-hidden className={`h-[3px] w-14 ${ce.spark}`} />
            </div>
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

      {/* The report builder is an editor, so it gets the full window width. */}
      <div
        className={
          onBuilder ? "px-3 pb-6 pt-4 sm:px-4" : "mx-auto max-w-[1360px] px-4 pb-28 pt-8 sm:px-8"
        }
      >
        {onBuilder ? <EngineeringReportBuilderTab /> : <EngineeringJobsTab />}
      </div>
    </div>
  );
}
