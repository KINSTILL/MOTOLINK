"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radio, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";

export type DriverStatus = "AVAILABLE" | "ON_MISSION" | "OFFLINE";

interface DriverStatusToggleProps {
  initialStatus?: DriverStatus;
  initialCanChange?: boolean;
  initialReason?: string | null;
  className?: string;
  compact?: boolean;
}

export default function DriverStatusToggle({
  initialStatus = "OFFLINE",
  initialCanChange = true,
  initialReason = null,
  className = "",
  compact = false,
}: DriverStatusToggleProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [status, setStatus] = useState<DriverStatus>(initialStatus);
  const [canChange, setCanChange] = useState<boolean>(initialCanChange);
  const [reason, setReason] = useState<string | null>(initialReason);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronisation avec le statut serveur (polling 30s)
  const refreshStatus = async () => {
    try {
      const res = await fetch("/api/drivers/status", {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          setStatus(data.status);
          setCanChange(Boolean(data.canChange));
          setReason(data.reason || null);
        }
      }
    } catch {
      // Ignorer les erreurs silencieuses de polling en tâche de fond
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshStatus();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    if (loading) return;

    if (status === "ON_MISSION") {
      setErrorMessage("Vous avez une course en cours. Le statut se réinitialisera à la livraison.");
      return;
    }

    if (!canChange && reason) {
      setErrorMessage(reason);
      return;
    }

    const previousStatus = status;
    const targetStatus: DriverStatus = status === "AVAILABLE" ? "OFFLINE" : "AVAILABLE";

    // Mise à jour optimiste
    setStatus(targetStatus);
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/drivers/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Rollback en cas d'erreur
        setStatus(previousStatus);
        setErrorMessage(data.error || "Impossible de modifier votre statut.");
      } else {
        setStatus(data.status);
        startTransition(() => {
          router.refresh();
        });
      }
    } catch {
      setStatus(previousStatus);
      setErrorMessage("Erreur de connexion réseau.");
    } finally {
      setLoading(false);
    }
  };

  const isAvailable = status === "AVAILABLE";
  const isOnMission = status === "ON_MISSION";
  const isOffline = status === "OFFLINE";

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          type="button"
          role="switch"
          aria-checked={isAvailable}
          aria-label="Basculer la disponibilité"
          disabled={isOnMission || loading}
          onClick={handleToggle}
          className={`flex min-h-[48px] min-w-[48px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-95 ${
            isOnMission
              ? "cursor-not-allowed bg-amber-500/15 text-amber-400 border border-amber-500/30"
              : isAvailable
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "bg-slate-800 text-slate-300 border border-slate-700"
          }`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isOnMission
                  ? "bg-amber-500"
                  : isAvailable
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-slate-500"
              }`}
            />
          )}
          <span>
            {isOnMission
              ? "En mission"
              : isAvailable
              ? "Disponible"
              : "Hors ligne"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border p-4 transition-all duration-200 ${
        isOnMission
          ? "border-amber-500/30 bg-amber-950/20"
          : isAvailable
          ? "border-emerald-500/30 bg-emerald-950/15"
          : "border-slate-800 bg-slate-900"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Statut du livreur
            </span>
            {isOnMission && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                Verrouillé
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full ${
                isOnMission
                  ? "bg-amber-400 ring-4 ring-amber-400/20"
                  : isAvailable
                  ? "bg-emerald-400 ring-4 ring-emerald-400/20 animate-pulse"
                  : "bg-slate-500 ring-4 ring-slate-500/20"
              }`}
            />
            <p className="text-lg font-bold text-slate-50">
              {isOnMission
                ? "En mission"
                : isAvailable
                ? "Disponible"
                : "Hors ligne"}
            </p>
          </div>

          <p className="text-xs text-slate-400">
            {isOnMission
              ? "Course en cours • Repassera automatiquement à votre statut antérieur à la livraison"
              : isAvailable
              ? "Vous recevez les propositions directes et les alertes de courses"
              : "Vous ne recevez aucune nouvelle proposition de course"}
          </p>
        </div>

        {/* Bouton de bascule 1 tap (zone de contact >= 48px pour WCAG AA mobile) */}
        <button
          type="button"
          role="switch"
          aria-checked={isAvailable}
          aria-label={
            isOnMission
              ? "Statut verrouillé en cours de mission"
              : isAvailable
              ? "Passer hors ligne"
              : "Passer disponible"
          }
          disabled={isOnMission || loading}
          onClick={handleToggle}
          className={`group flex min-h-[48px] min-w-[130px] shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition active:scale-95 ${
            isOnMission
              ? "cursor-not-allowed bg-amber-500/10 text-amber-300 border border-amber-500/20 opacity-80"
              : isAvailable
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
              : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-750 hover:text-white"
          }`}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          ) : isOnMission ? (
            <Radio className="h-4 w-4 text-amber-400 animate-pulse" />
          ) : isAvailable ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <Radio className="h-4 w-4 text-slate-400" />
          )}

          <span>
            {loading
              ? "Chargement..."
              : isOnMission
              ? "En mission"
              : isAvailable
              ? "En ligne"
              : "Hors ligne"}
          </span>
        </button>
      </div>

      {/* Message d'erreur ou d'avertissement */}
      {errorMessage && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-danger/15 p-3 text-xs text-danger border border-danger/30">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Action impossible : </span>
            {errorMessage}
          </div>
        </div>
      )}

      {/* Message de blocage si pas KYC ou pas abonnement */}
      {!canChange && reason && !errorMessage && !isOnMission && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-warning/15 p-3 text-xs text-warning border border-warning/30">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Activation restreinte : </span>
            {reason}
          </div>
        </div>
      )}
    </div>
  );
}

