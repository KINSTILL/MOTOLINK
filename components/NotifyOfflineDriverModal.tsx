"use client";

import React, { useState } from "react";
import {
  X,
  MessageCircle,
  Phone,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Info,
} from "lucide-react";

interface NotifyOfflineDriverModalProps {
  driverId: string;
  driverName: string;
  shopName?: string;
  onClose: () => void;
  onSuccess: (channel: string) => void;
}

export default function NotifyOfflineDriverModal({
  driverId,
  driverName,
  shopName = "Votre boutique",
  onClose,
  onSuccess,
}: NotifyOfflineDriverModalProps) {
  const [submittingChannel, setSubmittingChannel] = useState<"whatsapp" | "sms" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewMessage = `Bonjour ${driverName}, ${shopName} a une livraison pour vous. Êtes-vous disponible ? Ouvrez MotoLink pour passer en Disponible : https://motolink.cm/dashboard/driver`;

  const handleSend = async (channel: "whatsapp" | "sms") => {
    if (submittingChannel) return;
    setSubmittingChannel(channel);
    setError(null);

    try {
      const res = await fetch("/api/vendors/notify-offline-driver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, channel }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError(data.error || "Déjà notifié dans les 24h. Réessayez demain.");
        } else {
          setError(data.error || "Échec de l'envoi. Réessayez ou utilisez l'autre canal.");
        }
        return;
      }

      onSuccess(channel);
    } catch {
      setError("Erreur réseau. Vérifiez votre connexion.");
    } finally {
      setSubmittingChannel(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 id="modal-title" className="text-base font-bold text-slate-50">
            Contacter {driverName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la modale"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Explication */}
        <p className="text-xs text-slate-300 leading-relaxed">
          <strong className="text-white">{driverName}</strong> est actuellement hors ligne. Vous pouvez lui envoyer une notification pour lui demander s&apos;il est disponible pour prendre en charge vos livraisons.
        </p>

        {/* Encadré Important */}
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 space-y-1.5 text-xs text-warning">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Important à savoir :</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-300">
            <li>{driverName} reste totalement libre de répondre</li>
            <li>Aucune obligation ni pénalité pour lui</li>
            <li>1 notification maximum par 24h pour préserver le livreur</li>
          </ul>
        </div>

        {/* Message pré-rempli */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Message envoyé :
          </span>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs italic text-slate-300 leading-relaxed">
            &laquo; {previewMessage} &raquo;
          </div>
        </div>

        {/* Affichage d'erreur */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/15 p-3 text-xs text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Boutons d'envoi WhatsApp & SMS */}
        <div className="space-y-2 pt-1">
          {/* WhatsApp (Canal recommandé) */}
          <button
            type="button"
            disabled={submittingChannel !== null}
            onClick={() => handleSend("whatsapp")}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition active:scale-95 hover:bg-emerald-500 disabled:opacity-50"
          >
            {submittingChannel === "whatsapp" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
            <span>Envoyer via WhatsApp (Recommandé)</span>
          </button>

          {/* SMS (Fallback) */}
          <button
            type="button"
            disabled={submittingChannel !== null}
            onClick={() => handleSend("sms")}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition active:scale-95 hover:bg-slate-750 disabled:opacity-50"
          >
            {submittingChannel === "sms" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4 text-secondary" />
            )}
            <span>Envoyer par SMS direct</span>
          </button>

          {/* Annuler */}
          <button
            type="button"
            disabled={submittingChannel !== null}
            onClick={onClose}
            className="flex min-h-[40px] w-full items-center justify-center rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

