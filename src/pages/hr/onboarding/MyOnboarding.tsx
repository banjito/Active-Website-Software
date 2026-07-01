import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import {
  FileText,
  Eye,
  Download,
  ExternalLink,
  Loader2,
  PenTool,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Folder,
  CheckCircle,
  FileSignature,
  CheckSquare,
  Calendar,
  Laptop,
  Briefcase,
  Users,
} from "lucide-react";
import {
  onboardingService,
  OnboardingTrackingRecord,
  NewHirePacket,
  Checklist,
  ChecklistAssignment,
} from "../../../services/hr/onboardingService";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";

type DocItem = {
  name: string;
  file_url?: string;
  file_path?: string;
  required?: boolean;
  order?: number;
  requires_signature?: boolean;
};

export const MyOnboarding: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const signFormBase = "/hr/onboarding/sign-form";
  const [list, setList] = useState<OnboardingTrackingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [packetDetailOpen, setPacketDetailOpen] = useState(false);
  const [selectedPacket, setSelectedPacket] = useState<NewHirePacket | null>(
    null,
  );
  const [packetLoading, setPacketLoading] = useState(false);
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocItem | null>(
    null,
  );
  const [documentLoading, setDocumentLoading] = useState(true);
  const [documentError, setDocumentError] = useState(false);
  const [signatureSectionCollapsed, setSignatureSectionCollapsed] =
    useState(false);
  const [sendingSignature, setSendingSignature] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);
  const [packetSignatures, setPacketSignatures] = useState<
    Array<{ packet_id: string; document_name: string; signer_email: string }>
  >([]);
  const [packetFullySigned, setPacketFullySigned] = useState<
    Record<string, boolean>
  >({});
  const [packetSignatureCounts, setPacketSignatureCounts] = useState<
    Record<string, { signed: number; total: number }>
  >({});
  const [formSignedByMe, setFormSignedByMe] = useState<Record<string, boolean>>(
    {},
  );
  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [checklistDetail, setChecklistDetail] = useState<Checklist | null>(
    null,
  );
  const [checklistAssignment, setChecklistAssignment] =
    useState<ChecklistAssignment | null>(null);
  const [checklistModalLoading, setChecklistModalLoading] = useState(false);
  const [checklistSaving, setChecklistSaving] = useState(false);

  useEffect(() => {
    if (!user?.email && !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [byEmail, byUserId] = await Promise.all([
          user?.email
            ? onboardingService.getOnboardingTrackingForCandidateEmail(
                user.email,
              )
            : [],
          user?.id
            ? onboardingService.getOnboardingTrackingForUserId(user.id)
            : [],
        ]);
        const seen = new Set<string>();
        const merged = [...byEmail, ...byUserId].filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
        merged.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        if (!cancelled) setList(merged);
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Error",
            description: "Failed to load your onboarding tasks.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.id]);

  // Compute which packets are fully signed and X/Y document counts for list
  useEffect(() => {
    if (!list.length || !user?.email) return;
    const packetIds = [
      ...new Set(
        list.flatMap((r) => (r.assigned_packets || []).map((p) => p.id)),
      ),
    ];
    if (packetIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const nextSigned: Record<string, boolean> = {};
      const nextCounts: Record<string, { signed: number; total: number }> = {};
      await Promise.all(
        packetIds.map(async (packetId) => {
          if (cancelled) return;
          try {
            const [packet, sigs] = await Promise.all([
              onboardingService.getPacketById(packetId),
              onboardingService.getPacketDocumentSignatures(packetId),
            ]);
            const docs = (packet?.documents || []) as DocItem[];
            const signableDocs = docs.filter((d) => d.requires_signature);
            const total = signableDocs.length;
            if (total === 0) {
              nextSigned[packetId] = true;
              nextCounts[packetId] = { signed: 0, total: 0 };
              return;
            }
            const signedByMe = sigs.filter(
              (s: any) =>
                s.signer_email === user?.email && s.packet_id === packetId,
            );
            const signedNames = new Set(
              signedByMe.map((s: any) => s.document_name),
            );
            const signed = signableDocs.filter((d) =>
              signedNames.has(d.name || ""),
            ).length;
            nextSigned[packetId] = signed === total;
            nextCounts[packetId] = { signed, total };
          } catch {
            nextSigned[packetId] = false;
            nextCounts[packetId] = { signed: 0, total: 0 };
          }
        }),
      );
      if (!cancelled) {
        setPacketFullySigned((prev) => ({ ...prev, ...nextSigned }));
        setPacketSignatureCounts((prev) => ({ ...prev, ...nextCounts }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [list, user?.email]);

  // Compute which E-Sign forms current user has already signed
  useEffect(() => {
    if (!list.length || !user?.email) return;
    const formIds = [
      ...new Set(
        list.flatMap((r) => (r.assigned_forms || []).map((f) => f.id)),
      ),
    ];
    if (formIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, boolean> = {};
      await Promise.all(
        formIds.map(async (fid) => {
          if (cancelled) return;
          try {
            const subs = await onboardingService.getESignSubmissions(fid);
            next[fid] = subs.some(
              (s: any) =>
                s.signer_email === user?.email && s.status === "signed",
            );
          } catch {
            next[fid] = false;
          }
        }),
      );
      if (!cancelled) setFormSignedByMe((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [list, user?.email]);

  const openPacketDetail = async (packetId: string) => {
    setPacketLoading(true);
    setPacketDetailOpen(true);
    setSelectedPacket(null);
    setPacketSignatures([]);
    try {
      const [packet, sigs] = await Promise.all([
        onboardingService.getPacketById(packetId),
        onboardingService.getPacketDocumentSignatures(packetId),
      ]);
      setSelectedPacket(packet);
      setPacketSignatures(
        sigs.map((s: any) => ({
          packet_id: s.packet_id,
          document_name: s.document_name,
          signer_email: s.signer_email,
        })),
      );
    } catch {
      toast({
        title: "Error",
        description: "Could not load packet.",
        variant: "destructive",
      });
    } finally {
      setPacketLoading(false);
    }
  };

  const openChecklistModal = async (checklistId: string) => {
    if (!user?.id) {
      toast({
        title: "Sign in required",
        description: "Sign in with your ampOS account to complete checklists.",
        variant: "destructive",
      });
      return;
    }
    setChecklistModalOpen(true);
    setChecklistDetail(null);
    setChecklistAssignment(null);
    setChecklistModalLoading(true);
    try {
      const [checklist, assignments] = await Promise.all([
        onboardingService.getChecklistById(checklistId),
        onboardingService.getChecklistAssignments(user.id, checklistId),
      ]);
      if (!checklist) {
        toast({
          title: "Error",
          description: "Checklist not found.",
          variant: "destructive",
        });
        setChecklistModalOpen(false);
        return;
      }
      let assignment = assignments[0] ?? null;
      if (!assignment) {
        assignment = await onboardingService.createChecklistAssignment({
          checklist_id: checklistId,
          employee_id: user.id,
          assigned_by: user.id,
          items_completed: [],
          completion_percentage: 0,
          status: "not_started",
          assigned_at: new Date().toISOString(),
        } as any);
      }
      setChecklistDetail(checklist);
      setChecklistAssignment(assignment);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Could not load checklist.",
        variant: "destructive",
      });
      setChecklistModalOpen(false);
    } finally {
      setChecklistModalLoading(false);
    }
  };

  const toggleChecklistItem = async (itemId: string) => {
    if (!checklistAssignment || !checklistDetail || checklistSaving) return;
    const completed = (checklistAssignment.items_completed || []).some(
      (c) => c.item_id === itemId,
    );
    const items = checklistDetail.items || [];
    let newCompleted = completed
      ? checklistAssignment.items_completed.filter((c) => c.item_id !== itemId)
      : [
          ...(checklistAssignment.items_completed || []),
          {
            item_id: itemId,
            completed_by: user?.id,
            completed_at: new Date().toISOString(),
          },
        ];
    const completionPercentage = items.length
      ? Math.round((newCompleted.length / items.length) * 100)
      : 0;
    const status =
      newCompleted.length === items.length
        ? "completed"
        : newCompleted.length > 0
          ? "in_progress"
          : "not_started";
    setChecklistSaving(true);
    try {
      const updated = await onboardingService.updateChecklistAssignment(
        checklistAssignment.id,
        {
          items_completed: newCompleted,
          completion_percentage: completionPercentage,
          status,
          ...(status === "completed"
            ? { completed_at: new Date().toISOString() }
            : {}),
        } as any,
      );
      setChecklistAssignment(updated);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to update.",
        variant: "destructive",
      });
    } finally {
      setChecklistSaving(false);
    }
  };

  const isDocumentSigned = (documentName: string): boolean => {
    if (!user?.email || !selectedPacket?.id) return false;
    return packetSignatures.some(
      (s) =>
        s.packet_id === selectedPacket.id &&
        s.document_name === documentName &&
        s.signer_email === user.email,
    );
  };

  const openDocumentViewer = (doc: DocItem) => {
    setSelectedDocument(doc);
    setDocumentViewerOpen(true);
    setDocumentLoading(true);
    setDocumentError(false);
    setSignatureSectionCollapsed(false);
  };

  const closeDocumentViewer = () => {
    setDocumentViewerOpen(false);
    setSelectedDocument(null);
    setDocumentLoading(false);
    setDocumentError(false);
  };

  const getSignatureCoords = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!signatureCanvasRef.current) return { x: 0, y: 0 };
    const canvas = signatureCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startSignature = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!signatureCanvasRef.current) return;
    const ctx = signatureCanvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setIsDrawingSignature(true);
    const coords = getSignatureCoords(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const drawSignature = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawingSignature || !signatureCanvasRef.current) return;
    const ctx = signatureCanvasRef.current.getContext("2d");
    if (!ctx) return;
    const coords = getSignatureCoords(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopSignature = () => setIsDrawingSignature(false);

  const clearSignatureBox = () => {
    if (!signatureCanvasRef.current) return;
    const ctx = signatureCanvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(
      0,
      0,
      signatureCanvasRef.current.width,
      signatureCanvasRef.current.height,
    );
  };

  const hasSignatureDrawn = (): boolean => {
    if (!signatureCanvasRef.current) return false;
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  };

  const handleSignAndSend = async () => {
    if (!selectedDocument || !selectedPacket || !user) return;
    if (!hasSignatureDrawn()) {
      toast({
        title: "Signature required",
        description: "Please draw your signature in the box above.",
        variant: "destructive",
      });
      return;
    }
    if (!signatureCanvasRef.current) return;
    setSendingSignature(true);
    try {
      const signatureImage = signatureCanvasRef.current.toDataURL("image/png");
      const signerName =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email ||
        "Unknown";
      const signerEmail = user.email || "";
      await onboardingService.submitPacketDocumentSignature({
        packet_id: selectedPacket.id,
        document_name: selectedDocument.name,
        document_file_url: selectedDocument.file_url,
        signer_name: signerName,
        signer_email: signerEmail,
        signature_image: signatureImage,
      });
      toast({
        title: "Signed and sent",
        description:
          "Your signature has been recorded and will appear in E-Sign Recordkeeping.",
        variant: "success",
      });
      if (selectedPacket?.id && selectedDocument?.name && user?.email) {
        const newSig = {
          packet_id: selectedPacket.id,
          document_name: selectedDocument.name,
          signer_email: user.email,
        };
        setPacketSignatures((prev) => [...prev, newSig]);
        const signableDocs = (selectedPacket.documents || []).filter(
          (d: DocItem) => d.requires_signature,
        );
        const wouldBeSigs = [...packetSignatures, newSig].filter(
          (s) =>
            s.packet_id === selectedPacket.id && s.signer_email === user.email,
        );
        const signedNames = new Set(wouldBeSigs.map((s) => s.document_name));
        const allSigned = signableDocs.every((d: DocItem) =>
          signedNames.has(d.name || ""),
        );
        if (allSigned)
          setPacketFullySigned((prev) => ({
            ...prev,
            [selectedPacket.id]: true,
          }));
      }
      closeDocumentViewer();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to submit signature",
        variant: "destructive",
      });
    } finally {
      setSendingSignature(false);
    }
  };

  const handleDocumentDownload = (doc: DocItem) => {
    if (doc.file_url) {
      const link = document.createElement("a");
      link.href = doc.file_url;
      link.download = doc.name;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDocumentOpenInNewTab = (doc: DocItem) => {
    if (doc.file_url) window.open(doc.file_url, "_blank");
  };

  const isPdfFile = (url?: string) =>
    (url && url.toLowerCase().endsWith(".pdf")) || false;
  const isImageFile = (url?: string) =>
    (url && /\.(jpg|jpeg|png|gif|webp)$/i.test(url)) || false;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "Pending";
      case "in_progress":
        return "In progress";
      case "completed":
        return "Completed";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#f26722]" />
      </div>
    );
  }

  if (!list.length) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Your Onboarding
            </CardTitle>
            <CardDescription>
              Tasks and packets assigned to you for onboarding
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-neutral-600 dark:text-neutral-400">
              You don&apos;t have any onboarding tasks at this time.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
        <ClipboardList className="h-7 w-7" />
        Your Onboarding
      </h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Review and sign your new hire packets below. Signatures are stored with
        your packet and in E-Sign Recordkeeping.
      </p>

      {list.map((record) => (
        <Card key={record.id}>
          <CardHeader>
            <CardTitle>
              {record.offer?.position_title || "Onboarding"}
              {record.offer?.department && (
                <span className="text-base font-normal text-neutral-500 dark:text-neutral-400">
                  {" "}
                  — {record.offer.department}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Status:{" "}
              <span
                className={
                  record.status === "completed"
                    ? "text-green-600 dark:text-green-400"
                    : record.status === "in_progress"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-neutral-600 dark:text-neutral-400"
                }
              >
                {getStatusLabel(record.status)}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Your packets
            </p>
            {(record.assigned_packets?.length ?? 0) === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No packets assigned yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {record.assigned_packets!.map((p) => {
                  const counts = packetSignatureCounts[p.id];
                  const hasSignable = counts && counts.total > 0;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-none bg-neutral-50 dark:bg-neutral-800 gap-2"
                    >
                      <span className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2 min-w-0">
                        <Folder className="h-4 w-4 text-neutral-500 flex-shrink-0" />
                        {p.name}
                        {hasSignable && (
                          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                            {counts.signed}/{counts.total} documents signed
                          </span>
                        )}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => openPacketDetail(p.id)}
                        className="bg-[#f26722] hover:bg-[#f26722]/90 text-white flex-shrink-0"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        {packetFullySigned[p.id] ? "View" : "View & sign"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-4">
              Your E-Sign forms
            </p>
            {(record.assigned_forms?.length ?? 0) === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No E-Sign forms assigned yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {record.assigned_forms!.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between p-3 rounded-none bg-neutral-50 dark:bg-neutral-800 gap-2"
                  >
                    <span className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2 min-w-0">
                      <FileSignature className="h-4 w-4 text-neutral-500 flex-shrink-0" />
                      {f.name}
                      {formSignedByMe[f.id] && (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium flex-shrink-0">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Signed
                        </span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => navigate(`${signFormBase}/${f.id}`)}
                      className="bg-[#f26722] hover:bg-[#f26722]/90 text-white flex-shrink-0"
                    >
                      {formSignedByMe[f.id] ? (
                        <>
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </>
                      ) : (
                        <>
                          <PenTool className="h-4 w-4 mr-1" />
                          Sign
                        </>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-4">
              Your checklists
            </p>
            {(record.assigned_checklists?.length ?? 0) === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No checklists assigned yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {record.assigned_checklists!.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-none bg-neutral-50 dark:bg-neutral-800 gap-2"
                  >
                    <span className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-neutral-500" />
                      {c.name}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => openChecklistModal(c.id)}
                      className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-4">
              Your IT/Equipment tasks
            </p>
            {(record.assigned_it_tasks?.length ?? 0) === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No IT/Equipment tasks assigned yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {record.assigned_it_tasks!.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-none bg-neutral-50 dark:bg-neutral-800 gap-2"
                  >
                    <span className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                      <Laptop className="h-4 w-4 text-neutral-500 flex-shrink-0" />
                      {t.name}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-none shrink-0 ${
                        t.status === "completed"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : t.status === "in_progress"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            : "bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200"
                      }`}
                    >
                      {t.status === "in_progress"
                        ? "In progress"
                        : t.status === "completed"
                          ? "Completed"
                          : "Pending"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-4">
              Your Office Admin tasks
            </p>
            {(record.assigned_office_admin_tasks?.length ?? 0) === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No Office Admin tasks assigned yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {record.assigned_office_admin_tasks!.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-none bg-neutral-50 dark:bg-neutral-800 gap-2"
                  >
                    <span className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-neutral-500 flex-shrink-0" />
                      {t.name}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-none shrink-0 ${
                        t.status === "completed"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : t.status === "in_progress"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            : "bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200"
                      }`}
                    >
                      {t.status === "in_progress"
                        ? "In progress"
                        : t.status === "completed"
                          ? "Completed"
                          : "Pending"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-4">
              Your HR tasks
            </p>
            {(record.assigned_hr_tasks?.length ?? 0) === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No HR tasks assigned yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {record.assigned_hr_tasks!.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-none bg-neutral-50 dark:bg-neutral-800 gap-2"
                  >
                    <span className="text-sm font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                      <Users className="h-4 w-4 text-neutral-500 flex-shrink-0" />
                      {t.name}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-none shrink-0 ${
                        t.status === "completed"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : t.status === "in_progress"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            : "bg-neutral-100 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200"
                      }`}
                    >
                      {t.status === "in_progress"
                        ? "In progress"
                        : t.status === "completed"
                          ? "Completed"
                          : "Pending"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Checklist completion modal: view and check off items */}
      <Dialog
        open={checklistModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setChecklistModalOpen(false);
            setChecklistDetail(null);
            setChecklistAssignment(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              {checklistDetail?.name ?? "Checklist"}
            </DialogTitle>
            {checklistDetail?.description && (
              <DialogDescription>
                {checklistDetail.description}
              </DialogDescription>
            )}
          </DialogHeader>
          {checklistModalLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#f26722]" />
            </div>
          ) : checklistDetail && checklistAssignment ? (
            <div className="space-y-4 flex flex-col min-h-0 flex-1">
              <div className="flex-shrink-0 space-y-1">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {checklistAssignment.completion_percentage}% complete —{" "}
                  {checklistAssignment.items_completed?.length ?? 0} of{" "}
                  {(checklistDetail.items || []).length} items
                </p>
                {checklistAssignment.due_date && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    Due by{" "}
                    {new Date(checklistAssignment.due_date).toLocaleDateString(
                      undefined,
                      { dateStyle: "medium" },
                    )}
                  </p>
                )}
              </div>
              <ul className="space-y-2 overflow-y-auto flex-1 min-h-[240px] pr-1">
                {(checklistDetail.items || [])
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((item) => {
                    const isChecked = (
                      checklistAssignment.items_completed || []
                    ).some((c) => c.item_id === item.id);
                    const itemDueDate =
                      checklistAssignment.assigned_at && item.due_days != null
                        ? new Date(
                            new Date(
                              checklistAssignment.assigned_at,
                            ).getTime() +
                              item.due_days * 24 * 60 * 60 * 1000,
                          )
                        : null;
                    return (
                      <li
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleChecklistItem(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleChecklistItem(item.id);
                          }
                        }}
                        className={`flex items-start gap-3 p-3 rounded-none border transition-colors cursor-pointer hover:opacity-90 ${
                          isChecked
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                            : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700"
                        } ${checklistSaving ? "opacity-70 pointer-events-none" : ""}`}
                      >
                        <span className="mt-0.5 flex-shrink-0 rounded border-2 border-neutral-400 w-5 h-5 flex items-center justify-center bg-white dark:bg-neutral-900">
                          {isChecked && (
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm font-medium ${isChecked ? "text-neutral-500 dark:text-neutral-400 line-through" : "text-neutral-900 dark:text-white"}`}
                            >
                              {item.title}
                            </span>
                            {item.required && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                                Required
                              </span>
                            )}
                            {item.category && (
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                {item.category}
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1.5 whitespace-pre-wrap">
                              {item.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                            {itemDueDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                Due by{" "}
                                {itemDueDate.toLocaleDateString(undefined, {
                                  dateStyle: "medium",
                                })}
                              </span>
                            )}
                            {item.due_days != null && !itemDueDate && (
                              <span>
                                Due within {item.due_days} day
                                {item.due_days !== 1 ? "s" : ""} of start
                              </span>
                            )}
                            {item.assignee_type && (
                              <span>Assignee: {item.assignee_type}</span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
              </ul>
              {checklistAssignment.status === "completed" && (
                <p className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-2 flex-shrink-0">
                  <CheckCircle className="h-4 w-4" />
                  All items completed
                </p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setChecklistModalOpen(false);
                setChecklistDetail(null);
                setChecklistAssignment(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Packet detail modal: list documents, open viewer */}
      <Dialog open={packetDetailOpen} onOpenChange={setPacketDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedPacket?.name ?? "Packet"}</DialogTitle>
          </DialogHeader>
          {packetLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[#f26722]" />
            </div>
          ) : selectedPacket ? (
            <div className="space-y-3 overflow-y-auto">
              {(() => {
                const docs = selectedPacket.documents || [];
                const signableDocs = docs.filter(
                  (d: DocItem) => (d as DocItem).requires_signature,
                );
                const signedCount = signableDocs.filter((d: DocItem) =>
                  isDocumentSigned(d.name || ""),
                ).length;
                const signableTotal = signableDocs.length;
                return (
                  <>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {docs.length} document(s). Open each to view and sign if
                      required.
                      {signableTotal > 0 && (
                        <span className="ml-1 font-medium text-[#f26722]">
                          {signedCount}/{signableTotal} documents signed
                        </span>
                      )}
                    </p>
                    <div className="space-y-2">
                      {docs.map((doc: DocItem, index: number) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-3 border rounded-none hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                        >
                          <FileText className="h-5 w-5 text-neutral-400 flex-shrink-0" />
                          <span className="text-sm flex-1 font-medium">
                            {doc.name || "Unnamed Document"}
                          </span>
                          {(doc as DocItem).requires_signature &&
                            (isDocumentSigned(doc.name || "") ? (
                              <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-1 rounded flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Signed
                              </span>
                            ) : (
                              <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded flex items-center gap-1">
                                <PenTool className="h-3 w-3" />
                                Signature
                              </span>
                            ))}
                          {doc.file_url ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDocumentViewer(doc)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          ) : (
                            <span className="text-xs text-neutral-500">
                              No file
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Document viewer modal (read + sign) */}
      <Dialog
        open={documentViewerOpen}
        onOpenChange={(open) => !open && closeDocumentViewer()}
      >
        <DialogContent className="w-[75vw] max-w-none h-[95vh] max-h-[95vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
            <DialogTitle className="text-base">
              {selectedDocument?.name || "Document"}
            </DialogTitle>
          </DialogHeader>
          {selectedDocument?.file_url && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b bg-neutral-50 dark:bg-neutral-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-neutral-500" />
                  <span className="text-sm font-medium">
                    {selectedDocument.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDocumentOpenInNewTab(selectedDocument)}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open in New Tab
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDocumentDownload(selectedDocument)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
              <div className="flex-1 relative bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
                {documentLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 z-10">
                    <Loader2 className="w-8 h-8 text-[#f26722] animate-spin" />
                  </div>
                )}
                {documentError ? (
                  <div className="absolute inset-0 flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleDocumentOpenInNewTab(selectedDocument)
                      }
                    >
                      Open in New Tab
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDocumentDownload(selectedDocument)}
                    >
                      Download
                    </Button>
                  </div>
                ) : (
                  <>
                    {isPdfFile(selectedDocument.file_url) ? (
                      <iframe
                        src={`${selectedDocument.file_url}#toolbar=1&navpanes=1&scrollbar=1`}
                        className="w-full h-full border-0"
                        title={selectedDocument.name}
                        onLoad={() => setDocumentLoading(false)}
                        onError={() => {
                          setDocumentLoading(false);
                          setDocumentError(true);
                        }}
                      />
                    ) : isImageFile(selectedDocument.file_url) ? (
                      <div className="w-full h-full flex items-center justify-center p-2">
                        <img
                          src={selectedDocument.file_url}
                          alt={selectedDocument.name}
                          className="max-w-full max-h-full object-contain"
                          onLoad={() => setDocumentLoading(false)}
                          onError={() => {
                            setDocumentLoading(false);
                            setDocumentError(true);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center gap-3">
                        <Button
                          variant="outline"
                          onClick={() =>
                            handleDocumentOpenInNewTab(selectedDocument)
                          }
                        >
                          Open in New Tab
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            handleDocumentDownload(selectedDocument)
                          }
                        >
                          Download
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
              {selectedDocument.requires_signature && (
                <div className="flex-shrink-0 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
                  {selectedDocument.name &&
                  isDocumentSigned(selectedDocument.name) ? (
                    <div className="px-4 py-3 flex items-center gap-2 text-green-700 dark:text-green-300">
                      <CheckCircle className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm font-medium">Signed</span>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setSignatureSectionCollapsed(
                            !signatureSectionCollapsed,
                          )
                        }
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                      >
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          Signature
                        </span>
                        {signatureSectionCollapsed ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronUp className="h-4 w-4" />
                        )}
                      </button>
                      {!signatureSectionCollapsed && (
                        <div className="px-4 pb-4">
                          <div className="max-w-md">
                            <div className="border-2 border-neutral-300 dark:border-neutral-600 rounded-none overflow-hidden">
                              <canvas
                                ref={signatureCanvasRef}
                                width={400}
                                height={120}
                                className="block w-full cursor-crosshair touch-none border-0"
                                style={{ maxWidth: "100%", height: "120px" }}
                                onMouseDown={startSignature}
                                onMouseMove={drawSignature}
                                onMouseUp={stopSignature}
                                onMouseLeave={stopSignature}
                                onTouchStart={(e) => {
                                  e.preventDefault();
                                  startSignature(e);
                                }}
                                onTouchMove={(e) => {
                                  e.preventDefault();
                                  drawSignature(e);
                                }}
                                onTouchEnd={(e) => {
                                  e.preventDefault();
                                  stopSignature();
                                }}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={clearSignatureBox}
                              className="mt-2"
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {selectedDocument && !selectedDocument.file_url && (
            <div className="flex items-center justify-center p-8">
              <p className="text-neutral-500">
                No file available for this document.
              </p>
            </div>
          )}
          <DialogFooter className="px-4 pb-4 pt-2 flex-shrink-0 flex-row justify-between">
            <div>
              {selectedDocument?.requires_signature &&
                selectedPacket &&
                !(
                  selectedDocument.name &&
                  isDocumentSigned(selectedDocument.name)
                ) && (
                  <Button
                    onClick={handleSignAndSend}
                    disabled={sendingSignature}
                    size="sm"
                    className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                  >
                    {sendingSignature ? "Sending..." : "Sign and Send"}
                  </Button>
                )}
            </div>
            <Button variant="outline" onClick={closeDocumentViewer} size="sm">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
