// ampOS connector for Claude (MCP server). Phase 1: sign-in + one test tool.
//
// Deploy WITHOUT the gateway's JWT check. This function checks tokens itself,
// because signed-out requests must get a 401 that tells Claude where to sign in:
//   supabase functions deploy ampos-mcp --no-verify-jwt
//
// Connector URL to paste into Claude:
//   https://<project-ref>.supabase.co/functions/v1/ampos-mcp
//
// Sign-in flow: Claude calls with no token, gets 401 + resource_metadata link,
// reads that, finds Supabase Auth (OAuth 2.1 server), registers itself, and
// sends the user to the app's /oauth/consent page. The token it gets back is
// a normal Supabase user token, so every query below runs as that user and
// row security applies exactly as it does in the app.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { handleMcp } from "./mcp.ts";

const FUNCTION_NAME = "ampos-mcp";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RESOURCE_URL = `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`;
const METADATA_URL = `${RESOURCE_URL}/.well-known/oauth-protected-resource`;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extra },
  });
}

function unauthorized(description: string, invalidToken: boolean): Response {
  const challenge = invalidToken
    ? `Bearer error="invalid_token", resource_metadata="${METADATA_URL}"`
    : `Bearer resource_metadata="${METADATA_URL}"`;
  return json(
    { error: invalidToken ? "invalid_token" : "unauthorized", error_description: description },
    401,
    { "WWW-Authenticate": challenge },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const path = new URL(req.url).pathname;

  // Tells Claude which sign-in server issues tokens for this connector.
  if (path.endsWith("/.well-known/oauth-protected-resource")) {
    return json({
      resource: RESOURCE_URL,
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "ampOS",
    });
  }

  if (!SUPABASE_URL || !ANON_KEY) {
    return json({ error: "server_misconfigured", error_description: "Missing Supabase env vars." }, 500);
  }

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return unauthorized("Sign in to ampOS to use this connector.", false);

  // Client that carries the user's token: every query runs as them (RLS applies).
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return unauthorized("Your ampOS sign-in expired. Reconnect.", true);

  // Stateless server: no event stream (GET) and no sessions to end (DELETE).
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const reply = await handleMcp(body, { supabase, user: data.user });
  // Notifications get no reply body.
  if (reply === null) return new Response(null, { status: 202, headers: CORS });
  return json(reply);
});
