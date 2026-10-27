"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  Share2,
} from "lucide-react";

interface MissionDetailActionsProps {
  missionId: string;
  publicToken: string;
  description?: string | null;
  buyerPhone: string;
  buyerName?: string | null;
  notificationSent: boolean;
  notificationChannel?: string | null;
  notifChannelUsed?: string | null;
  notifStatus?: string | null;
  notifSentAt?: string | null;
  notifResendCount?: number;
  latestProposal?: {
    id: string;
    status: string;
    driverName: string;
  } | null;
}

const MAX_RESENDS = 3;

export default function MissionDetailActions({
  missionId,
  publicToken,
  description,
  buyerPhone,
  buyerName,
  notificationSent: initialSent,
  notificationChannel: initialChannel,
  notifChannelUsed: initialChannelUsed,
  notifStatus: initialStatus,
  notifResendCount: initialResendCount = 0,
  latestProposal,
}: MissionDetailActionsProps) {
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";

  const [copied, setCopied] = useState(false);
  const [showCreatedToast, setShowCreatedToast] = useState(justCreated);
  const [proposalStatus, setProposalStatus] = useState(
    latestProposal?.status || null
  );
  const [publishing, setPublishing] = useState(false);

  const initialChannelLabel =
    initialChannelUsed === "sms" || initialChannel === "SMS"
      ? "SMS"
      : "WhatsApp";

  const [notifSent, setNotifSent] = useState(
    initialSent || initialStatus === "SENT"
  );
  const [notifChannel, setNotifChannel] = useState(initialChannelLabel);
  const [resendCount, setResendCount] = useState(initialResendCount);
  const [resendingNotif, setResendingNotif] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (!justCreated) return;
    setShowCreatedToast(true);
    const timer = setTimeout(() => {
      setShowCreatedToast(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [justCreated]);

  const getTrackingUrl = () => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/s/${publicToken}`;
    }
    return `https://motolink.cm/s/${publicToken}`;
  };

  const handleCopyLink = async () => {
    const url = getTrackingUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleShareWhatsApp = () => {
    const greeting = buyerName ? `Bonjour ${buyerName},` : "Bonjour,";
    const text = `${greeting} suivez votre livraison en temps réel : https://motolink.cm/suivi/${missionId}`;
    const phoneDigits = buyerPhone.replace(/\D/g, "");
    const waUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  const handleResendNotification = async () => {
    if (resendingNotif || resendCount >= MAX_RESENDS) return;

    setResendingNotif(true);
    setResendMessage(null);
    setResendError(null);

    try {
      const res = await fetch(
        `/api/missions/${missionId}/resend-notification`,
        {
          method: "POST",
        }
      );
      const data = await res.json();

      if (!res.ok) {
        setResendError(
          data.error || "Impossible de renvoyer la notification."
        );
        return;
      }

      if (typeof data.resendCount === "number") {
        setResendCount(data.resendCount);
      } else {
        setResendCount((prev) => prev + 1);
      }

      const label =
        data.channel === "sms" || data.channelLabel === "SMS"
          ? "SMS"
          : "WhatsApp";
      setNotifChannel(label);

      if (data.success || data.sent) {
        setNotifSent(true);
        setResendMessage(`Notification renvoyée via ${label}`);
      } else {
        setNotifSent(false);
        setResendError(data.error || "Échec d'envoi de la notification.");
      }
    } catch {
      setResendError("Erreur réseau lors du renvoi.");
    } finally {
      setResendingNotif(false);
    }
  };

  const remainingResends = Math.max(0, MAX_RESENDS - resendCount);

  const handlePublishToMarket = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/missions/${missionId}/publish`, {
        method: "POST",
      });
      if (res.ok) {
        setProposalStatus("PUBLISHED");
      }
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Statut de la proposition directe à un livreur préféré */}
      {latestProposal && (
        <div className="rounded-2xl border border-primary/30 bg-slate-900 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Proposition directe ({latestProposal.driverName})
            </span>
            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
              {proposalStatus === "PENDING"
                ? "En attente (max 2h)"
                : proposalStatus === "ACCEPTED"
                ? "Acceptée"
                : proposalStatus === "REFUSED"
                ? "Refusée"
                : "Publiée sur le marché ouvert"}
            </span>
          </div>

          {(proposalStatus === "PENDING" || proposalStatus === "REFUSED") && (
            <button
              type="button"
              disabled={publishing}
              onClick={handlePublishToMarket}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span>Publier sur le marché ouvert</span>
              )}
            </button>
          )}
        </div>
      )}
      {/* Toast "Mission créée" à l'arrivée sur la page */}
      {showCreatedToast && (
        <div
          role="status"
          className="fixed left-4 right-4 top-16 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-success/50 bg-slate-900 p-4 text-success shadow-xl"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="text-base font-semibold">Mission créée</span>
        </div>
      )}

      {/* Carte Statut notification + Bouton Renvoyer (rate limit 3/mission) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Notification client
            </span>
            {notifSent ? (
              <p className="text-sm font-semibold text-success">
                📱 Envoyée via {notifChannel}
              </p>
            ) : (
              <p className="text-sm font-semibold text-warning">
                ⚠️ Non envoyée (Renvoyer)
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={resendingNotif || remainingResends === 0}
            onClick={handleResendNotification}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-semibold text-slate-200 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resendingNotif ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-primary" />
            )}
            <span>Renvoyer ({remainingResends}/{MAX_RESENDS})</span>
          </button>
        </div>

        {resendMessage && (
          <p className="text-xs font-medium text-success">{resendMessage}</p>
        )}

        {resendError && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-danger">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{resendError}</span>
          </p>
        )}

        <p className="border-t border-slate-800/80 pt-2 text-[11px] leading-relaxed text-slate-400">
          Le vendeur consent à l&apos;envoi d&apos;une notification à l&apos;acheteur via le canal choisi. MotoLink agit pour le compte du vendeur. Uniquement transactionnel, jamais marketing.
        </p>
      </div>

      {/* Bouton Copier le lien de suivi */}
      <button
        type="button"
        onClick={handleCopyLink}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-base font-semibold text-slate-50 transition active:scale-[0.98]"
      >
        {copied ? (
          <>
            <Check className="h-5 w-5 text-success" />
            <span className="text-success">
              Lien copié (/s/{publicToken.slice(0, 8)}...)
            </span>
          </>
        ) : (
          <>
            <Copy className="h-5 w-5 text-primary" />
            <span>Copier le lien de suivi</span>
          </>
        )}
      </button>

      {/* Bouton Partager sur WhatsApp */}
      <button
        type="button"
        onClick={handleShareWhatsApp}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-success px-4 text-base font-semibold text-white shadow-lg shadow-success/25 transition active:scale-[0.98]"
      >
        <Share2 className="h-5 w-5" />
        <span>Partager sur WhatsApp</span>
      </button>
    </div>
  );
}
