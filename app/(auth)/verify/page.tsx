"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Footer from "@/components/Footer";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") || "";

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [countdown, setCountdown] = useState<number>(60);
  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const hasAutoSubmittedRef = useRef<string>("");

  // Rediriger vers /login si aucun numéro n'est présent
  useEffect(() => {
    if (!phone) {
      router.replace("/login");
      return;
    }
    if (typeof window !== "undefined") {
      const savedCode = sessionStorage.getItem("motolink_dev_otp");
      if (savedCode) setDevOtp(savedCode);
    }
  }, [phone, router]);

  // Compte à rebours de 60s
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const submitCode = useCallback(
    async (fullCode: string) => {
      if (fullCode.length !== 6 || loading || !phone) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code: fullCode }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Code invalide ou expiré.");
          setLoading(false);
          return;
        }

        // Si nouvel utilisateur -> choix du rôle sur /onboarding
        if (data.isNewUser || data.requiresOnboarding) {
          if (data.onboardingToken && typeof window !== "undefined") {
            sessionStorage.setItem("motolink_onboarding_token", data.onboardingToken);
          }
          router.push(`/onboarding?phone=${encodeURIComponent(phone)}`);
          return;
        }

        // Si utilisateur existant -> redirection vers /dashboard/{role}
        if (data.user?.role) {
          const roleSlug = String(data.user.role).toLowerCase();
          router.push(`/dashboard/${roleSlug}`);
          return;
        }
      } catch {
        setError("Erreur réseau lors de la vérification.");
        setLoading(false);
      }
    },
    [loading, phone, router]
  );

  // Auto-submit dès que les 6 chiffres sont remplis
  const codeString = digits.join("");
  useEffect(() => {
    if (
      codeString.length === 6 &&
      /^\d{6}$/.test(codeString) &&
      hasAutoSubmittedRef.current !== codeString
    ) {
      hasAutoSubmittedRef.current = codeString;
      submitCode(codeString);
    }
  }, [codeString, submitCode]);

  const handleDigitChange = (index: number, value: string) => {
    setError(null);
    const cleanDigit = value.replace(/\D/g, "").slice(-1);

    const nextDigits = [...digits];
    nextDigits[index] = cleanDigit;
    setDigits(nextDigits);

    if (cleanDigit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const nextDigits = [...digits];
        nextDigits[index] = "";
        setDigits(nextDigits);
        hasAutoSubmittedRef.current = "";
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        const nextDigits = [...digits];
        nextDigits[index - 1] = "";
        setDigits(nextDigits);
        hasAutoSubmittedRef.current = "";
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedDigits = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!pastedDigits) return;

    const nextDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < 6; i++) {
      nextDigits[i] = pastedDigits[i] || "";
    }
    setDigits(nextDigits);

    const focusIdx = Math.min(pastedDigits.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleResend = async () => {
    if (countdown > 0 || resending || !phone) return;

    setResending(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Impossible de renvoyer le code.");
      } else {
        if (data.devCode) {
          setDevOtp(String(data.devCode));
          sessionStorage.setItem("motolink_dev_otp", String(data.devCode));
        }
        setDigits(["", "", "", "", "", ""]);
        hasAutoSubmittedRef.current = "";
        setCountdown(60);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError("Erreur réseau lors du renvoi du code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col justify-between bg-background px-5 pb-safe-bottom pt-safe-top">
      {/* Barre supérieure retour */}
      <header className="pt-4">
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground active:scale-95 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Modifier le numéro</span>
        </button>
      </header>

      {/* Zone centrale */}
      <div className="my-auto flex w-full max-w-md mx-auto flex-col gap-8 py-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ShieldCheck className="h-9 w-9" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Vérification du code
            </h1>
            <p className="text-sm text-muted-foreground">
              Code à 6 chiffres envoyé au{" "}
              <span className="font-semibold text-white">{phone}</span>
            </p>
          </div>
          {devOtp && (
            <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary">
              Mode Dev • Code SMS : <span className="font-extrabold tracking-widest text-white">{devOtp}</span>
            </div>
          )}
        </div>

        {/* 6 cases tactiles */}
        <div className="space-y-5">
          <div className="grid grid-cols-6 gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                autoFocus={index === 0}
                disabled={loading}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                aria-label={`Chiffre ${index + 1}`}
                className="h-16 w-full rounded-2xl border-2 border-border bg-card text-center text-2xl font-extrabold text-white focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:opacity-50 transition"
              />
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-center text-sm font-medium text-danger"
            >
              {error}
            </div>
          )}

          {/* Compte à rebours & Renvoi du code */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <button
              type="button"
              disabled={countdown > 0 || resending || loading}
              onClick={handleResend}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-primary transition active:scale-95 disabled:text-muted-foreground disabled:pointer-events-none"
            >
              <RefreshCw
                className={`h-4 w-4 ${resending ? "animate-spin" : ""}`}
              />
              {countdown > 0 ? (
                <span>Renvoyer le code ({countdown}s)</span>
              ) : (
                <span>Renvoyer le code</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bouton Vérifier en bas */}
      <div className="w-full max-w-md mx-auto pb-4 pt-2 space-y-4">
        <button
          type="button"
          disabled={codeString.length !== 6 || loading}
          onClick={() => submitCode(codeString)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Vérification...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5" />
              <span>Vérifier</span>
            </>
          )}
        </button>

        <Footer />
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}

