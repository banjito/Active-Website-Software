import React, { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import JobDetail from "@/components/jobs/JobDetail";
import EngineeringJobPage from "@/components/engineering/EngineeringJobPage";
import { fetchEngineeringCompany } from "@/lib/engineering/engineeringCompany";

/**
 * /engineering/jobs/:id. C&E jobs get the engineering portal's job page;
 * AMP engineering jobs (and any job before the migration runs) get the
 * normal one. Re-checks on every navigation to this URL, so flipping the
 * switch and re-navigating swaps the page.
 */
export default function EngineeringJobRoute() {
  const { id = "" } = useParams();
  const { key } = useLocation();
  const [checked, setChecked] = useState<{ id: string; ce: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEngineeringCompany(id)
      .then((value) => !cancelled && setChecked({ id, ce: !!value }))
      .catch((err) => {
        console.error("Error checking job company:", err);
        if (!cancelled) setChecked({ id, ce: false });
      });
    return () => {
      cancelled = true;
    };
  }, [id, key]);

  // Keep showing the current page during a re-check; only a new job waits.
  if (checked?.id !== id) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="md" />
      </div>
    );
  }
  return checked.ce ? <EngineeringJobPage jobId={id} /> : <JobDetail />;
}
