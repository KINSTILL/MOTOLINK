"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDoualaDateTime, formatFCFA } from "@/lib/utils";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CreditCard,
  Loader2,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

type PlanChoice = "WEEKLY" | "MONTHLY";

interface SubscriptionInfo {
  id: string;
  role: "VENDOR" | "DRIVER";
  plan: PlanChoice;
  priceFCFA: number;
  startsAt: string;
  endsAt: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "PENDING";
  pspRef: string;
}

interface StatusPayload {
  status: "ACTIVE" | "EXPIRED" | "NONE";
  isActive: boolean;
  renewalCancelled: boolean;
  subscription: SubscriptionInfo | null;
  weeklyMissionCount: number;
  fairUseLimit: number;
  pricing: {
    WEEKLY: { priceFCFA: number; durationDays: number; label: string };
    MONTHLY: { priceFCFA: number; durationDays: number; label: string };
  };
  referralDiscount?: number;
  referralDiscountUsed?: boolean;
}

function SubscriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mockPaid = searchParams.get("mock_paid") === "1";

  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanChoice>("WEEKLY");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/subscriptions/status");
      if (res.ok) {
        const json: StatusPayload = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (mockPaid) {
      setFeedback({
        type: "success",
        text: "Paiement Notch Pay confirmé ! Votre abonnement est actif.",
      });
    }
  }, [mockPaid]);

  const handleSubscribe = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });

      const result = await res.json();
      if (!res.ok) {
        setFeedback({
          type: "error",
          text: result.error || "Impossible d'initialiser le paiement Notch Pay.",
        });
        setSubmitting(false);
        return;
      }

      await fetchStatus();

      if (result.paymentUrl) {
        if (result.paymentUrl.startsWith("http")) {
          window.location.href = result.paymentUrl;
          return;
        }
        router.push(result.paymentUrl);
        router.refresh();
      }
    } catch {
      setFeedback({
        type: "error",
        text: "Erreur réseau lors de la connexion à Notch Pay.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRenewal = async () => {
    if (cancelling) return;
    setCancelling(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/subscriptions/cancel", {
        method: "POST",
      });
      const result = await res.json();

      if (!res.ok) {
        setFeedback({
          type: "error",
          text: result.error || "Impossible d'annuler le renouvellement.",
        });
        return;
      }

      setFeedback({
        type: "success",
        text:
          result.message ||
          "Renouvellement annulé. Votre abonnement reste actif jusqu'à l'échéance.",
      });
      await fetchStatus();
      router.refresh();
    } catch {
      setFeedback({
        type: "error",
        text: "Erreur réseau.",
      });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const status = data?.status || "NONE";
  const isActive = Boolean(data?.isActive);
  const sub = data?.subscription;
  const hasDiscount = Boolean(
    data?.referralDiscount &&
    data.referralDiscount > 0 &&
    !data.referralDiscountUsed
  );
  const discountPercent = hasDiscount ? (data?.referralDiscount ?? 0) : 0;
  const baseWeeklyPrice = data?.pricing?.WEEKLY?.priceFCFA ?? 1000;
  const baseMonthlyPrice = data?.pricing?.MONTHLY?.priceFCFA ?? 3500;
  const weeklyPrice = hasDiscount
    ? Math.round(baseWeeklyPrice * (1 - discountPercent / 100))
    : baseWeeklyPrice;
  const monthlyPrice = hasDiscount
    ? Math.round(baseMonthlyPrice * (1 - discountPercent / 100))
    : baseMonthlyPrice;
  const isDriverOffers = baseWeeklyPrice === 250;

  const statusBadge = {
    ACTIVE: {
      label: "ACTIVE",
      text: "Abonnement actif",
      className: "border-success/40 bg-success/15 text-success",
    },
    EXPIRED: {
      label: "EXPIRED",
      text: "Abonnement expiré",
      className: "border-danger/40 bg-danger/15 text-danger",
    },
    NONE: {
      label: "NONE",
      text: "Aucun abonnement actif",
      className: "border-slate-700 bg-slate-800 text-slate-300",
    },
  }[status];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-50">Mon abonnement</h1>
        <p className="text-base text-slate-400">
          Souscrivez en 3 taps via Notch Pay (Orange Money / MTN MoMo).
        </p>
      </div>

      {hasDiscount && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm font-semibold text-emerald-300">
          <span className="text-xl">🎁</span>
          <span>
            Vous bénéficiez de -{discountPercent}% sur votre prochain abonnement grâce à vos parrainages !
          </span>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 text-sm font-semibold ${
            feedback.type === "success"
              ? "border-success/40 bg-success/10 text-success"
              : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Carte Statut Actuel */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-400">
            Statut actuel
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadge.className}`}
          >
            {statusBadge.text} ({statusBadge.label})
          </span>
        </div>

        {isActive && sub ? (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Formule</span>
              <span className="font-bold text-slate-50">
                {sub.plan === "MONTHLY" ? "Mensuel" : "Hebdomadaire"} (
                {formatFCFA(sub.priceFCFA)})
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Calendar className="h-4 w-4 text-primary" />
                <span>Valide jusqu&apos;au</span>
              </span>
              <span className="font-semibold text-slate-100">
                {formatDoualaDateTime(sub.endsAt)}
              </span>
            </div>

            {!isDriverOffers && (
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Fair use hebdomadaire</span>
                <span>
                  {data?.weeklyMissionCount || 0} / {data?.fairUseLimit || 50}{" "}
                  missions cette semaine
                </span>
              </div>
            )}

            {data?.renewalCancelled ? (
              <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs font-medium text-warning">
                Renouvellement annulé. Vous conservez votre accès complet jusqu&apos;au{" "}
                {formatDoualaDateTime(sub.endsAt)}.
              </p>
            ) : (
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancelRenewal}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-danger/40 bg-danger/15 px-4 text-base font-semibold text-danger transition active:scale-[0.98] disabled:opacity-50"
              >
                {cancelling ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <XCircle className="h-5 w-5" />
                    <span>Annuler le renouvellement</span>
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            {isDriverOffers
              ? "Activez votre abonnement livreur pour consulter et accepter les missions disponibles."
              : "Activez votre abonnement vendeur pour créer vos missions de livraison en illimité (fair use 50/semaine)."}
          </p>
        )}
      </section>

      {/* Sélection des 2 offres (affichée si EXPIRED ou NONE, ou pour prolonger) */}
      {(!isActive || data?.renewalCancelled) && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-50">
            Choisissez votre formule
          </h2>

          <div className="space-y-3">
            {/* Offre 1 : Hebdomadaire */}
            <button
              type="button"
              onClick={() => setSelectedPlan("WEEKLY")}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
                selectedPlan === "WEEKLY"
                  ? "border-primary bg-primary/15"
                  : "border-slate-800 bg-slate-900"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-50">
                    Formule Hebdomadaire
                  </span>
                  <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    7 jours
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {isDriverOffers
                    ? "Accès complet au marché ouvert et propositions directes"
                    : "Création de missions illimitée (fair use 50/semaine)"}
                </p>
              </div>
              <div className="text-right">
                {hasDiscount && (
                  <p className="text-xs text-slate-500 line-through">
                    {formatFCFA(baseWeeklyPrice)}
                  </p>
                )}
                <p className="text-lg font-extrabold text-secondary">
                  {formatFCFA(weeklyPrice)}
                </p>
                <p className="text-xs text-slate-400">/ semaine</p>
              </div>
            </button>

            {/* Offre 2 : Mensuelle */}
            <button
              type="button"
              onClick={() => setSelectedPlan("MONTHLY")}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
                selectedPlan === "MONTHLY"
                  ? "border-primary bg-primary/15"
                  : "border-slate-800 bg-slate-900"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-50">
                    Formule Mensuelle
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary/20 px-2.5 py-0.5 text-xs font-semibold text-secondary">
                    <Sparkles className="h-3 w-3" />
                    <span>Économique</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {isDriverOffers
                    ? "30 jours d'accès continu aux missions sans interruption"
                    : "30 jours d'expéditions + preuves PDF opposables"}
                </p>
              </div>
              <div className="text-right">
                {hasDiscount && (
                  <p className="text-xs text-slate-500 line-through">
                    {formatFCFA(baseMonthlyPrice)}
                  </p>
                )}
                <p className="text-lg font-extrabold text-secondary">
                  {formatFCFA(monthlyPrice)}
                </p>
                <p className="text-xs text-slate-400">/ mois</p>
              </div>
            </button>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleSubscribe}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Redirection Notch Pay...</span>
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5" />
                <span>
                  S&apos;abonner (
                  {formatFCFA(
                    selectedPlan === "MONTHLY" ? monthlyPrice : weeklyPrice
                  )}
                  )
                </span>
              </>
            )}
          </button>
        </section>
      )}

      {/* Mention CGU Abonnement */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <ShieldCheck className="h-4 w-4" />
          <span>Conditions d&apos;abonnement (CGU)</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          MotoLink est un service logiciel par abonnement. L&apos;abonnement donne accès à la plateforme (création de missions pour le vendeur, accès aux missions pour le livreur). Il ne garantit pas la disponibilité des missions ni la qualité des livraisons. Le fair use de 50 livraisons/semaine peut être ajusté.
        </p>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      }
    >
      <SubscriptionContent />
    </Suspense>
  );
}

