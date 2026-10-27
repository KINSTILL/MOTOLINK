"use client";

import React from "react";

export type FleetTab = "all" | "available" | "on_mission" | "offline";

export interface FleetCounts {
  all: number;
  available: number;
  on_mission: number;
  offline: number;
}

interface FleetTabsProps {
  activeTab: FleetTab;
  counts: FleetCounts;
  onChange: (tab: FleetTab) => void;
  className?: string;
}

const TABS: { id: FleetTab; label: string; dotColor?: string }[] = [
  { id: "all", label: "Tous" },
  { id: "available", label: "Dispo", dotColor: "bg-emerald-400" },
  { id: "on_mission", label: "En mission", dotColor: "bg-amber-400" },
  { id: "offline", label: "Hors ligne", dotColor: "bg-slate-400" },
];

export default function FleetTabs({
  activeTab,
  counts,
  onChange,
  className = "",
}: FleetTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filtrer les livreurs par statut"
      className={`flex items-center gap-2 overflow-x-auto pb-1 text-sm scrollbar-none ${className}`}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const count = counts[tab.id] ?? 0;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 font-semibold transition-all active:scale-95 ${
              isActive
                ? "bg-primary text-white shadow-md shadow-primary/25"
                : "border border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"
            }`}
          >
            {tab.dotColor && (
              <span
                className={`h-2 w-2 rounded-full ${tab.dotColor} ${
                  tab.id === "available" ? "animate-pulse" : ""
                }`}
              />
            )}
            <span>{tab.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-xs font-bold ${
                isActive ? "bg-white/20 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

