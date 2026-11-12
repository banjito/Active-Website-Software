// Minimal MCP (Model Context Protocol) message handling over plain HTTP POST.
// Stateless: every request stands alone, replies are plain JSON (no event stream).
// Only what Claude needs for tools: initialize, ping, tools/list, tools/call.

import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2.57.2";
import { TOOLS } from "./tools.ts";

export interface ToolContext {
  /** Supabase client signed in as the person using Claude. */
  supabase: SupabaseClient;
  user: User;
}

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const FALLBACK_VERSION = "2025-06-18";

const SERVER_INFO = { name: "ampos", title: "ampOS", version: "0.3.0" };

const INSTRUCTIONS =
  "ampOS is the operations app for an electrical testing and maintenance company " +
  "(NETA acceptance and maintenance testing). These tools read live ampOS data as the " +
  "signed-in person, so they only see what that person can see in the app. " +
  "Jobs have numbers like 26103; test reports have codes like 26103-203; action items " +
  "have codes like 26103-203-2. Equipment assets live at customer sites and link to their " +
  "test reports. For NETA questions, search the standards and cite section or table numbers. " +
  "All tools are read-only except create_estimate and update_estimate, which save to ampOS. " +
  "Estimates: an opportunity (quote number like 4189) holds estimate versions v1, v2... " +
  "To build one from drawings: list the equipment in scope, look up standard techs and hours " +
  "with search_estimate_library, group rows under section rows (by area or equipment type), " +
  "one row per equipment type with a quantity, and put assumptions and sheet references in " +
  "row notes. Never invent hours when the library has the item. Show the person the rows and " +
  "totals and get a yes before saving. Quote prices from get_estimate (NET 30/60/90), never " +
  "from your own math.";

type JsonRpcId = string | number | null;
type JsonRpcMessage = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: unknown;
  params?: Record<string, unknown>;
};

export async function handleMcp(body: unknown, ctx: ToolContext): Promise<unknown | null> {
  // Older clients may send a batch (array). Reply with an array of the answers.
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((m) => handleOne(m, ctx)))).filter((r) => r !== null);
    return replies.length ? replies : null;
  }
  return handleOne(body, ctx);
}

async function handleOne(raw: unknown, ctx: ToolContext): Promise<unknown | null> {
  if (!raw || typeof raw !== "object") {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  }
  const msg = raw as JsonRpcMessage;
  // Notifications (no id) and responses (no method) need no reply.
  if (msg.id === undefined || typeof msg.method !== "string") return null;

  const id = msg.id;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : FALLBACK_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }

    case "ping":
      return ok({});

    case "tools/list":
      return ok({
        tools: TOOLS.filter((t) => !t.allowed || t.allowed(ctx)).map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        })),
      });

    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);
      if (tool.allowed && !tool.allowed(ctx)) {
        return ok({
          content: [{ type: "text", text: "Your ampOS role doesn't include this area of the app." }],
          isError: true,
        });
      }
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await tool.run(args, ctx);
        return ok({
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (e) {
        // Tool failures go back to Claude as readable text, not protocol errors.
        return ok({
          content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
          isError: true,
        });
      }
    }

    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}
