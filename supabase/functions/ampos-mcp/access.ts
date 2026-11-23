// Who can use which tools: the same permissions the ampOS app checks
// (Admin → People & roles → Roles), loaded once per request in index.ts.

import type { ToolContext } from "./mcp.ts";

type Ctx = Pick<ToolContext, "permissions">;

/** Sales portal: opportunities, quotes, estimates, RFIs, pipeline. */
export const canUseSales = (ctx: Ctx): boolean => ctx.permissions.has("sales.view_pipeline");

/** Job Profitability tab (QuickBooks actuals): "See job money", as in JobDetail.tsx. */
export const canSeeProfitability = (ctx: Ctx): boolean => ctx.permissions.has("jobs.view_money");
