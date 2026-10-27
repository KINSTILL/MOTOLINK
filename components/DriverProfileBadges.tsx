import React from "react";

interface DriverProfileBadgesProps {
  referrerBadge?: string | null;
  className?: string;
}

export function DriverProfileBadges({
  referrerBadge,
  className = "",
}: DriverProfileBadgesProps) {
  if (!referrerBadge) return null;

  const config: Record<
    string,
    { label: string; icon: string; className: string }
  > = {
    sponsor: {
      label: "Parrain",
      icon: "🏅",
      className: "border-primary/40 bg-primary/15 text-primary",
    },
    sponsor_confirmed: {
      label: "Parrain confirmé",
      icon: "🏅",
      className: "border-secondary/40 bg-secondary/15 text-secondary",
    },
    sponsor_gold: {
      label: "Parrain Or",
      icon: "🥇",
      className: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    },
    sponsor_platinum: {
      label: "Parrain Platine",
      icon: "💎",
      className: "border-cyan-400/40 bg-cyan-400/15 text-cyan-300",
    },
  };

  const current = config[referrerBadge] || {
    label: referrerBadge,
    icon: "🏅",
    className: "border-slate-700 bg-slate-800 text-slate-300",
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${current.className} ${className}`}
    >
      <span>{current.icon}</span>
      <span>{current.label}</span>
    </div>
  );
}

export default DriverProfileBadges;

