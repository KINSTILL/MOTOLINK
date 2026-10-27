"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Footer from "@/components/Footer";
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  Loader2,
  ShoppingBag,
  Store,
} from "lucide-react";

type RoleOption = "VENDOR" | "DRIVER" | "BUYER";

const ROLE_CARDS: Array<{
  role: RoleOption;
  title: string;
  description: string;
  icon: typeof Store;
  accentClass: string;
}> = [
  {
    role: "VENDOR",
    title: "Vendeur",
    description:
      "Créez vos missions de livraison, suivez vos coursiers et recevez des constats de remise horodatés.",
    icon: Store,
    accentClass: "text-primary bg-primary/15",
  },
  {
    role: "DRIVER",
    title: "Livreur",
    description:
      "Acceptez des courses à proximité, capturez photos, signatures et positions GPS certifiées.",
    icon: Bike,
    accentClass: "text-secondary bg-secondary/15",
  },
  {
    role: "BUYER",
    title: "Acheteur",
    description:
      "Suivez l'arrivée de votre colis en temps réel et signez à la réception.",
    icon: ShoppingBag,
    accentClass: "text-success bg-success/15",
  },
];

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") || "";

  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!phone) {
      router.replace("/login");
    }
  }, [phone, router]);

  const handleContinue = async () => {
    if (!selectedRole || !acceptedLegal || loading || !phone) return;

    setLoading(true);
    setError(null);

    try {
      const onboardingToken =
        typeof window !== "undefined"
          ? sessionStorage.getItem("motolink_onboarding_token") || undefined
          : undefined;

      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          role: selectedRole,
          onboardingToken,
          acceptedCgu: acceptedLegal,
          acceptedPrivacy: acceptedLegal,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Impossible de finaliser l'inscription.");
        setLoading(false);
        return;
      }

      if (typeof window !== "undefined") {
        sessionStorage.removeItem("motolink_onboarding_token");
      }

      const roleSlug = String(data.user?.role || selectedRole).toLowerCase();
      router.push(`/dashboard/${roleSlug}`);
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col justify-between bg-background px-5 pb-safe-bottom pt-safe-top">
      <div className="my-auto flex w-full max-w-md mx-auto flex-col gap-6 py-8">
        {/* En-tête */}
        <div className="space-y-1.5 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Choisissez votre profil
          </h1>
          <p className="text-base text-muted-foreground">
            Comment souhaitez-vous utiliser MotoLink avec le numéro{" "}
            <span className="font-semibold text-white">{phone}</span> ?
          </p>
        </div>

        {/* 3 grandes cartes tactiles */}
        <div className="flex flex-col gap-3.5">
          {ROLE_CARDS.map((card) => {
            const Icon = card.icon;
            const isSelected = selectedRole === card.role;

            return (
              <button
                key={card.role}
                type="button"
                onClick={() => {
                  setError(null);
                  setSelectedRole(card.role);
                }}
                className={`flex w-full items-start gap-4 rounded-2xl border-2 p-5 text-left transition active:scale-[0.99] ${
                  isSelected
                    ? "border-primary bg-primary/10 ring-4 ring-primary/20"
                    : "border-border bg-card hover:border-border/80"
                }`}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.accentClass}`}
                >
                  <Icon className="h-6 w-6" />
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-white">
                      {card.title}
                    </span>
                    {isSelected && (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Checkbox obligatoire CGU & Politique de confidentialité */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 text-base text-slate-100">
            <input
              type="checkbox"
              checked={acceptedLegal}
              onChange={(e) => {
                setError(null);
                setAcceptedLegal(e.target.checked);
              }}
              className="mt-1 h-5 w-5 shrink-0 rounded border-slate-600 bg-slate-950 text-primary focus:ring-primary"
            />
            <span className="leading-snug">
              J&apos;ai lu et j&apos;accepte les{" "}
              <Link
                href="/legal/cgu"
                className="font-bold text-primary underline underline-offset-4"
              >
                CGU
              </Link>{" "}
              et la{" "}
              <Link
                href="/legal/privacy"
                className="font-bold text-primary underline underline-offset-4"
              >
                Politique de confidentialité
              </Link>{" "}
              (ainsi que les{" "}
              <Link
                href="/legal/mentions"
                className="font-bold text-primary underline underline-offset-4"
              >
                Mentions légales
              </Link>
              )
            </span>
          </label>
          <p className="text-xs text-slate-400">
            MotoLink est un constat de fait, pas une garantie de paiement ou de
            qualité.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-center text-sm font-medium text-danger"
          >
            {error}
          </div>
        )}
      </div>

      {/* Bouton Continuer en bas + Footer légal */}
      <div className="w-full max-w-md mx-auto pb-4 pt-2 space-y-4">
        <button
          type="button"
          disabled={!selectedRole || !acceptedLegal || loading}
          onClick={handleContinue}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Création du compte...</span>
            </>
          ) : (
            <>
              <span>Continuer</span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>

        <Footer />
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
