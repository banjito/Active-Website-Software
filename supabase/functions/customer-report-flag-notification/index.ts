import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("customer-report-flag-notification: function loaded");

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
    const assetId = body?.assetId;
    const reason =
      typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!assetId)
      return new Response(JSON.stringify({ error: "assetId required" }), {
        headers,
        status: 400,
      });

    // Look up report/job/customer context for the email (service role bypasses RLS).
    const netaHeaders = {
      Authorization: `Bearer ${key}`,
      apikey: key,
      Accept: "application/json",
      "Accept-Profile": "neta_ops",
    };
    const commonHeaders = {
      Authorization: `Bearer ${key}`,
      apikey: key,
      Accept: "application/json",
      "Accept-Profile": "common",
    };

    let reportName = "";
    let jobLabel = "";
    let customerName = "";
    try {
      const assetRes = await fetch(
        `${url}/rest/v1/assets?id=eq.${assetId}&select=id,name`,
        { headers: netaHeaders },
      );
      const assetData = await assetRes.json();
      reportName = Array.isArray(assetData) ? assetData[0]?.name ?? "" : "";

      const jaRes = await fetch(
        `${url}/rest/v1/job_assets?asset_id=eq.${assetId}&select=job_id&limit=1`,
        { headers: netaHeaders },
      );
      const jaData = await jaRes.json();
      const jobId = Array.isArray(jaData) ? jaData[0]?.job_id : null;
      if (jobId) {
        const jobRes = await fetch(
          `${url}/rest/v1/jobs?id=eq.${jobId}&select=job_number,title,customer_id`,
          { headers: netaHeaders },
        );
        const jobData = await jobRes.json();
        const job = Array.isArray(jobData) ? jobData[0] : null;
        if (job) {
          jobLabel = [job.job_number, job.title].filter(Boolean).join(" — ");
          if (job.customer_id) {
            const custRes = await fetch(
              `${url}/rest/v1/customers?id=eq.${job.customer_id}&select=name,company_name`,
              { headers: commonHeaders },
            );
            const custData = await custRes.json();
            const cust = Array.isArray(custData) ? custData[0] : null;
            customerName = cust?.company_name || cust?.name || "";
          }
        }
      }
    } catch (e) {
      console.warn("Context lookup failed:", e);
    }

    const pmKey = Deno.env.get("POSTMARK_API_KEY");
    if (!pmKey)
      return new Response(
        JSON.stringify({ emailSent: false, message: "no POSTMARK_API_KEY" }),
        { headers },
      );

    const ADMIN_NOTIFY_EMAIL = "jack.lyons@ampqes.com";
    const from = (
      Deno.env.get("POSTMARK_FROM") ?? "jack.lyons@ampqes.com"
    ).trim();
    const fromHeader = from.includes("<") ? from : `AMP System <${from}>`;
    const appUrl = (
      Deno.env.get("APP_URL") ||
      Deno.env.get("SITE_URL") ||
      ""
    ).replace(/\/$/, "");

    const safe = (s: string) =>
      (s || "").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    const safeReason = safe(reason) || "<em>No reason provided</em>";
    const safeReport = safe(reportName) || assetId;
    const safeJob = safe(jobLabel);
    const safeCustomer = safe(customerName);

    const detailRows =
      `<tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Report</td><td style="padding:12px;border-bottom:1px solid #eee">${safeReport}</td></tr>` +
      (safeJob
        ? `<tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Job</td><td style="padding:12px;border-bottom:1px solid #eee">${safeJob}</td></tr>`
        : "") +
      (safeCustomer
        ? `<tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold;background:#f8f9fa">Customer</td><td style="padding:12px;border-bottom:1px solid #eee">${safeCustomer}</td></tr>`
        : "") +
      `<tr><td style="padding:12px;font-weight:bold;background:#f8f9fa">Reason</td><td style="padding:12px">${safeReason}</td></tr>`;

    const heading = "Report Flagged by Customer";
    const bodyText =
      "A customer flagged a report from the ampOS ACCESS portal. It will appear in the report approval screen under Rejected/Issue with a Flagged badge.";
    const link = appUrl ? `${appUrl}/reports` : "";

    const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#f26722;color:#fff;padding:20px;text-align:center"><h1 style="margin:0;font-size:24px">${heading}</h1></div><div style="padding:20px;background:#f9f9f9"><p>${bodyText}</p><table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,.1)">${detailRows}</table>${link ? `<div style="margin-top:20px;text-align:center"><a href="${link}" style="background:#f26722;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold">Open Report Approval</a></div>` : ""}</div><div style="padding:20px;text-align:center;color:#666;font-size:14px;border-top:1px solid #eee"><p style="margin:0">Automated notification from AMP Quality Energy Services</p></div></div>`;
    const textBodyStr = `${heading}\n\n${bodyText}\n\nReport: ${reportName || assetId}${jobLabel ? `\nJob: ${jobLabel}` : ""}${customerName ? `\nCustomer: ${customerName}` : ""}\nReason: ${reason || "None"}${link ? "\nView: " + link : ""}\n\nAutomated notification from AMP Quality Energy Services`;

    const emailSubject = `Report flagged by customer: ${reportName || assetId}`;

    console.log("Sending flag notification to:", ADMIN_NOTIFY_EMAIL);
    const pmRes = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": pmKey,
      },
      body: JSON.stringify({
        From: fromHeader,
        To: ADMIN_NOTIFY_EMAIL,
        Subject: emailSubject,
        HtmlBody: htmlBody,
        TextBody: textBodyStr,
        MessageStream: "outbound",
      }),
    });
    const pmText = await pmRes.text();
    console.log("Postmark response:", pmRes.status, pmText);

    return new Response(
      JSON.stringify({ emailSent: pmRes.ok, sentTo: [ADMIN_NOTIFY_EMAIL] }),
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
