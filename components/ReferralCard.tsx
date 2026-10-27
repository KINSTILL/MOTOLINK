"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Gift,
  Copy,
  Check,
  MessageSquare,
  Phone,
  Award,
  ChevronRight,
  Sparkles,
  Users,
} from "lucide-react";

interface ReferralCardProps {
  code: string;
  totalReferrals: number;
  activeReferrals: number;
  completedReferrals: number;
  currentBadge: string | null;
  nextMilestone: {
    count: number;
    badge: string;
    remainingNeeded: number;
  } | null;
}

export function formatBadgeLabel(badge: string | null): string | null {
  if (!badge) return null;
  switch (badge) {
    case "sponsor":
      return "🏅 Parrain";
    case "sponsor_confirmed":
      return "🏅 Parrain confirmé";
    case "sponsor_gold":
      return "🥇 Parrain Or";
    case "sponsor_platinum":
      return "💎 Parrain Platine";
    default:
      return badge;
  }
}

export default function ReferralCard({
  code,
  totalReferrals,
  activeReferrals,
  completedReferrals,
  currentBadge,
  nextMilestone,
}: ReferralCardProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `https://motolink.cm/join?ref=${code}`;
  const shareMessage = `Rejoins MotoLink avec mon code ${code} et reçois 3 missions prioritaires : ${shareUrl}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const whatsappHref = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    shareMessage
  )}`;
  const smsHref = `sms:?body=${encodeURIComponent(shareMessage)}`;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-50">
              Parrainez des livreurs, gagnez des badges
            </h2>
            <p className="text-xs text-slate-400">
              Offrez 3 missions prioritaires à chaque filleul.
            </p>
          </div>
        </div>

        {currentBadge && (
          <span className="shrink-0 rounded-full border border-secondary/40 bg-secondary/15 px-2.5 py-0.5 text-xs font-bold text-secondary">
            {formatBadgeLabel(currentBadge)}
          </span>
        )}
      </div>

      {/* Code Box */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950 p-2.5">
        <div className="pl-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Mon code unique
          </p>
          <p className="text-base font-black tracking-wide text-slate-100">
            {code}
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-bold text-slate-200 hover:bg-slate-700 transition active:scale-95"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copié</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copier</span>
            </>
          )}
        </button>
      </div>

      {/* Boutons de partage */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition active:scale-95"
        >
          <MessageSquare className="h-4 w-4" />
          <span>WhatsApp</span>
        </a>
        <a
          href={smsHref}
          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 text-xs font-bold text-primary hover:bg-primary/20 transition active:scale-95"
        >
          <Phone className="h-4 w-4" />
          <span>SMS</span>
        </a>
      </div>

      {/* Statistiques en 3 blocs */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
        <div>
          <p className="text-lg font-black text-slate-100">{totalReferrals}</p>
          <p className="text-[11px] text-slate-400">Filleuls</p>
        </div>
        <div className="border-x border-slate-800">
          <p className="text-lg font-black text-primary">{activeReferrals}</p>
          <p className="text-[11px] text-slate-400">Actifs (5+)</p>
        </div>
        <div>
          <p className="text-lg font-black text-secondary">
            {completedReferrals}
          </p>
          <p className="text-[11px] text-slate-400">Complétés (20+)</p>
        </div>
      </div>

      {/* Prochain palier */}
      {nextMilestone ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 text-xs text-slate-300 flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-secondary" />
          <span>
            Encore{" "}
            <strong className="text-white">
              {nextMilestone.remainingNeeded}{" "}
              {nextMilestone.remainingNeeded <= 1
                ? "filleul complété"
                : "filleuls complétés"}
            </strong>{" "}
            → badge{" "}
            <strong className="text-secondary">
              {formatBadgeLabel(nextMilestone.badge)}
            </strong>
          </span>
        </div>
      ) : (
        <div className="rounded-xl border border-secondary/30 bg-secondary/10 p-2.5 text-xs text-secondary flex items-center gap-2 font-semibold">
          <Award className="h-4 w-4 shrink-0" />
          <span>Palier maximal atteint : Parrain Platine !</span>
        </div>
      )}

      {/* Lien vers liste détaillée */}
      <Link
        href="/dashboard/driver/referrals"
        className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs font-semibold text-primary hover:underline"
      >
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          <span>Voir tous mes filleuls</span>
        </div>
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

