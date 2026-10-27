"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, UserPlus, AlertTriangle } from "lucide-react";
import { normalizePhone } from "@/lib/buyer-reliability";

interface BuyerReliability {
  hasData: boolean;
  label: "Nouveau client" | "Fiable" | "À surveiller" | "Risque élevé";
  totalMissions: number;
  deliveredCount: number;
  cancelledCount: number;
  disputeCount: number;
  failureRate: number;
  disputeRate: number;
  score: number;
}

interface BuyerReliabilityBadgeProps {
  phone: string;
  /** Active la vérification (opt-in N4). Si false, rien n'est affiché. */
  enabled?: boolean;
}

/**
 * Badge non-bloquant de fiabilité client (N5).
 * Le vendeur voit un résumé objectif ; il peut toujours créer la mission.
 * Aucune PII n'est affichée (pas de numéro, pas de nom).
 */
export default function BuyerReliabilityBadge({
  phone,
  enabled = true,
}: BuyerReliabilityBadgeProps) {
  const [data, setData] = useState<BuyerReliability | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const normalized = normalizePhone(phone);
    if (normalized.length < 6) {
      setData(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/buyer-reliability?phone=${encodeURIComponent(normalized)}`
        );
        const json = await res.json();
        if (!cancelled) {
          setData(json?.enabled ? json.reliability : null);
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone, enabled]);

  if (!enabled) return null;

  if (loading) {
    return (
      <div
        data-testid="buyer-reliability-badge"
        className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-400"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Vérification du client…</span>
      </div>
    );
  }

  if (!data) return null;

  const styles: Record<
    BuyerReliability["label"],
    { cls: string; icon: typeof ShieldCheck }
  > = {
    "Nouveau client": {
      cls: "border-slate-600 bg-slate-800 text-slate-300",
      icon: UserPlus,
    },
    Fiable: {
      cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
      icon: ShieldCheck,
    },
    "À surveiller": {
      cls: "border-amber-500/40 bg-amber-500/15 text-amber-300",
      icon: AlertTriangle,
    },
    "Risque élevé": {
      cls: "border-red-500/40 bg-red-500/15 text-red-300",
      icon: ShieldAlert,
    },
  };

  const style = styles[data.label];
  const Icon = style.icon;

  return (
    <div
      data-testid="buyer-reliability-badge"
      data-label={data.label}
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${style.cls}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-semibold">{data.label}</p>
        {data.hasData ? (
          <p className="text-[11px] opacity-90">
            {data.totalMissions} mission{data.totalMissions > 1 ? "s" : ""} ·{" "}
            {data.deliveredCount} livrée{data.deliveredCount > 1 ? "s" : ""}
            {data.disputeCount > 0 ? ` · ${data.disputeCount} litige(s)` : ""}
          </p>
        ) : (
          <p className="text-[11px] opacity-80">
            Moins de 2 missions historiques — indicateur neutre.
          </p>
        )}
        <p className="text-[10px] opacity-60">
          Indicateur agrégé, jamais bloquant. Aucune donnée personnelle affichée.
        </p>
      </div>
    </div>
  );
}
