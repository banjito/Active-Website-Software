import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY, { db: { schema: "neta_ops" } });

const ID = "73fbbb1c-91f8-4cf5-9078-48311b0c1a8a";

const { data: probe, error: pe } = await svc.from("backup_reports").select("*").limit(1);
console.log("backup_reports probe err:", pe?.message);
if (probe?.[0]) console.log("columns:", Object.keys(probe[0]).join(", "));

const { data, error } = await svc.from("backup_reports").select("*").eq("row_id", ID).limit(50);
console.log("\nby row_id:", error?.message, data?.length);
for (const r of data ?? []) {
  const blob = JSON.stringify(r);
  console.log(`  ${r.captured_at ?? r.created_at}  op=${r.op ?? r.operation}  bytes=${blob.length}  MDC=${blob.toUpperCase().includes("MDC")}`);
}
