"use client";

import React from "react";
import { Users, UserPlus, Radio, Clock, ShieldAlert } from "lucide-react";
import { FleetTab } from "./FleetTabs";

interface FleetEmptyStateProps {
  filter: FleetTab;
  onAddDriver?: () => void;
  className?: string;
}

export default function FleetEmptyState({
  filter,
  onAddDriver,
  className = "",
}: FleetEmptyStateProps) {
  let title = "Votre flotte est vide";
  let description = "Ajoutez un livreur pour commencer à lui proposer des courses directes.";
  let Icon = Users;

  if (filter === "available") {
    title = "Aucun livreur disponible";
    description = "Vos livreurs sont actuellement en mission ou hors ligne. Vous pouvez notifier un livreur hors ligne.";
    Icon = Radio;
  } else if (filter === "on_mission") {
    title = "Aucun livreur en mission";
    description = "Tous vos livreurs actifs sont actuellement disponibles pour de nouvelles livraisons.";
    Icon = Clock;
  } else if (filter === "offline") {
    title = "Aucun livreur hors ligne";
    description = "Tous vos livreurs de flotte sont actuellement connectés ou en cours de course.";
    Icon = ShieldAlert;
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center ${className}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/80 text-slate-400">
        <Icon className="h-7 w-7" />
      </div>

      <div className="space-y-1">
        <h3 className="text-base font-bold text-slate-200">{title}</h3>
        <p className="max-w-xs text-xs text-slate-400">{description}</p>
      </div>

      {filter === "all" && onAddDriver && (
        <button
          type="button"
          onClick={onAddDriver}
          className="mt-2 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-95 hover:bg-primary-hover"
        >
          <UserPlus className="h-4 w-4" />
          <span>Ajouter un livreur</span>
        </button>
      )}
    </div>
  );
}

