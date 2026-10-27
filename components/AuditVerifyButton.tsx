"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

interface VerifyResult {
  valid: boolean;
  brokenAt: string | null;
  totalLogs: number;
}

export default function AuditVerifyButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit/verify", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de vérifier la chaîne d'audit.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Erreur réseau lors de la vérification d'intégrité.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleVerify}
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-lg shadow-primary/20 transition active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Vérification de la chaîne SHA-256...</span>
          </>
        ) : (
          <>
            <ShieldCheck className="h-4 w-4" />
            <span>Vérifier l&apos;intégrité</span>
          </>
        )}
      </button>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs font-medium text-danger">
          {error}
        </div>
      )}

      {result && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-3.5 text-xs ${
            result.valid
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
              : "border-danger/50 bg-danger/15 text-red-200"
          }`}
        >
          {result.valid ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-5 w-5 shrink-0 text-danger" />
          )}
          <div className="space-y-0.5">
            <p className="font-extrabold">
              {result.valid
                ? `Chaîne cryptographique intègre (${result.totalLogs} maillon(s) vérifié(s))`
                : "Altération détectée dans la chaîne d'audit !"}
            </p>
            <p className="text-[11px] opacity-90">
              {result.valid
                ? "Tous les condensats SHA-256 (previousHash → currentHash) sont authentiques et non modifiés."
                : `Rupture du chaînage détectée au maillon ID : ${result.brokenAt}`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

