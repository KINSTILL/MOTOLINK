"use client";

import { AlertTriangle, Phone, X } from "lucide-react";

interface OrderConfirmationReminderProps {
  isOpen: boolean;
  /** Le numéro saisi est-il exploitable pour lancer un appel ? */
  canCall: boolean;
  onClose: () => void;
  /** « Appeler maintenant » : lance l'appel (le vendeur coche ensuite la case). */
  onCallNow: () => void;
  /** « Continuer sans appeler » : coche la case et crée la mission. */
  onContinueWithoutCalling: () => void;
}

/**
 * Modale affichée quand le vendeur tente de créer la mission
 * sans avoir coché « J'ai confirmé la commande ».
 */
export default function OrderConfirmationReminder({
  isOpen,
  canCall,
  onClose,
  onCallNow,
  onContinueWithoutCalling,
}: OrderConfirmationReminderProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-confirmation-reminder-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-secondary" />
            <h2
              id="order-confirmation-reminder-title"
              className="text-base font-bold text-slate-50"
            >
              Avez-vous confirmé la commande ?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-slate-300">
          Il est recommandé d&apos;appeler le client avant de lancer la livraison.
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onCallNow}
            disabled={!canCall}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/30 transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
          >
            <Phone className="h-5 w-5" />
            <span>Appeler maintenant</span>
          </button>

          <button
            type="button"
            onClick={onContinueWithoutCalling}
            className="flex h-14 w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-950 px-4 text-base font-semibold text-slate-200 transition active:scale-[0.98]"
          >
            Continuer sans appeler
          </button>
        </div>
      </div>
    </div>
  );
}

