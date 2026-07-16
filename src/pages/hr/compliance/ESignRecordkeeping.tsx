import React, { useState, useEffect, useCallback } from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import {
  Shield,
  Search,
  Download,
  Loader2,
  FileSignature,
  Calendar,
  FileText,
  PenLine,
} from "lucide-react";
import { onboardingService } from "../../../services/hr/onboardingService";
import type { ESignForm } from "../../../services/hr/onboardingService";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../../components/ui/Dialog";

type StatusFilter = "all" | "signed" | "pending" | "declined";

interface AuditRow {
  id: string;
  formId: string;
  formName: string;
  formType: string;
  source: "onboarding" | "offers" | "packet_doc";
  signerName: string;
  signerEmail: string;
  status: string;
  signedAt: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface DetailSignatures {
  field_name: string;
  signature_image?: string;
}

interface DetailState {
  documentUrl: string | null;
  documentHtml: string | null;
  documentName: string;
  signatures: DetailSignatures[];
  loading: boolean;
  error: string | null;
}

const initialDetail: DetailState = {
  documentUrl: null,
  documentHtml: null,
  documentName: "",
  signatures: [],
  loading: false,
  error: null,
};

export const ESignRecordkeeping: React.FC = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);
  const [detail, setDetail] = useState<DetailState>(initialDetail);

  useEffect(() => {
    loadAuditData();
  }, []);

  const loadDetail = useCallback(async (row: AuditRow) => {
    setDetail((d) => ({ ...d, loading: true, error: null }));
    try {
      if (row.source === "onboarding") {
        const [formRes, subRes] = await Promise.all([
          onboardingService.getESignFormById(row.formId),
          supabase
            .schema("common")
            .from("onboarding_e_sign_submissions")
            .select("*")
            .eq("id", row.id)
            .single(),
        ]);
        const form = formRes as ESignForm | null;
        const submission = subRes.data as any;
        if (subRes.error || !submission) {
          setDetail({
            ...initialDetail,
            error: "Submission not found.",
            loading: false,
          });
          return;
        }
        const docs = (form as any)?.custom_fields?.attached_documents;
        const documentUrl =
          Array.isArray(docs) && docs[0]?.file_url ? docs[0].file_url : null;
        const linkMatch = (form?.form_content || "").match(
          /href=["']([^"']+)["']/,
        );
        const docUrl = documentUrl || (linkMatch ? linkMatch[1] : null);
        const docHtml =
          !docUrl && form?.form_content ? form.form_content : null;
        const sigs = Array.isArray(submission.signatures)
          ? submission.signatures.map((s: any) => ({
              field_name: s.field_name || "Signature",
              signature_image: s.signature_image,
            }))
          : [];
        setDetail({
          documentUrl: docUrl || null,
          documentHtml: docHtml || null,
          documentName: row.formName,
          signatures: sigs,
          loading: false,
          error: null,
        });
        return;
      }
      // Packet document signatures (New Hire Packets – Sign and Send)
      if (row.source === "packet_doc") {
        const { data: sig, error: sigErr } = await supabase
          .schema("common")
          .from("onboarding_packet_document_signatures")
          .select("*")
          .eq("id", row.id)
          .single();
        if (sigErr || !sig) {
          setDetail({
            ...initialDetail,
            error: "Signature record not found.",
            loading: false,
          });
          return;
        }
        const s = sig as any;
        setDetail({
          documentUrl: s.document_file_url || null,
          documentHtml: null,
          documentName: s.document_name,
          signatures: s.signature_image
            ? [{ field_name: "Signature", signature_image: s.signature_image }]
            : [],
          loading: false,
          error: null,
        });
        return;
      }
      // Offers
      if (row.id.startsWith("offer-")) {
        const { data: offer } = await supabase
          .schema("common")
          .from("offers")
          .select("offer_letter_content, custom_fields")
          .eq("id", row.formId)
          .single();
        const docUrl = (offer as any)?.custom_fields?.document_url ?? null;
        const docHtml = (offer as any)?.offer_letter_content ?? null;
        setDetail({
          documentUrl: docUrl || null,
          documentHtml: docHtml || null,
          documentName: row.formName,
          signatures: [],
          loading: false,
          error: null,
        });
        return;
      }
      const { data: sigRow } = await supabase
        .schema("common")
        .from("e_signatures")
        .select("signature_image")
        .eq("id", row.id)
        .single();
      const { data: offer } = await supabase
        .schema("common")
        .from("offers")
        .select("offer_letter_content, custom_fields")
        .eq("id", row.formId)
        .single();
      const docUrl = (offer as any)?.custom_fields?.document_url ?? null;
      const docHtml = (offer as any)?.offer_letter_content ?? null;
      const sigs: DetailSignatures[] = [];
      if ((sigRow as any)?.signature_image) {
        sigs.push({
          field_name: "Signature",
          signature_image: (sigRow as any).signature_image,
        });
      }
      setDetail({
        documentUrl: docUrl || null,
        documentHtml: docHtml || null,
        documentName: row.formName,
        signatures: sigs,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setDetail({
        ...initialDetail,
        error: e?.message || "Failed to load details",
        loading: false,
      });
    }
  }, []);

  useEffect(() => {
    if (selectedRow) loadDetail(selectedRow);
    else setDetail(initialDetail);
  }, [selectedRow, loadDetail]);

  async function loadAuditData() {
    try {
      setLoading(true);
      const auditRows: AuditRow[] = [];

      // 1. Onboarding e-sign forms (forms + submissions)
      const forms = await onboardingService.getESignForms({});
      for (const form of forms) {
        const submissions = await onboardingService.getESignSubmissions(
          form.id,
        );
        for (const s of submissions) {
          auditRows.push({
            id: s.id,
            formId: form.id,
            formName: form.name,
            formType: form.form_type || "standard",
            source: "onboarding",
            signerName: s.signer_name,
            signerEmail: s.signer_email,
            status: s.status,
            signedAt: s.signed_at || null,
            ipAddress: s.ip_address || null,
            createdAt: s.created_at,
          });
        }
      }

      // 2. Offer e-signatures (Offers tab)
      const { data: offerSigs, error: sigError } = await supabase
        .schema("common")
        .from("e_signatures")
        .select(
          "id, offer_id, signer_type, signer_email, signer_name, ip_address, signed_at, created_at, offers(position_title)",
        )
        .order("created_at", { ascending: false });

      if (!sigError && offerSigs?.length) {
        for (const row of offerSigs as any[]) {
          const offer = row.offers;
          const docName = offer?.position_title
            ? `Offer: ${offer.position_title}`
            : `Offer ${row.offer_id?.slice(0, 8) || ""}`;
          auditRows.push({
            id: row.id,
            formId: row.offer_id,
            formName: docName,
            formType: "Offer",
            source: "offers",
            signerName: row.signer_name || "—",
            signerEmail: row.signer_email || "—",
            status: row.signed_at ? "signed" : "pending",
            signedAt: row.signed_at || null,
            ipAddress: row.ip_address || null,
            createdAt: row.created_at,
          });
        }
      }

      // 3. Packet document signatures (New Hire Packets – Sign and Send)
      const packetSigs = await onboardingService.getPacketDocumentSignatures();
      for (const s of packetSigs) {
        auditRows.push({
          id: s.id,
          formId: s.packet_id,
          formName: `Packet doc: ${s.document_name}`,
          formType: "Packet document",
          source: "packet_doc",
          signerName: s.signer_name,
          signerEmail: s.signer_email,
          status: "signed",
          signedAt: s.signed_at || null,
          ipAddress: null,
          createdAt: s.created_at,
        });
      }

      // 4. Offer letter signatures stored on the offer itself (when no e_signatures row)
      const { data: offersWithSignature } = await supabase
        .schema("common")
        .from("offers")
        .select("id, position_title, signature_status, signed_at, updated_at")
        .not("signed_at", "is", null);

      if (offersWithSignature?.length) {
        const seenOfferIds = new Set(
          (offerSigs || []).map((r: any) => r.offer_id),
        );
        for (const o of offersWithSignature as any[]) {
          if (seenOfferIds.has(o.id)) continue;
          auditRows.push({
            id: `offer-${o.id}`,
            formId: o.id,
            formName: `Offer: ${o.position_title || "Offer"}`,
            formType: "Offer",
            source: "offers",
            signerName: "—",
            signerEmail: "—",
            status: o.signature_status || "signed",
            signedAt: o.signed_at || null,
            ipAddress: null,
            createdAt: o.signed_at || o.updated_at,
          });
        }
      }

      auditRows.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setRows(auditRows);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Error",
        description: e?.message || "Failed to load e-sign audit data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (dateFrom && r.created_at < dateFrom) return false;
    if (dateTo && r.created_at > dateTo + "T23:59:59.999Z") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.formName.toLowerCase().includes(q) ||
        r.formType.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.signerName.toLowerCase().includes(q) ||
        r.signerEmail.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";

  const handleExport = () => {
    const headers = [
      "Source",
      "Document",
      "Type",
      "Signer",
      "Email",
      "Status",
      "Signed At",
      "Created At",
      "IP Address",
    ];
    const csvRows = filteredRows.map((r) =>
      [
        r.source,
        r.formName,
        r.formType,
        r.signerName,
        r.signerEmail,
        r.status,
        formatDate(r.signedAt),
        formatDate(r.createdAt),
        r.ipAddress || "",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `e-sign-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "Exported", description: "Audit CSV download started." });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            E-Sign Recordkeeping
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            Audit trail of all HR e-signatures: Onboarding / Document
            Acknowledgment and Offers.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={filteredRows.length === 0} leftIcon={<Download className="h-4 w-4" />}>
          Export audit log
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>
            Filter by status, date range, or search
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "signed", "pending", "declined"] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-auto"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-auto"
              />
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search document or signer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Audit log
          </CardTitle>
          <CardDescription>
            {filteredRows.length} record{filteredRows.length !== 1 ? "s" : ""}{" "}
            (retention for compliance as per your policy)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No e-sign records found. Records appear when forms are signed via
              Onboarding E-Sign Forms, Document Acknowledgment, or Offers.
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-none">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Source</th>
                    <th className="text-left p-3 font-medium">Document</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Signer</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Signed at</th>
                    <th className="text-left p-3 font-medium">Created</th>
                    <th className="text-left p-3 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelectedRow(r)}
                    >
                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-none px-2 py-0.5 text-xs font-medium ${
                            r.source === "offers"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                              : "bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200"
                          }`}
                        >
                          {r.source === "offers" ? "Offers" : "Onboarding"}
                        </span>
                      </td>
                      <td className="p-3 font-medium">{r.formName}</td>
                      <td className="p-3 text-muted-foreground">
                        {r.formType}
                      </td>
                      <td className="p-3">
                        <div>{r.signerName}</div>
                        <div className="text-muted-foreground text-xs">
                          {r.signerEmail}
                        </div>
                      </td>
                      <td className="p-3">
                        <span
                          className={
                            r.status === "signed"
                              ? "text-green-600 dark:text-green-400"
                              : r.status === "declined"
                                ? "text-red-600 dark:text-red-400"
                                : "text-amber-600 dark:text-amber-400"
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {formatDate(r.signedAt)}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">
                        {r.ipAddress || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!selectedRow}
        onOpenChange={(open) => !open && setSelectedRow(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRow?.formName || "E-Sign details"}
            </DialogTitle>
            <DialogDescription>
              {selectedRow && (
                <>
                  {selectedRow.signerName} · {selectedRow.signerEmail}
                  {selectedRow.signedAt &&
                    ` · Signed ${formatDate(selectedRow.signedAt)}`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {detail.loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detail.error ? (
            <p className="text-destructive py-4">{detail.error}</p>
          ) : (
            <div className="grid gap-6 overflow-auto min-h-0">
              {/* Document */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Document
                </h3>
                {detail.documentUrl ? (
                  <div className="border rounded-none overflow-hidden bg-muted/30 min-h-[320px]">
                    <iframe
                      src={detail.documentUrl}
                      title={detail.documentName}
                      className="w-full h-[420px] border-0"
                    />
                  </div>
                ) : detail.documentHtml ? (
                  <div
                    className="border rounded-none p-4 bg-white dark:bg-neutral-900 max-h-[420px] overflow-auto prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: detail.documentHtml }}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm py-4">
                    No document available for this record.
                  </p>
                )}
              </div>
              {/* Signatures */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <PenLine className="h-4 w-4" />
                  Signature(s)
                </h3>
                {detail.signatures.length > 0 ? (
                  <div className="flex flex-wrap gap-4">
                    {detail.signatures.map((sig, idx) =>
                      sig.signature_image ? (
                        <div
                          key={idx}
                          className="border rounded-none p-3 bg-white dark:bg-neutral-900"
                        >
                          {sig.field_name && (
                            <p className="text-xs text-muted-foreground mb-1">
                              {sig.field_name}
                            </p>
                          )}
                          <img
                            src={sig.signature_image}
                            alt={sig.field_name || "Signature"}
                            className="max-h-24 w-auto border-b border-neutral-200 dark:border-neutral-700"
                          />
                        </div>
                      ) : null,
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm py-2">
                    No signature image on file for this record.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
