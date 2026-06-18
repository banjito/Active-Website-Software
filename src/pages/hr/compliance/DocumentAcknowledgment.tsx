import React, { useState, useEffect, useRef } from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../../components/ui/Dialog";
import {
  FileCheck,
  Search,
  Download,
  Eye,
  Loader2,
  FileText,
  CheckCircle,
  Clock,
  Plus,
  Upload,
  ExternalLink,
  PenTool,
  Archive,
  Trash2,
  RotateCcw,
  Megaphone,
} from "lucide-react";
import {
  onboardingService,
  ESignForm,
  ESignSubmission,
} from "../../../services/hr/onboardingService";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/ui/toast";
import { SignatureFieldPosition } from "../../../components/pdf/PDFSignatureFieldPlacer";

const ANNOUNCEMENT_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "company", label: "Company News" },
  { value: "hr", label: "HR Update" },
  { value: "safety", label: "Safety" },
  { value: "policy", label: "Policy Change" },
  { value: "training", label: "Training" },
];

type DocFilter = "all" | "handbook" | "policy" | "agreement";
type DocTab = "active" | "archived";

const DOC_TYPES = [
  { value: "policy", label: "Policy" },
  { value: "standard", label: "Handbook" },
  { value: "agreement", label: "Agreement" },
] as const;

export const DocumentAcknowledgment: React.FC = () => {
  const { user } = useAuth();
  const userRole = user?.user_metadata?.role as string | undefined;
  const isManager =
    userRole === "Admin" || userRole === "Super Admin" || userRole === "HR Rep";
  const [forms, setForms] = useState<ESignForm[]>([]);
  const [submissionsByForm, setSubmissionsByForm] = useState<
    Record<string, ESignSubmission[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DocFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedFormId, setExpandedFormId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DocTab>("active");

  const [showAddModal, setShowAddModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    description: "",
    form_type: "policy" as "policy" | "standard" | "agreement",
    file: null as File | null,
    requiresSignature: true,
  });
  const [createAnnouncement, setCreateAnnouncement] = useState(false);
  const [announcementFields, setAnnouncementFields] = useState({
    content: "",
    category: "policy",
    is_published: true,
    scheduled_at: "",
  });

  const [showSignModal, setShowSignModal] = useState(false);
  const [formToSign, setFormToSign] = useState<ESignForm | null>(null);
  const [signatureData, setSignatureData] = useState("");
  const [signing, setSigning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const allForms = await onboardingService.getESignForms({});
      const policyTypes = allForms.filter(
        (f) =>
          f.requires_acknowledgment ||
          ["policy", "agreement", "standard"].includes(f.form_type || ""),
      );
      setForms(policyTypes);

      const subs: Record<string, ESignSubmission[]> = {};
      for (const form of policyTypes) {
        const subList = await onboardingService.getESignSubmissions(form.id);
        subs[form.id] = subList;
      }
      setSubmissionsByForm(subs);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Error",
        description: e?.message || "Failed to load document acknowledgments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const activeForms = forms.filter((f) => f.status !== "archived");
  const archivedForms = forms.filter((f) => f.status === "archived");

  // Non-managers can never view the Archived tab
  const effectiveTab: DocTab = !isManager ? "active" : activeTab;
  const baseForms = effectiveTab === "active" ? activeForms : archivedForms;

  const filteredForms = baseForms.filter((f) => {
    if (filter !== "all") {
      if (filter === "handbook" && f.form_type !== "standard") return false;
      if (filter === "policy" && f.form_type !== "policy") return false;
      if (filter === "agreement" && f.form_type !== "agreement") return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (f.name || "").toLowerCase().includes(q) ||
        (f.description || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    if (status === "signed")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
          <CheckCircle className="h-3 w-3" /> Signed
        </span>
      );
    if (status === "declined")
      return (
        <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
          Declined
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        <Clock className="h-3 w-3" /> Pending
      </span>
    );
  };

  const formatDate = (d: string | null | undefined) =>
    d
      ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" })
      : "—";

  const getAttachmentUrl = (form: ESignForm): string | null => {
    const docs = (form as any).custom_fields?.attached_documents;
    if (Array.isArray(docs) && docs[0]?.file_url) return docs[0].file_url;
    const match = (form.form_content || "").match(/href=["']([^"']+)["']/);
    return match ? match[1] : null;
  };

  const createLinkedAnnouncement = async (
    docName: string,
    docDescription: string,
    fileUrl: string,
  ) => {
    if (!user?.id || !createAnnouncement) return;
    try {
      const announcementContent =
        announcementFields.content.trim() ||
        `A new document "${docName}" has been uploaded and requires your acknowledgment. Please review and sign.`;
      const payload: any = {
        title: docName,
        content: announcementContent,
        excerpt:
          docDescription || `New document requires acknowledgment: ${docName}`,
        author_name: user.user_metadata?.name || user.email || "HR",
        author_id: user.id,
        category: announcementFields.category,
        is_pinned: false,
        is_published: announcementFields.is_published,
        published_at: announcementFields.scheduled_at
          ? new Date(announcementFields.scheduled_at).toISOString()
          : announcementFields.is_published
            ? new Date().toISOString()
            : null,
        expires_at: null,
        // Store the document link in content so portal can show it
      };
      // Append a document acknowledgment link marker to content so portal knows
      payload.content += `\n\n---\n📄 [View & Acknowledge Document](${fileUrl})`;

      const { error } = await supabase
        .schema("common")
        .from("announcements")
        .insert([payload]);
      if (error) throw error;
      toast({
        title: "Announcement created",
        description: "Announcement for this document has been published.",
        variant: "success",
      });
    } catch (err) {
      console.error("Error creating linked announcement:", err);
      toast({
        title: "Warning",
        description: "Document was saved but announcement creation failed.",
        variant: "destructive",
      });
    }
  };

  const createFormWithAttachment = async (
    pending: {
      name: string;
      description: string;
      form_type: string;
      file_url: string;
      file_path: string;
      file_name: string;
    },
    signatureFields?: SignatureFieldPosition[],
    requiresSignature: boolean = true,
  ) => {
    if (!user?.id) return;
    const docName = pending.name.trim();
    const docLinkHtml = `<p><a href="${pending.file_url}" target="_blank" rel="noopener noreferrer" class="text-[#f26722] underline">View attached document: ${pending.file_name}</a></p>`;
    const formContent = `<p>I acknowledge that I have read and received the document: <strong>${docName}</strong>.</p>${docLinkHtml}`;
    const attachedDoc: {
      name: string;
      file_url: string;
      file_path: string;
      signature_fields?: SignatureFieldPosition[];
    } = {
      name: pending.file_name,
      file_url: pending.file_url,
      file_path: pending.file_path,
    };
    if (signatureFields?.length) attachedDoc.signature_fields = signatureFields;
    const customFields = { attached_documents: [attachedDoc] };
    await onboardingService.createESignForm({
      name: docName,
      description: pending.description.trim() || undefined,
      form_type: pending.form_type as any,
      form_content: formContent,
      form_fields: [],
      signature_fields: requiresSignature
        ? [
            {
              name: "acknowledgment",
              label: "Signature",
              required: true,
              signer_type: "employee",
            },
          ]
        : [],
      status: "active",
      is_template: false,
      requires_acknowledgment: true,
      created_by: user.id,
      custom_fields: customFields as any,
    } as any);
  };

  const handleAddDocument = async () => {
    if (!user?.id) return;
    if (!addForm.name.trim()) {
      toast({
        title: "Error",
        description: "Enter a document name",
        variant: "destructive",
      });
      return;
    }
    if (!addForm.file) {
      toast({
        title: "Error",
        description: "Upload a document (e.g. PDF)",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const fileExt = addForm.file.name.split(".").pop() || "pdf";
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${fileExt}`;
      const filePath = `onboarding-documents/e-sign-forms/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, addForm.file, {
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error(
          uploadError.message ||
            'File upload failed. Check that the "documents" storage bucket exists and you have permission.',
        );
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("documents").getPublicUrl(filePath);

      await createFormWithAttachment(
        {
          name: addForm.name.trim(),
          description: addForm.description.trim(),
          form_type: addForm.form_type,
          file_url: publicUrl,
          file_path: filePath,
          file_name: addForm.file.name,
        },
        undefined,
        addForm.requiresSignature,
      );
      await createLinkedAnnouncement(
        addForm.name.trim(),
        addForm.description.trim(),
        publicUrl,
      );
      toast({
        title: "Success",
        description: "Document added. Employees can acknowledge it via e-sign.",
        variant: "success",
      });
      setShowAddModal(false);
      setAddForm({
        name: "",
        description: "",
        form_type: "policy",
        file: null,
        requiresSignature: true,
      });
      setCreateAnnouncement(false);
      setAnnouncementFields({
        content: "",
        category: "policy",
        is_published: true,
        scheduled_at: "",
      });
      loadData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to add document",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const openSignModal = (form: ESignForm) => {
    setFormToSign(form);
    setShowSignModal(true);
    setSignatureData("");
  };

  const startDrawing = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x =
      ("touches" in e
        ? e.touches[0].clientX - rect.left
        : e.clientX - rect.left) * scaleX;
    const y =
      ("touches" in e
        ? e.touches[0].clientY - rect.top
        : e.clientY - rect.top) * scaleY;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x =
      ("touches" in e
        ? e.touches[0].clientX - rect.left
        : e.clientX - rect.left) * scaleX;
    const y =
      ("touches" in e
        ? e.touches[0].clientY - rect.top
        : e.clientY - rect.top) * scaleY;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) setSignatureData(canvasRef.current.toDataURL());
  };

  const clearSignature = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx)
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setSignatureData("");
    }
  };

  const handleSubmitAcknowledgment = async () => {
    if (!formToSign || !user?.id) return;
    if (!signatureData) {
      toast({
        title: "Error",
        description: "Please sign in the box below",
        variant: "destructive",
      });
      return;
    }
    setSigning(true);
    try {
      const signerName =
        user.user_metadata?.name || user.email?.split("@")[0] || "Unknown";
      const signerEmail = user.email || "";
      await onboardingService.createESignSubmission({
        form_id: formToSign.id,
        signer_email: signerEmail,
        signer_name: signerName,
        signatures: [
          {
            field_name: "acknowledgment",
            signature_image: signatureData,
            signed_at: new Date().toISOString(),
          },
        ],
        form_data: {},
        status: "signed",
        signed_at: new Date().toISOString(),
      } as any);
      toast({
        title: "Success",
        description: "Acknowledgment recorded.",
        variant: "success",
      });
      setShowSignModal(false);
      setFormToSign(null);
      setSignatureData("");
      loadData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to submit",
        variant: "destructive",
      });
    } finally {
      setSigning(false);
    }
  };

  const handleArchiveDocument = async (formId: string) => {
    try {
      await onboardingService.updateESignForm(formId, { status: "archived" });
      toast({
        title: "Archived",
        description: "Document moved to the Archived tab.",
        variant: "success",
      });
      loadData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to archive document",
        variant: "destructive",
      });
    }
  };

  const handleRestoreDocument = async (formId: string) => {
    try {
      await onboardingService.updateESignForm(formId, { status: "active" });
      toast({
        title: "Restored",
        description: "Document restored to Active documents.",
        variant: "success",
      });
      loadData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to restore document",
        variant: "destructive",
      });
    }
  };

  const handleDeleteDocument = async (formId: string) => {
    if (
      !window.confirm(
        "Permanently delete this archived document? This cannot be undone.",
      )
    )
      return;
    try {
      await onboardingService.deleteESignForm(formId);
      toast({
        title: "Deleted",
        description: "Document permanently deleted.",
        variant: "success",
      });
      loadData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  const handleExport = () => {
    const rows: string[][] = [
      ["Document", "Type", "Signer", "Email", "Status", "Signed At"],
    ];
    filteredForms.forEach((form) => {
      const subs = submissionsByForm[form.id] || [];
      if (subs.length === 0) {
        rows.push([
          form.name,
          form.form_type || "—",
          "—",
          "—",
          "No submissions",
          "—",
        ]);
      } else {
        subs.forEach((s) => {
          rows.push([
            form.name,
            form.form_type || "—",
            s.signer_name,
            s.signer_email,
            s.status,
            formatDate(s.signed_at || undefined),
          ]);
        });
      }
    });
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `document-acknowledgments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "Exported", description: "CSV download started." });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">
            Document Acknowledgment
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Signed handbook and policy acknowledgments. Track who has
            acknowledged which documents.
          </p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <Button
              className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add document
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>
            Filter by document type or search by name
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "handbook", "policy", "agreement"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "primary" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Active / Archived tabs — Archived restricted to Admin / HR */}
      {isManager && (
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
          <button
            onClick={() => setActiveTab("active")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "active"
                ? "border-[#f26722] text-[#f26722]"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Active
            {!loading && (
              <span className="ml-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">
                {activeForms.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("archived")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "archived"
                ? "border-[#f26722] text-[#f26722]"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Archive className="h-3.5 w-3.5 inline mr-1.5" />
            Archived
            {!loading && (
              <span className="ml-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">
                {archivedForms.length}
              </span>
            )}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredForms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            {effectiveTab === "archived" ? (
              <>
                <Archive className="h-12 w-12 mx-auto text-zinc-400 dark:text-zinc-500 mb-4" />
                <p className="text-zinc-600 dark:text-zinc-400">
                  No archived documents. Documents you archive will appear here.
                </p>
              </>
            ) : (
              <>
                <FileCheck className="h-12 w-12 mx-auto text-zinc-400 dark:text-zinc-500 mb-4" />
                <p className="text-zinc-600 dark:text-zinc-400">
                  No acknowledgment documents yet. Click &quot;Add
                  document&quot; to upload a handbook or policy for employees to
                  acknowledge.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredForms.map((form) => {
            const submissions = submissionsByForm[form.id] || [];
            const signedCount = submissions.filter(
              (s) => s.status === "signed",
            ).length;
            const isExpanded = expandedFormId === form.id;

            return (
              <Card key={form.id}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => setExpandedFormId(isExpanded ? null : form.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0" />
                        {form.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {form.description || form.form_type || "Document"}
                      </CardDescription>
                      <p className="text-sm text-muted-foreground mt-2">
                        {signedCount} of {submissions.length} signed
                        {form.requires_acknowledgment &&
                          " (requires acknowledgment)"}
                      </p>
                      {getAttachmentUrl(form) && (
                        <a
                          href={getAttachmentUrl(form)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-[#f26722] hover:underline mt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View document
                        </a>
                      )}
                    </div>
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {effectiveTab === "active" && (
                        <>
                          {getAttachmentUrl(form) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openSignModal(form)}
                              className="text-[#f26722] border-[#f26722] hover:bg-[#f26722]/10"
                            >
                              <PenTool className="h-4 w-4 mr-1" />
                              Acknowledge
                            </Button>
                          )}
                          {isManager && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleArchiveDocument(form.id)}
                              title="Archive document"
                            >
                              <Archive className="h-4 w-4 text-zinc-500" />
                            </Button>
                          )}
                        </>
                      )}
                      {effectiveTab === "archived" && isManager && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestoreDocument(form.id)}
                            title="Restore document"
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(form.id)}
                            title="Permanently delete"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent>
                    {submissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        No acknowledgments recorded yet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-3 font-medium">
                                Signer
                              </th>
                              <th className="text-left p-3 font-medium">
                                Email
                              </th>
                              <th className="text-left p-3 font-medium">
                                Status
                              </th>
                              <th className="text-left p-3 font-medium">
                                Signed at
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {submissions.map((s) => (
                              <tr key={s.id} className="border-b last:border-0">
                                <td className="p-3">{s.signer_name}</td>
                                <td className="p-3 text-muted-foreground">
                                  {s.signer_email}
                                </td>
                                <td className="p-3">
                                  {getStatusBadge(s.status)}
                                </td>
                                <td className="p-3">
                                  {formatDate(s.signed_at)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Add document for acknowledgment</DialogTitle>
            <DialogDescription>
              Upload a handbook or policy (e.g. PDF). It will appear here and
              employees can e-sign to acknowledge.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="ack-name" className="text-sm font-medium">
                Document name *
              </label>
              <Input
                id="ack-name"
                value={addForm.name}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Employee Handbook 2024"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="ack-desc" className="text-sm font-medium">
                Description (optional)
              </label>
              <Input
                id="ack-desc"
                value={addForm.description}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Brief description"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="ack-type" className="text-sm font-medium">
                Type
              </label>
              <select
                id="ack-type"
                value={addForm.form_type}
                onChange={(e) =>
                  setAddForm((f) => ({
                    ...f,
                    form_type: e.target.value as typeof addForm.form_type,
                  }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Attachment *</label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) =>
                    setAddForm((f) => ({
                      ...f,
                      file: e.target.files?.[0] ?? null,
                    }))
                  }
                  className="cursor-pointer"
                />
                {addForm.file && (
                  <span
                    className="text-sm text-muted-foreground truncate max-w-[140px]"
                    title={addForm.file.name}
                  >
                    {addForm.file.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                PDF or Word. This is the document employees will acknowledge.
              </p>
            </div>

            {/* Requires Signature checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requires-sig"
                checked={addForm.requiresSignature}
                onChange={(e) =>
                  setAddForm((f) => ({
                    ...f,
                    requiresSignature: e.target.checked,
                  }))
                }
                className="h-4 w-4 text-[#f26722] focus:ring-[#f26722] border-zinc-300 rounded"
              />
              <label
                htmlFor="requires-sig"
                className="text-sm font-medium cursor-pointer"
              >
                Requires Signature
              </label>
              <span className="text-xs text-muted-foreground">
                {addForm.requiresSignature
                  ? "— Employees must sign to acknowledge"
                  : "— No signature needed"}
              </span>
            </div>

            {/* Create announcement toggle */}
            <div className="border-t pt-4 mt-2 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCreateAnnouncement(!createAnnouncement)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 ${
                    createAnnouncement
                      ? "bg-[#f26722]"
                      : "bg-zinc-300 dark:bg-zinc-600"
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      createAnnouncement ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
                <label
                  className="text-sm font-medium flex items-center gap-1.5 cursor-pointer"
                  onClick={() => setCreateAnnouncement(!createAnnouncement)}
                >
                  <Megaphone className="h-4 w-4 text-[#f26722]" />
                  Also create an announcement
                </label>
              </div>

              {createAnnouncement && (
                <div className="space-y-3 pl-1 border-l-2 border-[#f26722]/30 ml-4 pl-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Announcement message (optional)
                    </label>
                    <textarea
                      rows={2}
                      value={announcementFields.content}
                      onChange={(e) =>
                        setAnnouncementFields((prev) => ({
                          ...prev,
                          content: e.target.value,
                        }))
                      }
                      placeholder={`A new document "${addForm.name || "document"}" has been uploaded and requires your acknowledgment.`}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Category
                      </label>
                      <select
                        value={announcementFields.category}
                        onChange={(e) =>
                          setAnnouncementFields((prev) => ({
                            ...prev,
                            category: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {ANNOUNCEMENT_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Schedule (optional)
                      </label>
                      <input
                        type="datetime-local"
                        value={announcementFields.scheduled_at}
                        onChange={(e) =>
                          setAnnouncementFields((prev) => ({
                            ...prev,
                            scheduled_at: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ann-publish"
                      checked={announcementFields.is_published}
                      onChange={(e) =>
                        setAnnouncementFields((prev) => ({
                          ...prev,
                          is_published: e.target.checked,
                        }))
                      }
                      className="h-3.5 w-3.5 text-[#f26722] focus:ring-[#f26722] border-zinc-300 rounded"
                    />
                    <label
                      htmlFor="ann-publish"
                      className="text-xs text-zinc-600 dark:text-zinc-400"
                    >
                      Publish immediately
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddModal(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddDocument}
              disabled={uploading || !addForm.name.trim() || !addForm.file}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Add document
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Acknowledge / Sign modal: PDF viewer + signature pad */}
      {formToSign && (
        <Dialog
          open={showSignModal}
          onOpenChange={(open) => {
            if (!open) {
              setShowSignModal(false);
              setFormToSign(null);
              setSignatureData("");
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>Sign to acknowledge: {formToSign.name}</DialogTitle>
              <DialogDescription>
                Review the document below, then sign at the bottom.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
              {getAttachmentUrl(formToSign) && (
                <div className="border rounded-lg overflow-hidden flex-1 min-h-[280px] bg-zinc-100 dark:bg-zinc-900">
                  <iframe
                    title="Document"
                    src={getAttachmentUrl(formToSign)!}
                    className="w-full h-full min-h-[280px]"
                    style={{ minHeight: "320px" }}
                  />
                </div>
              )}
              <div className="space-y-2 shrink-0">
                <label className="text-sm font-medium">Your signature</label>
                <div className="border rounded-lg bg-white dark:bg-dark-150 p-2">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={120}
                    className="border border-zinc-300 dark:border-zinc-600 rounded w-full cursor-crosshair touch-none"
                    style={{ maxWidth: "100%", height: "120px" }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearSignature}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSignModal(false);
                  setFormToSign(null);
                  setSignatureData("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitAcknowledgment}
                disabled={!signatureData || signing}
              >
                {signing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Submit acknowledgment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
