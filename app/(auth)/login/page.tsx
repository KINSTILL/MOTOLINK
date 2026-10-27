"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";
import { Bike, ArrowRight, Loader2, Phone } from "lucide-react";

/**
 * Formate dynamiquement la saisie en "+237 6XX XXX XXX"
 */
function formatPhoneInput(value: string): string {
  // Extraire uniquement les chiffres
  let digits = value.replace(/\D/g, "");

  // Retirer le préfixe 237 s'il est déjà présent au début pour isoler les 9 chiffres locaux
  if (digits.startsWith("237")) {
    digits = digits.slice(3);
  }

  // Limiter aux 9 chiffres camerounais
  const localDigits = digits.slice(0, 9);

  if (localDigits.length === 0) {
    return "";
  }

  const part1 = localDigits.slice(0, 3);
  const part2 = localDigits.slice(3, 6);
  const part3 = localDigits.slice(6, 9);

  let formatted = `+237 ${part1}`;
  if (part2) formatted += ` ${part2}`;
  if (part3) formatted += ` ${part3}`;

  return formatted;
}

/**
 * Extrait le format canonique +237XXXXXXXXX
 */
function toCanonicalPhone(formatted: string): string {
  let digits = formatted.replace(/\D/g, "");
  if (digits.startsWith("237")) {
    digits = digits.slice(3);
  }
  return `+237${digits.slice(0, 9)}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canonicalPhone = toCanonicalPhone(phoneDisplay);
  const isComplete = /^\+237\d{9}$/.test(canonicalPhone);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const raw = e.target.value;
    // Si l'utilisateur efface tout jusqu'à "+237"
    if (raw.trim() === "+237" || raw.trim() === "+23" || raw.trim() === "+2" || raw.trim() === "+") {
      setPhoneDisplay("");
      return;
    }
    setPhoneDisplay(formatPhoneInput(raw));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComplete || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: canonicalPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Impossible d'envoyer le code.");
        setLoading(false);
        return;
      }

      if (data.devCode && typeof window !== "undefined") {
        sessionStorage.setItem("motolink_dev_otp", String(data.devCode));
      }

      router.push(`/verify?phone=${encodeURIComponent(canonicalPhone)}`);
    } catch {
      setError("Erreur réseau. Vérifiez votre connexion.");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col justify-between bg-background px-5 pb-safe-bottom pt-safe-top">
      <div className="my-auto flex w-full max-w-md mx-auto flex-col gap-8 py-8">
        {/* Identité visuelle */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-xl shadow-primary/30">
            <Bike className="h-9 w-9" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Connexion à Moto<span className="text-secondary">Link</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Saisissez votre numéro pour recevoir un code par SMS
            </p>
          </div>
        </div>

        {/* Formulaire avec un seul champ téléphone */}
        <form id="otp-login-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="phone-input"
              className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Numéro de téléphone (Cameroun)
            </label>
            <div className="relative flex items-center">
              <div className="pointer-events-none absolute left-4 flex items-center text-muted-foreground">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <input
                id="phone-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                placeholder="+237 6XX XXX XXX"
                value={phoneDisplay}
                onChange={handlePhoneChange}
                className="h-16 w-full rounded-2xl border-2 border-border bg-card pl-12 pr-4 text-xl font-bold tracking-wider text-white placeholder:font-normal placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 transition"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
            >
              {error}
            </div>
          )}
        </form>
      </div>

      {/* Bouton large fixé en bas avec respect de la safe-area */}
      <div className="w-full max-w-md mx-auto pb-4 pt-2 space-y-4">
        <button
          type="submit"
          form="otp-login-form"
          disabled={!isComplete || loading}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Envoi du code...</span>
            </>
          ) : (
            <>
              <span>Recevoir un code</span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>

        <Footer />
      </div>
    </main>
  );
}

