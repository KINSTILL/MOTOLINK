"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  ArrowLeft,
  Loader2,
  Calendar,
  CheckCircle2,
  Package,
  Award,
  Sparkles,
} from "lucide-react";
import { formatDoualaDateTime } from "@/lib/utils";
import { formatBadgeLabel } from "@/components/ReferralCard";

interface RefereeItem {
  id: string;
  refereeId: string;
  refereeName: string;
  refereeStatus: string;
  refereeCompletedMissions: number;
  status: string;
  createdAt: string;
}

interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  completedReferrals: number;
  totalMissionsByReferees: number;
  currentBadge: string | null;
  nextMilestone: { count: number; badge: string; remainingNeeded: number } | null;
}

export default function DriverReferralsPage() {
  const [referrals, setReferrals] = useState<RefereeItem[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/referrals/status");
        if (res.ok) {
          const data = await res.json();
          setReferrals(data.referrals || []);
          setStats(data.stats || null);
        }
      } catch (err) {
        console.error("Erreur chargement filleuls:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredReferrals = referrals.filter((r) => {
    if (filter === "completed") {
      return r.status === "COMPLETED" || r.refereeCompletedMissions >= 20;
    }
    if (filter === "active") {
      return (
        (r.status === "ACTIVE" || r.refereeCompletedMissions >= 5) &&
        r.refereeCompletedMissions < 20
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header avec retour */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/driver"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Tableau de bord</span>
        </Link>
        {stats?.currentBadge && (
          <span className="rounded-full border border-secondary/40 bg-secondary/15 px-3 py-1 text-xs font-bold text-secondary">
            {formatBadgeLabel(stats.currentBadge)}
          </span>
        )}
      </div>

      <div>
        <h1 className="text-lg font-bold text-slate-50">Mes Filleuls</h1>
        <p className="text-base text-slate-400">
          Suivez l&apos;activité des livreurs inscrits avec votre code.
        </p>
      </div>

      {/* Résumé des statistiques */}
      {stats && (
        <section className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
          <div>
            <p className="text-xl font-black text-slate-100">
              {stats.totalReferrals}
            </p>
            <p className="text-xs text-slate-400">Total filleuls</p>
          </div>
          <div className="border-x border-slate-800">
            <p className="text-xl font-black text-primary">
              {stats.activeReferrals}
            </p>
            <p className="text-xs text-slate-400">Actifs (5+ liv.)</p>
          </div>
          <div>
            <p className="text-xl font-black text-secondary">
              {stats.completedReferrals}
            </p>
            <p className="text-xs text-slate-400">Complétés (20+)</p>
          </div>
        </section>
      )}

      {/* Onglets de filtres */}
      <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
            filter === "all"
              ? "bg-primary text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Tous ({referrals.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("active")}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
            filter === "active"
              ? "bg-primary text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Actifs ({stats?.activeReferrals || 0})
        </button>
        <button
          type="button"
          onClick={() => setFilter("completed")}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
            filter === "completed"
              ? "bg-primary text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Complétés ({stats?.completedReferrals || 0})
        </button>
      </div>

      {/* Liste des filleuls */}
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredReferrals.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
            <Users className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-slate-200">
            Aucun filleul dans cette catégorie
          </p>
          <p className="text-xs text-slate-400 max-w-xs">
            Partagez votre code de parrainage avec vos confrères pour débloquer les badges progressifs.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReferrals.map((r) => {
            const isCompleted =
              r.status === "COMPLETED" || r.refereeCompletedMissions >= 20;
            const isActive =
              (r.status === "ACTIVE" || r.refereeCompletedMissions >= 5) &&
              !isCompleted;

            return (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-100">
                      {r.refereeName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Inscrit le {formatDoualaDateTime(r.createdAt)}</span>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      isCompleted
                        ? "bg-secondary/15 text-secondary border border-secondary/30"
                        : isActive
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {isCompleted ? "COMPLETED" : isActive ? "ACTIF (5+)" : "DÉBUTANT"}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <Package className="h-4 w-4 text-primary" />
                    <span>Livraisons effectuées</span>
                  </span>
                  <span className="font-bold text-slate-100">
                    {r.refereeCompletedMissions} / 20
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

