import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirmDialog";

// Shared by the Deliverables tab and the deliverable View page.
// "Sent" in the UI = status 'delivered' in the database (ACCESS reads that value).

const invokeEdge = async (fn: string, body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = await ctx.json();
        if (b?.error) detail = b.error;
      } catch {
        /* no json body */
      }
    }
    throw new Error(detail);
  }
  const bodyError = (data as { error?: string } | null)?.error;
  if (bodyError) throw new Error(bodyError);
};

export async function markDeliverableSent(deliverableId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema("neta_ops")
    .from("deliverables")
    .update({ status: "delivered", delivered_at: now, updated_at: now })
    .eq("id", deliverableId);
  if (error) throw error;
}

// Renders the cover letter, each approved/sent report, then the merged full
// packet PDF into ampOS ACCESS. One at a time. Reports that aren't approved/sent
// (or are uploaded files) are skipped: ACCESS can't show those anyway.
// Shows a toast with the result.
export async function publishDeliverableToAccess(deliverableId: string) {
  const errors: string[] = [];
  let published = 0;
  let skipped = 0;

  try {
    await invokeEdge("publish-deliverable-pdf", { deliverableId });
    published++;
  } catch (e) {
    errors.push(`Cover letter: ${e instanceof Error ? e.message : e}`);
  }

  try {
    const { data: d, error: dErr } = await supabase
      .schema("neta_ops")
      .from("deliverables")
      .select("cover_letter_id")
      .eq("id", deliverableId)
      .single();
    if (dErr) throw dErr;

    const { data: cl, error: clErr } = await supabase
      .schema("neta_ops")
      .from("generated_documents")
      .select("selected_report_ids")
      .eq("id", d.cover_letter_id)
      .maybeSingle();
    if (clErr) throw clErr;
    const reportIds: string[] = cl?.selected_report_ids ?? [];

    let reports: { id: string; name: string }[] = [];
    if (reportIds.length > 0) {
      const { data: assets, error: aErr } = await supabase
        .schema("neta_ops")
        .from("assets")
        .select("id, name, file_url, status")
        .in("id", reportIds);
      if (aErr) throw aErr;
      reports = (assets || []).filter(
        (a) =>
          a.file_url?.startsWith("report:") &&
          ["approved", "sent"].includes(String(a.status || "").toLowerCase()),
      );
    }
    skipped = reportIds.length - reports.length;

    // skipPackets: build the merged packet once below, not after every report.
    for (const r of reports) {
      try {
        await invokeEdge("publish-report-pdf", {
          assetId: r.id,
          skipPackets: true,
        });
        published++;
      } catch (e) {
        errors.push(`${r.name}: ${e instanceof Error ? e.message : e}`);
      }
    }

    // Last: stitch everything above into the one "full packet" PDF.
    if (reports.length > 0) {
      try {
        await invokeEdge("publish-packet-pdf", { deliverableId });
        published++;
      } catch (e) {
        errors.push(`Full packet: ${e instanceof Error ? e.message : e}`);
      }
    }
  } catch (e) {
    errors.push(`Reports: ${e instanceof Error ? e.message : e}`);
  }

  if (errors.length > 0) console.warn("ACCESS publish errors:", errors);
  toast({
    title:
      errors.length === 0
        ? "Packet published to ampOS ACCESS"
        : "Packet partly published to ampOS ACCESS",
    description: [
      `${published} PDF(s) published.`,
      skipped > 0
        ? `${skipped} report(s) skipped (not approved, or an uploaded file).`
        : "",
      errors.length > 0
        ? `${errors.length} failed: ${errors.slice(0, 2).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    variant: errors.length === 0 ? "success" : "warning",
    persistent: errors.length > 0,
  });
}

export const confirmMarkSent = () =>
  confirmDialog({
    title: "Mark as sent?",
    description:
      "This publishes the cover letter and approved reports to ampOS ACCESS, where the customer can open them. It does not email the customer.",
    confirmLabel: "Mark as Sent",
  });

// Unsend: back to Draft. ACCESS only lists packets whose status is 'delivered'
// (common.customer_deliverables), so the packet disappears for the customer at
// once and customer-report-download refuses its PDFs. The published files stay in
// the private bucket and are overwritten on the next send.
export async function unsendDeliverable(deliverableId: string) {
  const { error } = await supabase
    .schema("neta_ops")
    .from("deliverables")
    .update({
      status: "draft",
      delivered_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deliverableId);
  if (error) throw error;
}

export const confirmUnsend = () =>
  confirmDialog({
    title: "Remove from ampOS ACCESS?",
    description:
      "The customer will no longer see this packet (cover letter and full packet PDF). It goes back to Draft. The reports inside stay in their report list, because approved reports always show in ACCESS.",
    confirmLabel: "Remove",
    destructive: true,
  });
