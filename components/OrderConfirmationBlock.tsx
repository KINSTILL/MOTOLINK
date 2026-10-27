"use client";

import { MessageCircle, Phone, PhoneCall } from "lucide-react";

export type CallMethodValue = "tel" | "whatsapp";

interface OrderConfirmationBlockProps {
  /** Le numéro saisi est-il complet (+237 + 9 chiffres) ? */
  phoneReady: boolean;
  callInitiatedAt: string | null;
  callMethod: CallMethodValue | null;
  confirmed: boolean;
  onCall: (method: CallMethodValue) => void;
  onConfirmedChange: (value: boolean) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Bloc « Confirmer la commande » affiché au-dessus du bouton « Créer la mission ».
 * - « Appeler » / « WhatsApp » : actifs uniquement si le téléphone est saisi
 * - La case « J'ai confirmé la commande » : active uniquement après un appel / message initié
 */
export default function OrderConfirmationBlock({
  phoneReady,
  callInitiatedAt,
  callMethod,
  confirmed,
  onCall,
  onConfirmedChange,
}: OrderConfirmationBlockProps) {
  const callInitiated = Boolean(callInitiatedAt);

  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <PhoneCall className="h-5 w-5 text-primary" />
        <h3 className="text-base font-bold text-slate-50">Confirmer la commande</h3>
      </div>

      <p className="text-sm leading-relaxed text-slate-300">
        Appelez le client pour confirmer sa commande avant de créer la mission.
      </p>

      <div className="space-y-2">
        <button
          type="button"
          data-testid="order-call-button"
          onClick={() => onCall("tel")}
          disabled={!phoneReady}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-md shadow-primary/30 transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
          <Phone className="h-5 w-5" />
          <span>Appeler le client</span>
        </button>

        <button
          type="button"
          data-testid="order-whatsapp-button"
          onClick={() => onCall("whatsapp")}
          disabled={!phoneReady}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white shadow-md shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
          <MessageCircle className="h-5 w-5" />
          <span>Envoyer un message WhatsApp</span>
        </button>
      </div>

      {!phoneReady && (
        <p className="text-xs text-slate-400">
          Saisissez d&apos;abord le téléphone du client pour activer ces boutons.
        </p>
      )}

      {callInitiated && callInitiatedAt && (
        <p className="text-xs font-medium text-emerald-400">
          {callMethod === "whatsapp" ? "💬 Message WhatsApp" : "📞 Appel"} initié à{" "}
          {formatTime(callInitiatedAt)}
        </p>
      )}

      <label
        className={`flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 ${
          callInitiated ? "cursor-pointer" : "cursor-not-allowed opacity-50"
        }`}
      >
        <input
          type="checkbox"
          data-testid="order-confirmed-checkbox"
          checked={confirmed}
          disabled={!callInitiated}
          onChange={(e) => onConfirmedChange(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded accent-primary"
        />
        <span className="text-sm font-medium leading-relaxed text-slate-100">
          J&apos;ai confirmé la commande{" "}
          <span className="text-xs text-slate-400">(obligatoire)</span>
        </span>
      </label>
    </div>
  );
}

