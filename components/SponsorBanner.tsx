"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, AlertCircle, Sparkles, Loader2, X } from "lucide-react";

interface SponsorBannerProps {
  sponsorName: string;
  priorityRemaining: number;
}

export default function SponsorBanner({
  sponsorName,
  priorityRemaining,
}: SponsorBannerProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnsponsor = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/drivers/unsponsor", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Une erreur est survenue.");
      }
      setShowModal(false);
      router.push("/subscription");
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la désolidarisation."
      );
      setLoading(false);
    }
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 to-slate-900 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
            <Gift className="h-6 w-6" />
          </div>

          <div className="flex-1 space-y-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-slate-100">
                  Abonnement offert par {sponsorName}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                  <Sparkles className="h-3 w-3" />
                  {priorityRemaining}/3 missions prioritaires
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                Vous êtes un livreur indépendant. <strong className="text-slate-100">{sponsorName}</strong> n&apos;est pas votre employeur.
              </p>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="text-xs font-semibold text-slate-400 underline decoration-slate-600 underline-offset-4 hover:text-slate-200 transition"
              >
                M&apos;abonner moi-même
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modale de confirmation pour s'abonner soi-même */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-warning">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <h3 className="text-base font-bold text-slate-50">
                  M&apos;abonner moi-même
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !loading && setShowModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-slate-300">
              Si vous vous abonnez vous-même (250 FCFA/semaine), vous ne serez plus rattaché à ce vendeur et vos missions prioritaires prendront fin.
            </p>

            {error && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={handleUnsponsor}
                disabled={loading}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Traitement...</span>
                  </>
                ) : (
                  <span>Confirmer et m&apos;abonner</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="flex h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

