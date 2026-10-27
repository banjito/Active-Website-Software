import React from "react";
import { useParams } from "react-router-dom";
import EngineeringJobPage from "@/components/engineering/EngineeringJobPage";

/**
 * /engineering/jobs/:id: every engineering-division job (AMP or C&E) opens
 * on the engineering portal's job page. JobDetail sends engineering jobs here.
 */
export default function EngineeringJobRoute() {
  const { id = "" } = useParams();
  return <EngineeringJobPage key={id} jobId={id} />;
}
