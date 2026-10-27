"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import BuyerUnreachableModal from "@/components/BuyerUnreachableModal";

export type CallPhase = "before_departure" | "at_arrival";

interface DriverCallModalProps {
  missionId: string;
  phase: CallPhase;
  buyerContact: {
    phone: string;
    name?: string | null;
  };
  onClose: () => void;
  /** Appelé quand le livreur choisit « Continuer sans appeler » */
  onSkip?: () => void;
}

function formatPhoneDisplay(phone: string): string {
  const cleaned = phone.replace(/\s+/g, "");
  if (cleaned.startsWith("+237") && cleaned.length === 13) {
    return `+237 ${cleaned.slice(4, 7)} ${cleaned.slice(7, 9)} ${cleaned.slice(9, 11)} ${cleaned.slice(11, 13)}`;
  }
  return phone;
}

async function recordCallIntent(
  missionId: string,
  phase: CallPhase,
  method: "tel" | "whatsapp"
): Promise<void> {
  try {
    await fetch(`/api/missions/${missionId}/call-initiated`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase, method }),
    });
  } catch {
    // Volontairement ignoré : l'enregistrement de l'intention ne doit jamais
    // bloquer l'action du livreur (appel / WhatsApp).
  }
}

export default function DriverCallModal({
  missionId,
  phase,
  buyerContact,
  onClose,
  onSkip,
}: DriverCallModalProps) {
  const [recording, setRecording] = useState<"tel" | "whatsapp" | null>(null);
  const [showUnreachable, setShowUnreachable] = useState(false);

  const isBeforeDeparture = phase === "before_departure";
  const rawPhone = buyerContact.phone;
  const cleanPhoneForWa = rawPhone.replace(/\+/g, "").replace(/\s+/g, "");

  const title = isBeforeDeparture
    ? "Appelez le client avant de partir"
    : "Prévenez le client de votre arrivée";
  const subtitle = isBeforeDeparture
    ? "Confirmez que le client est disponible avant de démarrer la course"
    : "Informez le client que vous êtes arrivé";

  const handleCall = async (method: "tel" | "whatsapp") => {
    setRecording(method);
    await recordCallIntent(missionId, phase, method);
    setRecording(null);
    // L'ouverture du protocole externe ne bloque pas la modale
    if (method === "tel") {
      window.location.href = `tel:${rawPhone}`;
    } else {
      window.open(`https://wa.me/${cleanPhoneForWa}`, "_blank", "noopener");
    }
  };

  const handleContinue = () => {
    onSkip?.();
    onClose();
  };

  if (showUnreachable) {
    return (
      <BuyerUnreachableModal
        missionId={missionId}
        onClose={() => setShowUnreachable(false)}
        onSubmitted={() => {
          setShowUnreachable(false);
          onSkip?.();
          onClose();
        }}
      />
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in-50 duration-200"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl sm:rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">{title}</h2>
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={handleContinue}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            title="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Destinataire
            </span>
            <p className="text-base font-extrabold text-slate-50">
              {buyerContact.name || "Client"}
            </p>
            <p className="font-mono text-sm font-semibold text-primary">
              {formatPhoneDisplay(rawPhone)}
            </p>
          </div>

          <div className="space-y-2.5">
            {/* Appeler */}
            <button
              type="button"
              onClick={() => handleCall("tel")}
              disabled={recording !== null}
              className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60"
            >
              {recording === "tel" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Phone className="h-5 w-5" />
              )}
              <span>Appeler le client</span>
            </button>

            {/* WhatsApp */}
            <button
              type="button"
              onClick={() => handleCall("whatsapp")}
              disabled={recording !== null}
              className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] text-base font-bold text-white shadow-lg shadow-[#25D366]/30 transition hover:bg-[#22bf5b] active:scale-[0.98] disabled:opacity-60"
            >
              {recording === "whatsapp" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <MessageCircle className="h-5 w-5" />
              )}
              <span>WhatsApp</span>
            </button>
          </div>

          {/* Client absent */}
          <button
            type="button"
            onClick={() => setShowUnreachable(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-danger/40 bg-danger/10 text-sm font-semibold text-danger transition hover:bg-danger/20 active:scale-[0.98]"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Le client ne répond pas (photo client absent)</span>
          </button>
        </div>

        {/* Footer : continuer sans appeler (aucun blocage) */}
        <div className="border-t border-slate-800 bg-slate-950/80 p-4 pb-6">
          <button
            onClick={handleContinue}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-800 text-sm font-bold text-slate-300 transition hover:bg-slate-700 active:scale-[0.98]"
          >
            Continuer sans appeler
          </button>
        </div>
      </div>
    </div>
  );
}
