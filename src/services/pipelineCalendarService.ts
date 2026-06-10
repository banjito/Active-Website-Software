export type PipelineRegion = "AL" | "TN" | "GA" | "International";
export type PipelineStatus = "confirmed" | "expected" | "dropped";

export interface PipelineJob {
  id: string;
  customer: string;
  dataCenterId?: string;
  location: string;
  region: PipelineRegion;
  amount: number;
  startDate: string;
  endDate?: string;
  status: PipelineStatus;
  isAwarded?: boolean;
}
