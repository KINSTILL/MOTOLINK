"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bike,
  AlertTriangle,
  Gift,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

interface InvitePageProps {
  params: {
    token: string;
  };
}

export default function InvitePage({ params }: InvitePageProps) {
  const router = useRouter();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<{
    vendor: { shopName: string; brandingLogoUrl: string | null };
    driverName: string;
    driverPhone: string;
    expiresAt: string;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/invitations/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Invitation invalide ou expirée.");
        }
        return res.json();
      })
      .then((data) => {
        setInviteData(data);
      })
      .catch((err: any) => {
        setError(err.message || "Impossible de charger l'invitation.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleAccept = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.status === 401) {
        // Redirection vers le login avec retour vers l'invitation
        router.push(`/login?redirect=/invite/${token}&action=accept`);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Impossible d'accepter l'invitation.");
        return;
      }

      router.push(data.redirectTo || "/dashboard/driver");
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  const shopName = inviteData?.vendor?.shopName || "Le commerçant";

  if (loading) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 p-4 text-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-slate-400">Chargement de votre invitation...</p>
      </main>
    );
  }

  if (error && !inviteData) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 p-6 text-slate-50 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/15 text-danger mb-4">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold text-slate-100">Invitation indisponible</h1>
        <p className="mt-1 max-w-xs text-xs text-slate-400">{error}</p>
        <Link
          href="/"
          className="mt-6 rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-semibold text-slate-200"
        >
          Retour à l&apos;accueil
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-8 text-slate-50">
      <div className="mx-auto max-w-md space-y-6">
        {/* Header Logo */}
        <div className="flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/25">
            <Bike className="h-6 w-6" />
          </div>
          <span className="text-xl font-black tracking-tight">
            Moto<span className="text-secondary">Link</span>
          </span>
        </div>

        {/* Carte invitation */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/15 px-3 py-1 text-xs font-bold text-purple-300">
              <Gift className="h-3.5 w-3.5" />
              <span>Invitation au parrainage</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-50">
              {shopName} vous invite !
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              Rejoignez MotoLink pour recevoir directement des missions de {shopName}. Votre abonnement livreur est intégralement offert.
            </p>
          </div>

          {/* Avantages */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4 space-y-2.5">
            <p className="text-xs font-bold text-emerald-300">Ce que vous recevez :</p>
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span><strong>Abonnement offert</strong> par {shopName}</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span><strong>3 missions prioritaires</strong> attribuées en tête de liste</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span><strong>Accès complet</strong> au marché de courses MotoLink</span>
              </div>
            </div>
          </div>

          {/* Encadré d'indépendance légale "Pas employeur" */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Votre indépendance est garantie</span>
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              {shopName} <strong>n&apos;est pas votre employeur</strong>. Vous demeurez un coursier indépendant, 100% libre d&apos;accepter ou de refuser toute mission et de collaborer avec d&apos;autres commerçants à tout moment.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-danger/30 bg-danger/15 p-3 text-xs text-danger text-center">
              {error}
            </div>
          )}

          {/* Bouton Accepter */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleAccept}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-bold text-white shadow-lg shadow-primary/30 transition active:scale-[0.98] hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Activation en cours...</span>
                </>
              ) : (
                <>
                  <span>Accepter l&apos;invitation</span>
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>

            <div className="text-center">
              <Link
                href="/"
                className="text-xs text-slate-400 underline underline-offset-4 hover:text-slate-300"
              >
                Refuser et retourner à l&apos;accueil
              </Link>
            </div>
          </div>
        </div>

        {/* Footer légal */}
        <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
          <Link href="/legal/cgu" className="hover:text-slate-400">
            CGU MotoLink
          </Link>
          <span>•</span>
          <Link href="/legal/privacy" className="hover:text-slate-400">
            Confidentialité
          </Link>
        </div>
      </div>
    </main>
  );
}

