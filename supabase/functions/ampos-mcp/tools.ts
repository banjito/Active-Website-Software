// Tools Claude can call. Each one is a fixed, read-only question: never raw SQL.
// Every query uses ctx.supabase, which is signed in as the person using Claude,
// so row security limits results exactly like the app does.
//
// Add a tool: append an object to TOOLS. Keep descriptions plain and specific;
// Claude reads them to decide when to call the tool.

import type { ToolContext } from "./mcp.ts";

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<Record<string, unknown>>;
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export const TOOLS: Tool[] = [
  {
    name: "whoami",
    title: "Who am I in ampOS",
    description:
      "Shows which ampOS account Claude is signed in as (name, email, role) and how many " +
      "jobs that account can see. Use it to check the connection works.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ_ONLY,
    async run(_args, { supabase, user }) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const { count, error } = await supabase
        .schema("neta_ops")
        .from("jobs")
        .select("id", { count: "exact", head: true });
      return {
        name: meta.name ?? null,
        email: user.email ?? null,
        role: meta.role ?? null,
        jobs_visible: error ? null : count,
        ...(error ? { jobs_error: error.message } : {}),
      };
    },
  },
];
