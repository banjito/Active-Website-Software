/**
 * Public page where a customer reads and signs a Change Order letter.
 * Route: /sign-change-order/:token (no login). The link's secret is the only key;
 * all reads and writes go through the change-order-signature edge function.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { Check, Eraser, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  declineChangeOrder,
  signChangeOrder,
  viewChangeOrderSigning,
  type SigningView,
} from "@/services/changeOrderSignatureService";

const money = (n: number | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PRINT_CSS = `
@media print {
  .co-sign-noprint { display: none !important; }
  .co-sign-page { background: #fff !important; padding: 0 !important; }
  .co-sign-sheet { border: 0 !important; box-shadow: none !important; }
  input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  select { appearance: none; -webkit-appearance: none; }
}`;

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    inked.current = true;
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(inked.current ? canvasRef.current!.toDataURL("image/png") : null);
  };

  const clear = () => {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    inked.current = false;
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={160}
        aria-label="Draw your signature"
        className="block h-40 w-full touch-none rounded-none border border-neutral-300 bg-white dark:border-neutral-600"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div className="mt-1 flex justify-end">
        <Button variant="ghost" size="sm" leftIcon={<Eraser className="h-4 w-4" />} onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

export default function PublicChangeOrderSigning() {
  const { token = "" } = useParams<{ token: string }>();
  const [view, setView] = useState<SigningView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<"signed" | "declined" | null>(null);

  const load = () =>
    viewChangeOrderSigning(token)
      .then((v) => {
        setView(v);
        setName((n) => n || v.signerName || "");
      })
      .catch((e) => setLoadError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const letterHtml = useMemo(
    () => (view ? DOMPurify.sanitize(view.letterHtml, { USE_PROFILES: { html: true } }) : ""),
    [view],
  );

  const sign = async () => {
    setFormError(null);
    if (!name.trim()) return setFormError("Type your full name.");
    if (!signature) return setFormError("Draw your signature in the box.");
    if (!consent) return setFormError("Check the box to agree to sign electronically.");
    setBusy(true);
    try {
      await signChangeOrder(token, name.trim(), signature);
      setDone("signed");
      await load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await declineChangeOrder(token, reason.trim());
      setDone("declined");
      await load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-dark-background">
        <div className="max-w-md rounded-none border border-neutral-200 bg-white p-6 text-center dark:border-neutral-700 dark:bg-dark-150">
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">This link can't be opened</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-dark-background">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  const heading = `Change Order ${view.changeOrderNumber}${view.jobNumber ? ` on Job ${view.jobNumber}` : ""}`;
  const signedOn = view.signedAt
    ? new Date(view.signedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "";

  return (
    <div className="co-sign-page min-h-screen bg-neutral-50 px-4 py-8 dark:bg-dark-background">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="co-sign-noprint">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{view.companyName}</p>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">{heading}</h1>
          <p className="mt-1 text-neutral-700 dark:text-neutral-300">
            {view.title} · <b>{money(view.amount)}</b>
            {view.jobTitle ? ` · ${view.jobTitle}` : ""}
          </p>
        </div>

        {done === "signed" && (
          <div className="co-sign-noprint rounded-none border border-green-300 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            Signed. A copy is on its way to your email. You can also print or save it below.
          </div>
        )}
        {done === "declined" && (
          <div className="co-sign-noprint rounded-none border border-neutral-300 bg-white p-4 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-dark-150 dark:text-neutral-200">
            Declined. We let your contact know.
          </div>
        )}

        <div className="co-sign-sheet rounded-none border border-neutral-200 bg-white p-6 text-black shadow-sm dark:border-neutral-700">
          {/* The letter is printed on white in both themes, like paper */}
          <div dangerouslySetInnerHTML={{ __html: letterHtml }} />
          {view.state === "signed" && (
            <div className="mt-8 border-t border-neutral-300 pt-4 text-sm">
              <div className="font-semibold">Accepted by the customer</div>
              {view.signatureImage && (
                <img src={view.signatureImage} alt={`Signature of ${view.signedName ?? ""}`} className="mt-2 h-20" />
              )}
              <div>{view.signedName}</div>
              <div className="text-neutral-600">Signed electronically on {signedOn}</div>
              <div className="mt-2 break-all font-mono text-xs text-neutral-500">
                Letter fingerprint (SHA-256): {view.letterSha256}
              </div>
            </div>
          )}
        </div>

        {view.state === "signed" ? (
          <div className="co-sign-noprint flex justify-end">
            <Button variant="outline" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print or save as PDF
            </Button>
          </div>
        ) : view.state !== "sent" ? (
          <div className="co-sign-noprint rounded-none border border-neutral-300 bg-white p-4 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-dark-150 dark:text-neutral-200">
            {view.state === "declined"
              ? "This Change Order was declined."
              : view.state === "void"
                ? "This link was replaced by a newer one. Check your email for the latest."
                : "This link has expired. Ask your contact to send a new one."}
          </div>
        ) : (
          <div className="co-sign-noprint space-y-4 rounded-none border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-dark-150">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Sign</h2>
            <div className="space-y-1">
              <label htmlFor="co-sign-name" className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                Full name
              </label>
              <input
                id="co-sign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand dark:border-neutral-600 dark:bg-dark-100 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Signature</div>
              <SignaturePad onChange={setSignature} />
            </div>
            <label htmlFor="co-sign-consent" className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                id="co-sign-consent"
                type="checkbox"
                className="mt-0.5 rounded-none"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>{view.consentText}</span>
            </label>
            {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" size="sm" leftIcon={<X className="h-4 w-4" />} onClick={() => setDeclining((d) => !d)}>
                Decline
              </Button>
              <Button leftIcon={<Check className="h-4 w-4" />} isLoading={busy} onClick={sign}>
                Sign and accept {money(view.amount)}
              </Button>
            </div>
            {declining && (
              <div className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
                <label htmlFor="co-decline-reason" className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  Why are you declining? (optional)
                </label>
                <textarea
                  id="co-decline-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-dark-100 dark:text-white"
                />
                <div className="flex justify-end">
                  <Button variant="outline" isLoading={busy} onClick={decline}>
                    Decline this Change Order
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
