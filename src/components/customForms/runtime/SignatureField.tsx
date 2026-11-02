/**
 * Signature field: draw with a finger, stylus or mouse.
 *
 * Saved with the form as three values: the signer's name (the field's own
 * value, so "required" works), the drawing as a PNG (`<id>__signature`) and
 * when it was signed (`<id>__signedAt`). On paper it prints the drawing over a
 * line with the name and date.
 */

import React, { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

export interface SignatureValue {
  name: string;
  image: string;
  signedAt: string;
}

export const SignatureField: React.FC<{
  label?: string;
  value: SignatureValue;
  readOnly: boolean;
  onChange: (patch: Partial<SignatureValue>) => void;
}> = ({ label, value, readOnly, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  // Size the canvas to its box (sharp on high-DPI screens) and redraw the saved signature.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    if (value.image) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value.image;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const point = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    if (readOnly) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDirty(true);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange({ image: canvas.toDataURL("image/png"), signedAt: new Date().toISOString() });
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
    onChange({ image: "", signedAt: "" });
  };

  const signedAt = value.signedAt ? new Date(value.signedAt) : null;

  return (
    <div className="cf-signature">
      {/* Screen: the pad. */}
      <div className="print:hidden">
        <div className="relative border border-neutral-300 dark:border-neutral-600 bg-white rounded-none">
          <canvas
            ref={canvasRef}
            className={`block w-full h-28 touch-none ${readOnly ? "cursor-default" : "cursor-crosshair"}`}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            aria-label={label ? `${label} signature pad` : "Signature pad"}
          />
          {!value.image && !dirty && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-neutral-400">
              {readOnly ? "Not signed" : "Sign here"}
            </span>
          )}
          {!readOnly && (value.image || dirty) && (
            <button
              type="button"
              onClick={clear}
              className="absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-neutral-600 bg-white/90 border border-neutral-300 rounded-none hover:text-red-600"
            >
              <Eraser className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            readOnly={readOnly}
            placeholder="Printed name"
            className="flex-1 min-w-0 h-7 px-2 text-xs bg-white dark:bg-dark-150 border border-neutral-300 dark:border-neutral-600 rounded-none text-neutral-900 dark:text-white"
          />
          <span className="text-[10px] text-neutral-500 whitespace-nowrap">
            {signedAt ? `Signed ${signedAt.toLocaleString()}` : "Not signed"}
          </span>
        </div>
      </div>
      {/* Paper: the drawing over a line, then name and date. */}
      <div className="hidden print:block">
        <div className="h-16 border-b border-black flex items-end">
          {value.image && <img src={value.image} alt="Signature" className="max-h-16 max-w-full" />}
        </div>
        <div className="flex justify-between text-[10px] text-black mt-0.5">
          <span>{value.name}</span>
          <span>{signedAt ? signedAt.toLocaleDateString() : ""}</span>
        </div>
      </div>
    </div>
  );
};

export default SignatureField;
