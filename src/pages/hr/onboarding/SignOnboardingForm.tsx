import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import {
  onboardingService,
  ESignForm,
} from "../../../services/hr/onboardingService";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { Loader2, PenTool, ArrowLeft, CheckCircle } from "lucide-react";

function getAttachmentUrl(form: ESignForm): string | null {
  const docs = (form as any).custom_fields?.attached_documents;
  if (Array.isArray(docs) && docs[0]?.file_url) return docs[0].file_url;
  const match = (form.form_content || "").match(/href=["']([^"']+)["']/);
  return match ? match[1] : null;
}

export const SignOnboardingForm: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<ESignForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState("");
  const [signing, setSigning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const backPath = "/hr/onboarding/your-onboarding";

  useEffect(() => {
    if (!formId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [f, subs] = await Promise.all([
          onboardingService.getESignFormById(formId),
          onboardingService.getESignSubmissions(formId),
        ]);
        if (!cancelled && f) {
          setForm(f);
          const mySigned = subs.find(
            (s: any) => s.signer_email === user?.email && s.status === "signed",
          );
          if (mySigned) {
            setAlreadySigned(true);
            setSignedAt(mySigned.signed_at || mySigned.created_at || null);
          }
        }
      } catch {
        if (!cancelled)
          toast({
            title: "Error",
            description: "Form not found.",
            variant: "destructive",
          });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formId, user?.email]);

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

  const handleSubmit = async () => {
    if (!form || !user?.id) return;
    if (!signatureData) {
      toast({
        title: "Error",
        description: "Please sign in the box below.",
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
        form_id: form.id,
        signer_email: signerEmail,
        signer_name: signerName,
        signatures: [
          {
            field_name: "signature",
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
        description: "Form signed and recorded.",
        variant: "success",
      });
      navigate(backPath);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to submit.",
        variant: "destructive",
      });
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#f26722]" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate(backPath)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Your Onboarding
        </Button>
        <p className="text-neutral-600 dark:text-neutral-400">
          Form not found.
        </p>
      </div>
    );
  }

  const attachmentUrl = getAttachmentUrl(form);
  const hasFormContent = form.form_content?.trim();
  const hasFormFields =
    Array.isArray(form.form_fields) && form.form_fields.length > 0;
  const signedDate = signedAt
    ? new Date(signedAt).toLocaleDateString(undefined, { dateStyle: "medium" })
    : "";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Button variant="outline" onClick={() => navigate(backPath)}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Your Onboarding
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{form.name}</CardTitle>
          {form.description && (
            <CardDescription>{form.description}</CardDescription>
          )}
          {alreadySigned && (
            <p className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-2 mt-2">
              <CheckCircle className="h-4 w-4" />
              You signed this{signedDate ? ` on ${signedDate}` : ""}.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {attachmentUrl && (
            <div className="border rounded-none overflow-hidden bg-neutral-100 dark:bg-neutral-900">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
                Attached document
              </p>
              <iframe
                title="Document"
                src={attachmentUrl}
                className="w-full border-0"
                style={{ minHeight: "420px" }}
              />
            </div>
          )}
          {hasFormContent && (
            <div className="rounded-none border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-4 max-h-[400px] overflow-y-auto">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Form content
              </p>
              <div
                className="text-sm text-neutral-900 dark:text-white prose prose-sm dark:prose-invert max-w-none prose-p:my-1"
                dangerouslySetInnerHTML={{ __html: form.form_content }}
              />
            </div>
          )}
          {hasFormFields && (
            <div className="rounded-none border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-4">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Form fields
              </p>
              <ul className="space-y-2 text-sm text-neutral-900 dark:text-white">
                {form.form_fields.map((field, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-medium">{field.label}</span>
                    {field.required && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        (required)
                      </span>
                    )}
                    <span className="text-neutral-500 dark:text-neutral-400">
                      — {field.type}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!hasFormContent && !hasFormFields && !attachmentUrl && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No form content or document attached. You can still sign below to
              acknowledge.
            </p>
          )}
          {!alreadySigned && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Your signature
                </label>
                <div className="border rounded-none bg-white dark:bg-dark-150 p-2">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={120}
                    className="border border-neutral-300 dark:border-neutral-600 rounded w-full cursor-crosshair touch-none"
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
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate(backPath)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!signatureData || signing}
                  className="bg-[#f26722] hover:bg-[#f26722]/90 text-white"
                >
                  {signing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <PenTool className="h-4 w-4 mr-2" />
                  )}
                  Submit signature
                </Button>
              </div>
            </>
          )}
          {alreadySigned && (
            <Button variant="outline" onClick={() => navigate(backPath)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Your Onboarding
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
