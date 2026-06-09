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
}

const STORAGE_KEY = "sales.pipelineCalendar.jobs.v1";
const PROJECTION_OPPORTUNITY_IDS_KEY =
  "sales.pipelineProjection.opportunityIds.v1";

const seedPipelineJobs: PipelineJob[] = [
  {
    id: "pipe-001",
    customer: "MC Dean",
    dataCenterId: "DC Blox 40mw",
    location: "ATL",
    region: "GA",
    amount: 4.8,
    startDate: "2026-06-10",
    endDate: "2026-08-28",
    status: "confirmed",
  },
  {
    id: "pipe-002",
    customer: "Cleveland",
    dataCenterId: "QTS",
    location: "Dalton, GA",
    region: "GA",
    amount: 1.7,
    startDate: "2026-07-15",
    endDate: "2026-09-20",
    status: "expected",
  },
  {
    id: "pipe-003",
    customer: "Marathon",
    dataCenterId: "DNN 4",
    location: "Bhm, AL",
    region: "AL",
    amount: 4.54,
    startDate: "2026-08-01",
    endDate: "2026-11-15",
    status: "confirmed",
  },
  {
    id: "pipe-004",
    customer: "Lawson",
    dataCenterId: "AWS ATL 111",
    location: "ATL",
    region: "GA",
    amount: 2.4,
    startDate: "2026-09-01",
    status: "expected",
  },
  {
    id: "pipe-005",
    customer: "Andrews",
    dataCenterId: "FTY 03",
    location: "Jackson, MS",
    region: "AL",
    amount: 1.2,
    startDate: "2026-05-20",
    endDate: "2026-06-18",
    status: "dropped",
  },
  {
    id: "pipe-006",
    customer: "Gaylor",
    dataCenterId: "Nashville Core",
    location: "Nashville, TN",
    region: "TN",
    amount: 3.25,
    startDate: "2026-10-01",
    endDate: "2027-01-31",
    status: "expected",
  },
  {
    id: "pipe-007",
    customer: "MC Dean",
    dataCenterId: "Vantage ATL",
    location: "ATL",
    region: "GA",
    amount: 5.1,
    startDate: "2026-11-15",
    endDate: "2027-04-01",
    status: "confirmed",
  },
  {
    id: "pipe-008",
    customer: "Cleveland",
    dataCenterId: "TVA Compute",
    location: "Chattanooga, TN",
    region: "TN",
    amount: 1.95,
    startDate: "2026-06-01",
    endDate: "2026-07-12",
    status: "confirmed",
  },
  {
    id: "pipe-009",
    customer: "Marathon",
    dataCenterId: "Edge BHM",
    location: "Birmingham, AL",
    region: "AL",
    amount: 0.85,
    startDate: "2026-07-01",
    endDate: "2026-08-05",
    status: "expected",
  },
  {
    id: "pipe-010",
    customer: "Lawson",
    dataCenterId: "Gulf DC 2",
    location: "Mobile, AL",
    region: "AL",
    amount: 2.75,
    startDate: "2026-12-01",
    status: "expected",
  },
  {
    id: "pipe-011",
    customer: "Andrews",
    dataCenterId: "QTS Phase 2",
    location: "Atlanta, GA",
    region: "GA",
    amount: 3.65,
    startDate: "2026-04-10",
    endDate: "2026-06-30",
    status: "confirmed",
  },
  {
    id: "pipe-012",
    customer: "Gaylor",
    dataCenterId: "UK LON 1",
    location: "London, UK",
    region: "International",
    amount: 6.8,
    startDate: "2026-09-15",
    endDate: "2027-02-15",
    status: "expected",
  },
  {
    id: "pipe-013",
    customer: "MC Dean",
    dataCenterId: "DUB Campus",
    location: "Dublin, IE",
    region: "International",
    amount: 7.2,
    startDate: "2027-01-10",
    status: "expected",
  },
  {
    id: "pipe-014",
    customer: "Cleveland",
    dataCenterId: "Memphis Hub",
    location: "Memphis, TN",
    region: "TN",
    amount: 2.1,
    startDate: "2026-08-20",
    endDate: "2026-10-15",
    status: "dropped",
  },
  {
    id: "pipe-015",
    customer: "Marathon",
    dataCenterId: "Huntsville AI",
    location: "Huntsville, AL",
    region: "AL",
    amount: 4.05,
    startDate: "2026-06-25",
    endDate: "2026-09-25",
    status: "expected",
  },
];

export function getSeedPipelineJobs(): PipelineJob[] {
  return seedPipelineJobs.map((job) => ({ ...job }));
}

export function makePipelineJobId(): string {
  return `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPipelineJob(value: unknown): value is PipelineJob {
  if (!value || typeof value !== "object") return false;

  const job = value as Partial<PipelineJob>;
  return (
    typeof job.id === "string" &&
    typeof job.customer === "string" &&
    typeof job.location === "string" &&
    ["AL", "TN", "GA", "International"].includes(job.region || "") &&
    typeof job.amount === "number" &&
    typeof job.startDate === "string" &&
    ["confirmed", "expected", "dropped"].includes(job.status || "")
  );
}

export function loadPipelineJobs(): PipelineJob[] {
  if (typeof window === "undefined") return getSeedPipelineJobs();

  try {
    const storedJobs = window.localStorage.getItem(STORAGE_KEY);
    if (!storedJobs) return getSeedPipelineJobs();

    const parsedJobs = JSON.parse(storedJobs);
    if (!Array.isArray(parsedJobs) || !parsedJobs.every(isPipelineJob)) {
      return getSeedPipelineJobs();
    }

    return parsedJobs;
  } catch (error) {
    console.error("Error loading pipeline projection jobs:", error);
    return getSeedPipelineJobs();
  }
}

export function savePipelineJobs(jobs: PipelineJob[]): boolean {
  if (typeof window === "undefined") return true;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    return true;
  } catch (error) {
    console.error("Error saving pipeline projection jobs:", error);
    return false;
  }
}

export function loadPipelineProjectionOpportunityIds(): Set<string> {
  if (typeof window === "undefined") return new Set();

  try {
    const storedIds = window.localStorage.getItem(PROJECTION_OPPORTUNITY_IDS_KEY);
    if (!storedIds) return new Set();

    const parsedIds = JSON.parse(storedIds);
    if (!Array.isArray(parsedIds)) return new Set();

    return new Set(
      parsedIds.filter((id): id is string => typeof id === "string" && !!id),
    );
  } catch (error) {
    console.error("Error loading pipeline projection opportunity IDs:", error);
    return new Set();
  }
}

export function savePipelineProjectionOpportunityIds(ids: Set<string>): boolean {
  if (typeof window === "undefined") return true;

  try {
    window.localStorage.setItem(
      PROJECTION_OPPORTUNITY_IDS_KEY,
      JSON.stringify(Array.from(ids)),
    );
    window.dispatchEvent(new Event("pipelineProjectionChanged"));
    return true;
  } catch (error) {
    console.error("Error saving pipeline projection opportunity IDs:", error);
    return false;
  }
}

export function addOpportunitiesToPipelineProjection(ids: string[]): Set<string> {
  const currentIds = loadPipelineProjectionOpportunityIds();
  ids.forEach((id) => currentIds.add(id));
  savePipelineProjectionOpportunityIds(currentIds);
  return currentIds;
}

export function removeOpportunityFromPipelineProjection(id: string): Set<string> {
  const currentIds = loadPipelineProjectionOpportunityIds();
  currentIds.delete(id);
  savePipelineProjectionOpportunityIds(currentIds);
  return currentIds;
}
