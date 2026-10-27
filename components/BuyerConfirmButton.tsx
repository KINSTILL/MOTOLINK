"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, AlertCircle, ShieldCheck } from "lucide-react";

interface BuyerConfirmButtonProps {
  missionId: string;
  token: string;
  alreadyConfirmed?: boolean;
}

/**
 * Bouton public « Confirmer ma commande » (acheteur).
 * Appelle POST /api/public/missions/[id]/buyer-confirm avec le token du lien.
 */
export default function BuyerConfirmButton({
  missionId,
  token,
  alreadyConfirmed = false,
}: BuyerConfirmButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    alreadyConfirmed ? "done" : "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (state === "loading" || state === "done") return;
    setState("loading");
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/public/missions/${missionId}/buyer-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Impossible de confirmer la commande.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setErrorMessage("Erreur réseau. Vérifiez votre connexion et réessayez.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-4 text-success"
      >
        <CheckCircle2 className="h-6 w-6 shrink-0" />
        <div>
          <p className="text-base font-bold">Commande confirmée</p>
          <p className="text-sm text-slate-300">
            Merci ! Votre vendeur a été informé.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleConfirm}
        disabled={state === "loading"}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/30 transition active:scale-[0.98] disabled:opacity-60"
      >
        {state === "loading" ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Confirmation...</span>
          </>
        ) : (
          <>
            <ShieldCheck className="h-5 w-5" />
            <span>Confirmer ma commande</span>
          </>
        )}
      </button>

      {state === "error" && errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}

