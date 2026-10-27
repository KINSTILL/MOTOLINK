"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Send,
  ShieldCheck,
} from "lucide-react";

interface DeliveryCodeInputProps {
  missionId: string;
  onVerified: () => void;
}

const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 3;

export default function DeliveryCodeInput({
  missionId,
  onVerified,
}: DeliveryCodeInputProps) {
  const [digits, setDigits] = useState<string[]>(
    Array.from({ length: CODE_LENGTH }, () => "")
  );
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(MAX_ATTEMPTS);
  const [requestingNew, setRequestingNew] = useState(false);
  const [newCodeRequested, setNewCodeRequested] = useState(false);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join("");
  const isComplete = code.length === CODE_LENGTH && /^\d{4}$/.test(code);

  const handleChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length === 0) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    // Support du collage multi-chiffres
    const next = [...digits];
    const chars = cleaned.split("");
    let cursor = index;
    for (const ch of chars) {
      if (cursor >= CODE_LENGTH) break;
      next[cursor] = ch;
      cursor += 1;
    }
    setDigits(next);

    const focusIndex = Math.min(cursor, CODE_LENGTH - 1);
    inputsRef.current[focusIndex]?.focus();
    setError(null);
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    if (!isComplete || verifying) return;
    setVerifying(true);
    setError(null);

    try {
      const res = await fetch(`/api/missions/${missionId}/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        onVerified();
        return;
      }

      if (typeof data.remainingAttempts === "number") {
        setRemainingAttempts(data.remainingAttempts);
      }
      if (data.locked) {
        setLocked(true);
        setError(
          data.error ||
            "Code incorrect 3 fois. Contactez le support ou demandez un nouveau code au vendeur."
        );
      } else {
        setError(data.error || "Code incorrect. Réessayez.");
      }
      // Vide les cases pour une nouvelle saisie
      setDigits(Array.from({ length: CODE_LENGTH }, () => ""));
      inputsRef.current[0]?.focus();
    } catch {
      setError("Impossible de vérifier le code. Vérifiez votre connexion.");
    } finally {
      setVerifying(false);
    }
  };

  const handleRequestNewCode = async () => {
    if (requestingNew) return;
    setRequestingNew(true);
    try {
      const res = await fetch(
        `/api/missions/${missionId}/request-new-code`,
        { method: "POST" }
      );
      if (res.ok) {
        setNewCodeRequested(true);
      }
    } catch {
      // silencieux
    } finally {
      setRequestingNew(false);
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-primary/40 bg-slate-900 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Lock className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-50">🔐 Code de remise</h2>
          <p className="text-sm text-slate-400">
            Demandez le code à 4 chiffres au client avant de valider la
            livraison.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-danger/50 bg-danger/10 p-3 text-sm font-semibold text-danger">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 cases tactiles */}
      <div className="flex items-center justify-center gap-3">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={digit}
            disabled={locked || verifying}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className="h-16 w-14 rounded-xl border border-slate-700 bg-slate-950 text-center text-2xl font-extrabold text-slate-50 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          />
        ))}
      </div>

      {!locked && remainingAttempts < MAX_ATTEMPTS && remainingAttempts > 0 && (
        <p className="text-center text-xs font-semibold text-warning">
          Il vous reste {remainingAttempts} tentative
          {remainingAttempts > 1 ? "s" : ""}.
        </p>
      )}

      {!locked ? (
        <button
          type="button"
          onClick={handleVerify}
          disabled={!isComplete || verifying}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-50"
        >
          {verifying ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Vérification...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5" />
              <span>Valider le code</span>
            </>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-center text-sm font-semibold text-warning">
            Code incorrect 3 fois. Contactez le support.
          </div>
          <button
            type="button"
            onClick={handleRequestNewCode}
            disabled={requestingNew || newCodeRequested}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 text-sm font-bold text-primary transition active:scale-[0.98] disabled:opacity-60"
          >
            {requestingNew ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Envoi...</span>
              </>
            ) : newCodeRequested ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Demande envoyée au vendeur</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Demander un nouveau code au vendeur</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
