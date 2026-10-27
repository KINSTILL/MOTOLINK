"use client";

import React, { useState } from "react";
import {
  Users,
  X,
  Phone,
  User,
  MessageSquare,
  Gift,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

interface InviteDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function InviteDriverModal({
  isOpen,
  onClose,
  onSuccess,
}: InviteDriverModalProps) {
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    inviteUrl: string;
    token: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    if (loading) return;
    setDriverName("");
    setDriverPhone("");
    setChannel("whatsapp");
    setError(null);
    setSuccessData(null);
    setCopied(false);
    onClose();
  };

  const handleCopy = async () => {
    if (!successData?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(successData.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverName.trim()) {
      setError("Veuillez indiquer le nom du livreur.");
      return;
    }
    if (!driverPhone.trim()) {
      setError("Veuillez indiquer le numéro de téléphone.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/vendors/invite-driver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverName: driverName.trim(),
          driverPhone: driverPhone.trim(),
          channel,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'envoyer l'invitation.");
      }

      setSuccessData({
        inviteUrl: data.inviteUrl,
        token: data.token,
      });
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-slate-50">
              Inviter un livreur dans votre flotte
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Success View */}
        {successData ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-slate-50">
                Invitation envoyée !
              </h3>
              <p className="text-xs text-slate-400 max-w-xs">
                Un message {channel === "whatsapp" ? "WhatsApp" : "SMS"} a été transmis au livreur. Le lien reste valide pendant 7 jours.
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 space-y-2">
              <label className="text-xs font-semibold text-slate-400">
                Lien d&apos;invitation direct :
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={successData.inviteUrl}
                  className="h-10 flex-1 truncate rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs text-slate-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-white transition active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Copié</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>Copier</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-800 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition"
            >
              Fermer
            </button>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Disclaimer encadré */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200/90 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Indépendance juridique garantie</span>
              </div>
              <p className="leading-relaxed">
                En invitant ce livreur, vous lui offrez un abonnement et l&apos;ajoutez à votre flotte. Le livreur reste indépendant : vous n&apos;êtes pas son employeur, il n&apos;a aucune obligation de travailler pour vous.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                {error}
              </div>
            )}

            {/* Inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Nom du livreur
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Ex: Paul Mbarga"
                    required
                    className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Numéro WhatsApp ou Téléphone (+237)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="tel"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="+237 6XX XX XX XX"
                    required
                    className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Canal d'envoi */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Canal d&apos;envoi de l&apos;invitation
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannel("whatsapp")}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition ${
                      channel === "whatsapp"
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                        : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannel("sms")}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition ${
                      channel === "sms"
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Phone className="h-4 w-4" />
                    <span>SMS</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Avantages réciproques */}
            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1 text-xs">
                <p className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Gift className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Le livreur reçoit :</span>
                </p>
                <ul className="text-slate-400 space-y-0.5 list-disc list-inside text-[11px]">
                  <li>Lien d&apos;activation par message</li>
                  <li>Premier abonnement offert</li>
                  <li>3 missions prioritaires avec vous</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-1 text-xs">
                <p className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-secondary" />
                  <span>Vous gagnez :</span>
                </p>
                <ul className="text-slate-400 space-y-0.5 list-disc list-inside text-[11px]">
                  <li>Livreur dédié dans votre flotte</li>
                  <li>Réduction jusqu&apos;à -50%</li>
                  <li>Priorité sur vos courses</li>
                </ul>
              </div>
            </div>

            {/* CTA */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Envoi en cours...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Envoyer l&apos;invitation</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

