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

// Scopes we ask Claude to request. Deliberately NOT "openid": that makes Supabase
// add an id_token signed with the project's shared secret (the project's JWKS is
// empty), which Claude can't verify, so it drops the whole login. Left to itself,
// Claude requests every scope Supabase lists, openid included.
const SCOPES = ["profile", "email", "offline_access"];

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
  const scope = SCOPES.join(" ");
  const challenge = invalidToken
    ? `Bearer error="invalid_token", scope="${scope}", resource_metadata="${METADATA_URL}"`
    : `Bearer scope="${scope}", resource_metadata="${METADATA_URL}"`;
  return json(
    { error: invalidToken ? "invalid_token" : "unauthorized", error_description: description },
    401,
    { "WWW-Authenticate": challenge },
  );
}

/** Reads a few token fields for the logs, without trusting or verifying them. */
function peekClaims(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] ?? "";
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const c = JSON.parse(atob(padded)) as Record<string, unknown>;
    return { iss: c.iss, aud: c.aud, role: c.role, client_id: c.client_id, exp: c.exp, now: Math.floor(Date.now() / 1000) };
  } catch {
    return { unreadable: true };
  }
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
      scopes_supported: SCOPES,
      resource_name: "ampOS",
    });
  }

  if (!SUPABASE_URL || !ANON_KEY) {
    return json({ error: "server_misconfigured", error_description: "Missing Supabase env vars." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    // Logs only the shape of what arrived, never a value.
    console.log("ampos-mcp: no bearer token", {
      method: req.method,
      hasAuthHeader: authHeader !== null,
      scheme: authHeader?.split(" ")[0] ?? null,
      length: authHeader?.length ?? 0,
      headerNames: [...req.headers.keys()],
    });
    return unauthorized("Sign in to ampOS to use this connector.", false);
  }

  // Client that carries the user's token: every query runs as them (RLS applies).
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    // Shows up in Supabase > Edge Functions > ampos-mcp > Logs. Never logs the token itself.
    console.log("ampos-mcp: token rejected", { reason: error?.message ?? "no user", claims: peekClaims(token) });
    return unauthorized("Your ampOS sign-in expired. Reconnect.", true);
  }

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
