import React, { useState, useEffect, useRef } from "react";
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
  FileCheck,
  CheckCircle,
  XCircle,
  PenTool,
  Download,
  Eye,
} from "lucide-react";
import {
  offersService,
  Offer,
  ESignature,
} from "../../../services/hr/offersService";
import { useAuth } from "../../../lib/AuthContext";
import { toast } from "../../../components/ui/toast";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const ESignatures: React.FC = () => {
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [signatures, setSignatures] = useState<ESignature[]>([]);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [signerType, setSignerType] = useState<"candidate" | "manager" | "hr">(
    "candidate",
  );
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await offersService.getAll();
      // Show all offers that can be signed or have been signed
      setOffers(
        data.filter(
          (o) =>
            o.status === "sent" ||
            o.status === "accepted" ||
            o.status === "approved" ||
            o.signature_status === "signed" ||
            o.signature_status === "pending",
        ),
      );
    } catch (error: any) {
      console.error("Error fetching offers:", error);
      toast({
        title: "Error",
        description: "Failed to load offers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSignatures = async (offerId: string) => {
    try {
      const data = await offersService.getSignaturesByOfferId(offerId);
      setSignatures(data);
    } catch (error: any) {
      console.error("Error fetching signatures:", error);
    }
  };

  const openSignModal = (
    offer: Offer,
    type: "candidate" | "manager" | "hr",
  ) => {
    setSelectedOffer(offer);
    setSignerType(type);
    if (type === "candidate" && offer.candidate) {
      setSignerName(
        `${offer.candidate.first_name} ${offer.candidate.last_name}`,
      );
      setSignerEmail(offer.candidate.email);
    } else {
      setSignerName(user?.user_metadata?.name || user?.email || "");
      setSignerEmail(user?.email || "");
    }
    setIsSignModalOpen(true);
    // Clear canvas
    setTimeout(() => {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height,
          );
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
        }
      }
    }, 100);
  };

  const openViewModal = async (offer: Offer) => {
    setSelectedOffer(offer);
    await fetchSignatures(offer.id);
    setIsViewModalOpen(true);
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

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x =
      "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y =
      "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
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
    const x =
      "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y =
      "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      setSignatureData(canvasRef.current.toDataURL());
    }
  };

  const clearSignature = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        setSignatureData("");
      }
    }
  };

  const handleSubmitSignature = async () => {
    if (!selectedOffer || !signatureData || !signerName || !signerEmail) {
      toast({
        title: "Error",
        description: "Please provide all required information and sign",
        variant: "destructive",
      });
      return;
    }

    try {
      const signatureInfo = {
        signer_id:
          signerType === "candidate" ? selectedOffer.candidate_id : user?.id,
        signer_email: signerEmail,
        signer_name: signerName,
        signature_image: signatureData,
        signature_data: {
          signedAt: new Date().toISOString(),
          signerType,
          ipAddress: "N/A", // Could get from request if available
          userAgent: navigator.userAgent,
        },
        ip_address: "N/A",
        user_agent: navigator.userAgent,
      };

      await offersService.createSignature(
        selectedOffer.id,
        signerType,
        signatureInfo,
      );

      // If candidate signed, update offer status
      if (signerType === "candidate") {
        await offersService.updateStatus(selectedOffer.id, "accepted");
      }

      toast({
        title: "Success",
        description: "Signature recorded successfully",
        variant: "success",
      });
      setIsSignModalOpen(false);
      setSignatureData("");
      setSignerName("");
      setSignerEmail("");
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record signature",
        variant: "destructive",
      });
    }
  };

  const pendingSignatures = offers.filter(
    (o) => o.status === "sent" && o.signature_status === "pending",
  );
  const signedOffers = offers.filter(
    (o) => o.signature_status === "signed" || o.status === "accepted",
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            E-Signatures
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            Electronic signature acceptance for offer letters
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Pending Signatures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {pendingSignatures.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Signed Offers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {signedOffers.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Signatures */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Signatures</CardTitle>
          <CardDescription>
            Offers waiting for electronic signature
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingSignatures.length === 0 ? (
            <div className="text-center py-12">
              <FileCheck className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">
                No pending signatures
              </h3>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingSignatures.map((offer) => (
                <div
                  key={offer.id}
                  className="flex items-center justify-between p-4 border border-neutral-200 dark:border-neutral-700 rounded-none hover:bg-neutral-50 dark:hover:bg-dark-100"
                >
                  <div className="flex-1">
                    <div className="font-medium text-neutral-900 dark:text-white">
                      {offer.candidate
                        ? `${offer.candidate.first_name} ${offer.candidate.last_name}`
                        : "Unknown Candidate"}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      {offer.position_title} - {offer.department}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                      Sent:{" "}
                      {offer.sent_date
                        ? new Date(offer.sent_date).toLocaleDateString()
                        : "N/A"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewModal(offer)} leftIcon={<Eye className="h-4 w-4" />}>
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openSignModal(offer, "candidate")}
                      className="bg-brand hover:bg-brand/90 text-white" leftIcon={<PenTool className="h-4 w-4" />}>
                      Sign as Candidate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signed Offers */}
      <Card>
        <CardHeader>
          <CardTitle>Signed Offers</CardTitle>
          <CardDescription>
            Offers that have been electronically signed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {signedOffers.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">
                No signed offers
              </h3>
            </div>
          ) : (
            <div className="space-y-3">
              {signedOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="flex items-center justify-between p-4 border border-neutral-200 dark:border-neutral-700 rounded-none hover:bg-neutral-50 dark:hover:bg-dark-100"
                >
                  <div className="flex-1">
                    <div className="font-medium text-neutral-900 dark:text-white">
                      {offer.candidate
                        ? `${offer.candidate.first_name} ${offer.candidate.last_name}`
                        : "Unknown Candidate"}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      {offer.position_title} - {offer.department}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                      Signed:{" "}
                      {offer.signed_at
                        ? new Date(offer.signed_at).toLocaleDateString()
                        : "N/A"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewModal(offer)} leftIcon={<Eye className="h-4 w-4" />}>
                      View Signatures
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sign Modal */}
      <Dialog open={isSignModalOpen} onOpenChange={setIsSignModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Electronic Signature</DialogTitle>
            <DialogDescription>
              Sign the offer letter electronically. Draw your signature in the
              box below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Signer Name *
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Signer Email *
                </label>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-none bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Signature *
              </label>
              <div className="border-2 border-neutral-300 dark:border-neutral-600 rounded-none p-4 bg-white dark:bg-neutral-800">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  className="border border-neutral-200 dark:border-neutral-700 rounded cursor-crosshair w-full"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSignature}
                className="mt-2"
              >
                Clear Signature
              </Button>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              By signing, you acknowledge that you have read and agree to the
              terms of this offer letter.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitSignature}
              className="bg-brand hover:bg-brand/90 text-white"
              disabled={!signatureData || !signerName || !signerEmail}
            >
              Submit Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Signatures Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Signed Offer Letter</DialogTitle>
            <DialogDescription>
              {selectedOffer && selectedOffer.candidate
                ? `Signed offer letter for ${selectedOffer.candidate.first_name} ${selectedOffer.candidate.last_name}`
                : "View signed offer letter"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {selectedOffer && (
              <>
                {/* Offer Letter Header */}
                <div className="flex justify-between items-start pb-4 border-b-2 border-neutral-300">
                  <div>
                    <img
                      src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/AMP%20Logo-FdmXGeXuGBlr2AcoAFFlM8AqzmoyM1.png"
                      alt="AMP Logo"
                      className="h-16"
                    />
                  </div>
                  <div className="text-right">
                    <h1 className="text-2xl font-bold tracking-wide">
                      OFFER LETTER
                    </h1>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                      {selectedOffer.offer_date
                        ? new Date(selectedOffer.offer_date).toLocaleDateString(
                            "en-US",
                            { year: "numeric", month: "long", day: "numeric" },
                          )
                        : new Date().toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                    </p>
                  </div>
                </div>

                {/* Offer Letter Content */}
                <div
                  className="prose max-w-none dark:prose-invert text-neutral-900 dark:text-neutral-100"
                  dangerouslySetInnerHTML={{
                    __html:
                      selectedOffer.offer_letter_content ||
                      "<p>No offer content available</p>",
                  }}
                />

                {/* Signature Section */}
                {signatures.length > 0 && (
                  <div className="mt-8 pt-6 border-t-2 border-neutral-300">
                    <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white">
                      Electronic Signature
                    </h2>
                    {signatures.map((signature) => (
                      <div
                        key={signature.id}
                        className="mb-6 p-4 border border-neutral-200 dark:border-neutral-700 rounded-none bg-neutral-50 dark:bg-neutral-800"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-medium text-neutral-900 dark:text-white">
                              {signature.signer_name}
                            </div>
                            <div className="text-sm text-neutral-600 dark:text-neutral-400">
                              {signature.signer_email}
                            </div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                              Signed as:{" "}
                              {signature.signer_type.charAt(0).toUpperCase() +
                                signature.signer_type.slice(1)}
                            </div>
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-500">
                            {signature.signed_at
                              ? new Date(signature.signed_at).toLocaleString()
                              : "N/A"}
                          </div>
                        </div>
                        {signature.signature_image && (
                          <div className="mt-3 border-2 border-neutral-300 dark:border-neutral-600 rounded-none p-4 bg-white dark:bg-neutral-900">
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                              Signature:
                            </div>
                            <img
                              src={signature.signature_image}
                              alt="Signature"
                              className="max-w-full h-auto"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {signatures.length === 0 && (
                  <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 border-t-2 border-neutral-300 mt-8 pt-6">
                    No signatures recorded yet.
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
