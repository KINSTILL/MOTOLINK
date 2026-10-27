"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react";
import { formatDoualaDateTime } from "@/lib/utils";

interface PresenceStatusBannerProps {
  missionId: string;
  buyerPresenceConfirmedAt?: string | null;
  hasNearbyCheckpoint: boolean;
  isDriver: boolean;
}

export default function PresenceStatusBanner({
  missionId,
  buyerPresenceConfirmedAt,
  hasNearbyCheckpoint,
  isDriver,
}: PresenceStatusBannerProps) {
  const [confirmedAt, setConfirmedAt] = useState<string | null>(
    buyerPresenceConfirmedAt || null
  );
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  // Cas 1 : Présence confirmée
  if (confirmedAt) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-success/40 bg-success/15 p-4 text-sm font-bold text-success shadow-sm animate-in fade-in-50">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <div className="flex flex-col">
          <span>✅ L&apos;acheteur a confirmé sa présence</span>
          <span className="text-[11px] font-normal text-success/80">
            Confirmé à {formatDoualaDateTime(confirmedAt)}
          </span>
        </div>
      </div>
    );
  }

  // Cas 2 : NEARBY complété mais présence pas encore confirmée
  if (hasNearbyCheckpoint) {
    const handleResend = async () => {
      if (resending) return;
      setResending(true);
      setResendNotice(null);
      setResendError(null);

      try {
        const res = await fetch(
          `/api/missions/${missionId}/resend-presence-notification`,
          { method: "POST" }
        );
        const data = await res.json();
        if (!res.ok) {
          setResendError(data.error || "Impossible de renvoyer la relance.");
          setResending(false);
          return;
        }

        setResendNotice("Relance envoyée au client par WhatsApp / SMS.");
      } catch {
        setResendError("Erreur réseau lors de l'envoi.");
      } finally {
        setResending(false);
      }
    };

    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-4 space-y-2.5 text-xs text-slate-300 shadow-sm animate-in fade-in-50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-slate-200">
            <Clock className="h-4 w-4 text-warning" />
            <span>⏳ En attente de confirmation du client</span>
          </div>
          {isDriver && (
            <button
              onClick={handleResend}
              disabled={resending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition disabled:opacity-50"
            >
              {resending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Envoi...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 text-primary" />
                  <span>Renvoyer la notification</span>
                </>
              )}
            </button>
          )}
        </div>

        {resendNotice && (
          <p className="text-[11px] font-semibold text-success">{resendNotice}</p>
        )}
        {resendError && (
          <p className="text-[11px] font-semibold text-danger">{resendError}</p>
        )}
      </div>
    );
  }

  // Cas 3 : Rien avant NEARBY
  return null;
}

