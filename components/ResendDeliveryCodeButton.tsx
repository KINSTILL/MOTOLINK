"use client";

import { useState } from "react";
import { Loader2, RotateCw } from "lucide-react";

interface ResendDeliveryCodeButtonProps {
  missionId: string;
  remainingResends: number;
}

export default function ResendDeliveryCodeButton({
  missionId,
  remainingResends,
}: ResendDeliveryCodeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(remainingResends);

  const handleResend = async () => {
    if (loading || remaining <= 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/missions/${missionId}/resend-delivery-code`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setResult(
          `Code renvoyé au client via ${data.channelLabel || "WhatsApp"}.`
        );
        if (typeof data.remainingResends === "number") {
          setRemaining(data.remainingResends);
        }
      } else {
        setError(data.error || "Impossible de renvoyer le code.");
      }
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleResend}
        disabled={loading || remaining <= 0}
        className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition active:scale-95 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RotateCw className="h-4 w-4" />
        )}
        <span>Renvoyer le code</span>
      </button>
      {result && (
        <p className="text-xs font-semibold text-success">{result}</p>
      )}
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      {remaining > 0 && (
        <p className="text-[11px] text-slate-400">
          {remaining} renvoi{remaining > 1 ? "s" : ""} restant
          {remaining > 1 ? "s" : ""}.
        </p>
      )}
    </div>
  );
}
