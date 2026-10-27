"use client";

import { CheckCircle2, MessageCircle, Phone, X } from "lucide-react";

interface ArrivalContactModalProps {
  missionId: string;
  buyerContact: {
    phone: string;
    name?: string | null;
  };
  messageTemplate: string;
  buyerPresenceConfirmed?: boolean;
  onClose: () => void;
}

function formatPhoneDisplay(phone: string): string {
  const cleaned = phone.replace(/\s+/g, "");
  if (cleaned.startsWith("+237") && cleaned.length === 13) {
    return `+237 ${cleaned.slice(4, 7)} ${cleaned.slice(7, 9)} ${cleaned.slice(9, 11)} ${cleaned.slice(11, 13)}`;
  }
  return phone;
}

export default function ArrivalContactModal({
  missionId,
  buyerContact,
  messageTemplate,
  buyerPresenceConfirmed = false,
  onClose,
}: ArrivalContactModalProps) {
  const rawPhone = buyerContact.phone;
  const cleanPhoneForWa = rawPhone.replace(/\+/g, "").replace(/\s+/g, "");
  const encodedMessage = encodeURIComponent(messageTemplate);

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
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/20 text-warning">
              <span className="text-xl">📍</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Vous êtes arrivé à destination
              </h2>
              <p className="text-xs text-slate-400">
                Coordonnez la remise avec l&apos;acheteur
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            title="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corps de la modale */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Badge présence confirmée si applicable */}
          {buyerPresenceConfirmed ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-success/40 bg-success/15 p-3.5 text-xs font-bold text-success">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>✅ L&apos;acheteur a déjà confirmé sa présence sur place !</span>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5 text-xs text-slate-300">
              💡 Contactez l&apos;acheteur par téléphone ou WhatsApp pour qu&apos;il vienne récupérer le colis ou confirme sa présence sur son lien de suivi.
            </div>
          )}

          {/* Carte coordonnées acheteur */}
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

          {/* Actions : 3 boutons verticaux h-14 w-full */}
          <div className="space-y-2.5 pt-1">
            {/* 1. Appeler l'acheteur */}
            <a
              href={`tel:${rawPhone}`}
              className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-base font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary/90 active:scale-[0.98]"
            >
              <Phone className="h-5 w-5" />
              <span>Appeler le client</span>
            </a>

            {/* 2. Message type de confirmation sur WhatsApp */}
            <a
              href={`https://wa.me/${cleanPhoneForWa}?text=${encodedMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] text-base font-bold text-white shadow-lg shadow-[#25D366]/30 transition hover:bg-[#22bf5b] active:scale-[0.98]"
            >
              <MessageCircle className="h-5 w-5" />
              <span>Envoyer le message de confirmation</span>
            </a>

            {/* 3. Ouvrir chat WhatsApp direct */}
            <a
              href={`https://wa.me/${cleanPhoneForWa}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/80 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 active:scale-[0.98]"
            >
              <span>Discuter sur WhatsApp</span>
            </a>
          </div>
        </div>

        {/* Bouton Fermer */}
        <div className="border-t border-slate-800 bg-slate-950/80 p-4 pb-6">
          <button
            onClick={onClose}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-800 text-sm font-bold text-slate-300 transition hover:bg-slate-700 active:scale-[0.98]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

