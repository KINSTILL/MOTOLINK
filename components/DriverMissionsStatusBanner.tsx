"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Radio, AlertTriangle, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { DriverStatus } from "@/components/DriverStatusToggle";

interface DriverMissionsStatusBannerProps {
  initialStatus: DriverStatus;
  isKycVerified: boolean;
}

export default function DriverMissionsStatusBanner({
  initialStatus,
  isKycVerified,
}: DriverMissionsStatusBannerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<DriverStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuickActivate = async () => {
    if (loading) return;
    if (!isKycVerified) {
      setError("Vérification d'identité (KYC) requise pour passer en ligne.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/drivers/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "AVAILABLE" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible d'activer votre statut.");
      } else {
        setStatus("AVAILABLE");
        router.refresh();
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  };

  if (status === "ON_MISSION") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 text-amber-200">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
          </span>
          <div>
            <p className="text-sm font-bold text-amber-100">Course en cours (En mission)</p>
            <p className="text-xs text-amber-300/80">
              Votre statut repassera automatiquement en disponible dès livraison.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "AVAILABLE") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/15 p-4 text-emerald-200">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
          </span>
          <div>
            <p className="text-sm font-bold text-emerald-100">Vous êtes en ligne (Disponible)</p>
            <p className="text-xs text-emerald-300/80">
              Visible auprès des commerçants pour les propositions directes.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/driver"
          className="shrink-0 text-xs font-semibold text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
        >
          Gérer
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-3 shrink-0 rounded-full bg-slate-500" />
          <div>
            <p className="text-sm font-bold text-slate-100">Vous êtes actuellement Hors ligne</p>
            <p className="text-xs text-slate-400">
              Activez votre disponibilité pour recevoir des propositions de courses.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleQuickActivate}
          disabled={loading}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition active:scale-95 hover:bg-emerald-500"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Radio className="h-4 w-4" />
          )}
          <span>Passer en ligne</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-danger/15 p-3 text-xs text-danger border border-danger/30">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

