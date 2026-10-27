"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Check, Eraser, PenTool } from "lucide-react";

interface SignaturePadProps {
  onConfirm: (signatureBase64: string) => void;
  onBack?: () => void;
}

export default function SignaturePad({
  onConfirm,
  onBack,
}: SignaturePadProps) {
  const sigPadRef = useRef<SignatureCanvas | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClear = () => {
    sigPadRef.current?.clear();
    setHasDrawn(false);
    setError(null);
  };

  const handleValidate = () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty() || !hasDrawn) {
      setError("Veuillez faire signer le client avant de valider.");
      return;
    }

    const dataUrl = sigPadRef.current.toDataURL("image/png");
    onConfirm(dataUrl);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-50">
          Étape 2/3 — Signature de l&apos;acheteur
        </h2>
        <p className="flex items-center gap-1.5 text-sm font-medium text-secondary">
          <PenTool className="h-4 w-4" />
          <span>Faites signer le client ici</span>
        </p>
      </div>

      {/* Canvas plein écran (orientation paysage recommandée) */}
      <div className="overflow-hidden rounded-2xl border-2 border-slate-700 bg-white shadow-inner">
        <SignatureCanvas
          ref={sigPadRef}
          penColor="#0f172a"
          backgroundColor="rgba(255,255,255,1)"
          onBegin={() => {
            setHasDrawn(true);
            setError(null);
          }}
          canvasProps={{
            width: 600,
            height: 300,
            className: "h-64 w-full touch-none cursor-crosshair",
          }}
        />
      </div>

      {error && (
        <p className="text-sm font-semibold text-danger">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleClear}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-base font-semibold text-slate-200 transition active:scale-[0.98]"
        >
          <Eraser className="h-5 w-5 text-secondary" />
          <span>Effacer</span>
        </button>

        <button
          type="button"
          onClick={handleValidate}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98]"
        >
          <Check className="h-5 w-5" />
          <span>Valider</span>
        </button>
      </div>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-full py-2 text-center text-xs font-medium text-slate-400 underline"
        >
          Retour à la photo du colis
        </button>
      )}
    </div>
  );
}

