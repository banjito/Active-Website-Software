import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("issue-resolved-notification: function loaded");

serve(async (req) => {
  console.log("Handler called:", req.method, req.url);

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key)
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

    const body = await req.json().catch(() => ({}));
    console.log("Request body:", JSON.stringify(body));
    const issueId = body?.issueId;
    const action = body?.action || "resolved";
    const resolutionComment =
      typeof body?.resolutionComment === "string"
        ? body.resolutionComment.trim()
        : "";
    if (!issueId)
      return new Response(JSON.stringify({ error: "issueId required" }), {
        headers,
        status: 400,
      });

    // 1. Get issue via PostgREST
    const restHeaders = {
      Authorization: `Bearer ${key}`,
      apikey: key,
      Accept: "application/json",
      "Accept-Profile": "common",
    };
    const issueRes = await fetch(
      `${url}/rest/v1/issue_reports?id=eq.${issueId}&select=id,title,description,status,priority,resolved_at,reporter_id,type,page_url`,
      { headers: restHeaders },
    );
    const issueData = await issueRes.json();
    const issue = Array.isArray(issueData) ? issueData[0] : null;
    if (!issue)
      return new Response(JSON.stringify({ error: "not found" }), {
        headers,
        status: 404,
      });
    console.log(
      "Issue:",
      issue.title,
      "status:",
      issue.status,
      "action:",
      action,
    );

    // For resolved action, verify the issue is actually resolved
    if (
      action === "resolved" &&
      issue.status !== "resolved" &&
      issue.status !== "closed"
    ) {
      return new Response(
        JSON.stringify({ emailSent: false, message: "not resolved" }),
        { headers },
      );
    }

    // 2. Collect user IDs to notify based on action
    const userIdsToNotify = new Set<string>();

    if (action === "resolved") {
      if (issue.reporter_id) userIdsToNotify.add(issue.reporter_id);
    }
    const ipRes = await fetch(
      `${url}/rest/v1/issue_interested_parties?issue_id=eq.${issueId}&select=user_id`,
      { headers: restHeaders },
    );
    if (ipRes.ok) {
      const ipData = (await ipRes.json()) as Array<{ user_id: string }>;
      ipData.forEach((r) => userIdsToNotify.add(r.user_id));
      console.log("Interested parties:", ipData.length);
    }

    // 3. Resolve emails for all user IDs
    const emailsToSend: string[] = [];
    for (const uid of userIdsToNotify) {
      try {
        const userRes = await fetch(`${url}/auth/v1/admin/users/${uid}`, {
          headers: { Authorization: `Bearer ${key}`, apikey: key },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData?.email) emailsToSend.push(userData.email);
        }
      } catch {
        /* skip */
      }
    }

    // Always notify admin on new issue/feature submissions
    const ADMIN_NOTIFY_EMAIL = "jack.lyons@ampqes.com";
    if (action === "created" && !emailsToSend.includes(ADMIN_NOTIFY_EMAIL)) {
      emailsToSend.push(ADMIN_NOTIFY_EMAIL);
    }

    const LEGACY_NOTIFY_EMAIL = "john.chambers@ampqes.com";
    const filteredEmailsToSend = emailsToSend.filter(
      (email) => email.trim().toLowerCase() !== LEGACY_NOTIFY_EMAIL,
    );

    console.log("Emails to notify:", filteredEmailsToSend);

    if (filteredEmailsToSend.length === 0) {
      return new Response(
        JSON.stringify({ emailSent: false, message: "no emails found" }),
        { headers },
      );
    }

    // 4. Build email content based on action
    const pmKey = Deno.env.get("POSTMARK_API_KEY");
    if (!pmKey)
      return new Response(
        JSON.stringify({ emailSent: false, message: "no POSTMARK_API_KEY" }),
        { headers },
      );

    const label =
      issue.type === "feature_request" ? "Feature request" : "Issue";
    const from = (
      Deno.env.get("POSTMARK_FROM") ?? "jack.lyons@ampqes.com"
    ).trim();
    const fromHeader = from.includes("<") ? from : `AMP System <${from}>`;
    const appUrl = (
      Deno.env.get("APP_URL") ||
      Deno.env.get("SITE_URL") ||
      ""
    ).replace(/\/$/, "");
    const link = appUrl ? `${appUrl}/features-fixes` : "";
    const safeTitle = (issue.title || "").replace(/</g, "&lt;");
    const safeResolutionComment = resolutionComment
      .replace(/</g, "&lt;")
      .replace(/\n/g, "<br>");

    let emailSubject: string;
    let heading: string;
    let bodyText: string;
    let detailRows: string;

    // Resolve reporter name for created notifications
    let reporterName = "Unknown";
    if (action === "created" && issue.reporter_id) {
      try {
        const rptRes = await fetch(
          `${url}/auth/v1/admin/users/${issue.reporter_id}`,
          {
            headers: { Authorization: `Bearer ${key}`, apikey: key },
          },
        );
        if (rptRes.ok) {
          const rptData = await rptRes.json();
          reporterName =
            rptData?.user_metadata?.full_name || rptData?.email || "Unknown";
        }
      } catch {
        /* skip */
      }
    }

    const safeDescription = (issue.description || "")
      .replace(/</g, "&lt;")
      .replace(/\n/g, "<br>");

    if (action === "created") {
      emailSubject = `New ${label.toLowerCase()} reported: ${issue.title}`;
      heading = `New ${label} Reported`;
      bodyText = `A new ${issue.type === "feature_request" ? "feature request" : "issue"} has been submitted.`;
      detailRows = `<tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Title</td><td style="padding:12px;border-bottom:1px solid #eee">${safeTitle}</td></tr><tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Description</td><td style="padding:12px;border-bottom:1px solid #eee">${safeDescription || "<em>None</em>"}</td></tr><tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Priority</td><td style="padding:12px;border-bottom:1px solid #eee">${issue.priority || "normal"}</td></tr><tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Reported by</td><td style="padding:12px;border-bottom:1px solid #eee">${reporterName}</td></tr><tr><td style="padding:12px;font-weight:bold;background:#f8f9fa">Page</td><td style="padding:12px">${issue.page_url || "N/A"}</td></tr>`;
    } else {
      const resolvedAt = issue.resolved_at
        ? new Date(issue.resolved_at).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "Recently";
      const resolutionCommentRow = safeResolutionComment
        ? `<tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Resolution note</td><td style="padding:12px;border-bottom:1px solid #eee">${safeResolutionComment}</td></tr>`
        : "";
      emailSubject = `${label} resolved: ${issue.title}`;
      heading = `${label} Resolved`;
      bodyText = `The following ${issue.type === "feature_request" ? "feature request" : "issue"} has been marked as resolved.`;
      detailRows = `<tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Title</td><td style="padding:12px;border-bottom:1px solid #eee">${safeTitle}</td></tr>${resolutionCommentRow}<tr><td style="padding:12px;font-weight:bold;background:#f8f9fa">Resolved</td><td style="padding:12px">${resolvedAt}</td></tr>`;
    }

    const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#f26722;color:#fff;padding:20px;text-align:center"><h1 style="margin:0;font-size:24px">${heading}</h1></div><div style="padding:20px;background:#f9f9f9"><p>${bodyText}</p><table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,.1)">${detailRows}</table>${link ? `<div style="margin-top:20px;text-align:center"><a href="${link}" style="background:#f26722;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold">View Features &amp; Fixes</a></div>` : ""}</div><div style="padding:20px;text-align:center;color:#666;font-size:14px;border-top:1px solid #eee"><p style="margin:0">Automated notification from AMP Quality Energy Services</p></div></div>`;
    const textResolutionComment =
      action === "resolved" && resolutionComment
        ? `\n\nResolution note:\n${resolutionComment}`
        : "";
    const textBodyStr = `${heading}\n\n${bodyText}\n\nTitle: ${issue.title}${textResolutionComment}${link ? "\nView: " + link : ""}\n\nAutomated notification from AMP Quality Energy Services`;

    // 5. Send email to each recipient
    const sentTo: string[] = [];
    for (const email of filteredEmailsToSend) {
      try {
        console.log("Sending to:", email);
        const pmRes = await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Postmark-Server-Token": pmKey,
          },
          body: JSON.stringify({
            From: fromHeader,
            To: email,
            Subject: emailSubject,
            HtmlBody: htmlBody,
            TextBody: textBodyStr,
            MessageStream: "outbound",
          }),
        });
        const pmText = await pmRes.text();
        console.log("Postmark response for", email, ":", pmRes.status, pmText);
        if (pmRes.ok) sentTo.push(email);
      } catch (e) {
        console.warn("Failed to send to", email, e);
      }
    }

    return new Response(
      JSON.stringify({ emailSent: sentTo.length > 0, sentTo }),
      { headers },
    );
  } catch (e) {
    console.error("ERROR:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      headers,
      status: 500,
    });
  }
});
