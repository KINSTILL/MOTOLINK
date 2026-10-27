"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Bike,
  Sparkles,
  Gift,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Phone,
  User,
  KeyRound,
  ArrowRight,
} from "lucide-react";

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref")?.trim() || "";

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Formulaire d'inscription / connexion
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function checkCurrentUser() {
      try {
        const res = await fetch("/api/users/me");
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data.user);
        }
      } catch {
        // Ignorer si non connecté
      } finally {
        setLoadingUser(false);
      }
    }
    checkCurrentUser();
  }, []);

  const handleApplyOnly = async () => {
    if (!refCode) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/referrals/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: refCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'appliquer le code.");
      }
      setFeedback({
        type: "success",
        text: "Code appliqué avec succès ! Vous bénéficiez de 3 missions prioritaires.",
      });
      setTimeout(() => {
        router.push("/dashboard/driver");
      }, 1500);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erreur inattendue.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setFeedback({ type: "error", text: "Veuillez entrer votre numéro de téléphone." });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'envoi du code.");
      }
      setStep("otp");
      setFeedback({
        type: "success",
        text: "Code de vérification envoyé par SMS.",
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erreur inattendue.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setFeedback({ type: "error", text: "Veuillez entrer le code à 6 chiffres." });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      // 1. Vérification OTP et création/connexion du compte livreur
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          code: otpCode.trim(),
          role: "DRIVER",
          acceptedCgu: true,
          acceptedPrivacy: true,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Code invalide.");
      }

      // 2. Si un code parrainage est renseigné, l'appliquer directement
      if (refCode) {
        try {
          const applyRes = await fetch("/api/referrals/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: refCode }),
          });
          const applyData = await applyRes.json();
          if (!applyRes.ok) {
            console.warn("Échec application parrainage lors du join:", applyData.error);
          }
        } catch (applyErr) {
          console.warn("Erreur réseau application parrainage:", applyErr);
        }
      }

      setFeedback({
        type: "success",
        text: "Bienvenue sur MotoLink ! Redirection vers votre tableau de bord...",
      });
      setTimeout(() => {
        router.push("/dashboard/driver");
      }, 1200);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erreur de connexion.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-8 text-slate-50">
      <div className="mx-auto max-w-md space-y-6">
        {/* Header Logo */}
        <header className="flex flex-col items-center justify-center text-center space-y-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
            <Bike className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-white">
            Rejoignez Moto<span className="text-secondary">Link</span>
          </h1>
          <p className="text-xs text-slate-400">
            Plateforme technique de livraison certifiée au Cameroun
          </p>
        </header>

        {/* Bannière d'invitation avec code */}
        {refCode && (
          <section className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Gift className="h-4 w-4" />
              <span>Invitation parrainage livreur</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-200">
              Vous avez été invité avec le code <strong className="text-emerald-300">{refCode}</strong>.
              Recevez <strong className="text-white">3 missions prioritaires</strong> dès votre inscription !
            </p>
          </section>
        )}

        {/* Feedback message */}
        {feedback && (
          <div
            className={`flex items-start gap-3 rounded-2xl border p-4 text-xs font-semibold ${
              feedback.type === "success"
                ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                : "border-danger/30 bg-danger/10 text-danger"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-danger mt-0.5" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Cas : Utilisateur déjà connecté */}
        {currentUser ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-50">
                Bonjour, {currentUser.name || currentUser.phone}
              </h2>
              <p className="text-xs text-slate-400">
                Vous êtes connecté en tant que {currentUser.role === "DRIVER" ? "Livreur" : currentUser.role}.
              </p>
            </div>

            {currentUser.sponsorDriverId ? (
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-xs text-slate-300 space-y-2">
                <div className="flex items-center gap-2 text-primary font-bold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Vous avez déjà un parrain</span>
                </div>
                <p>
                  Un compte livreur ne peut avoir qu&apos;un seul parrain. Votre priorité et vos liens actuels sont conservés.
                </p>
              </div>
            ) : refCode ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-300">
                  Souhaitez-vous lier votre compte au code de parrainage <strong className="text-emerald-400">{refCode}</strong> pour recevoir vos 3 missions prioritaires ?
                </p>
                <button
                  type="button"
                  onClick={handleApplyOnly}
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Appliquer le code {refCode}</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Aucun code de parrainage spécifié.
                </p>
              </div>
            )}

            <Link
              href="/dashboard/driver"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
            >
              <span>Accéder à mon tableau de bord</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </section>
        ) : (
          /* Cas : Nouvel utilisateur / Non connecté */
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-50">
                {step === "phone" ? "Créer mon compte livreur" : "Vérification OTP"}
              </h2>
              <p className="text-xs text-slate-400">
                {step === "phone"
                  ? "Inscription instantanée avec votre numéro camerounais (+237)."
                  : `Entrez le code à 6 chiffres transmis au ${phone}.`}
              </p>
            </div>

            {step === "phone" ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Votre Nom ou Prénom
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Jean Paul"
                      className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Numéro de téléphone (+237)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+237 6XX XX XX XX"
                      required
                      className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    <span>Conditions d&apos;utilisation</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    En créant votre compte, vous acceptez les CGU et reconnaissez votre statut de travailleur indépendant.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>Créer mon compte</span>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyAndJoin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Code de confirmation OTP
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456"
                      required
                      className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-center text-lg font-bold tracking-widest text-slate-100 placeholder:text-slate-600 focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>Confirmer et valider</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setStep("phone")}
                  disabled={loading}
                  className="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  Modifier le numéro
                </button>
              </form>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}

