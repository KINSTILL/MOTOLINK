"use client";

import { useState } from "react";
import MissionCard, { MissionCardData } from "@/components/MissionCard";
import AgendaList, { AgendaMissionItem } from "@/components/AgendaList";
import { Compass, HeartHandshake, Calendar } from "lucide-react";

interface DirectProposalItem {
  id: string;
  mission: MissionCardData;
}

interface DriverMissionsTabsProps {
  isKycVerified: boolean;
  openMarketMissions: MissionCardData[];
  directProposals: DirectProposalItem[];
  scheduledMissions?: AgendaMissionItem[];
  currentUserId?: string;
}

export default function DriverMissionsTabs({
  isKycVerified,
  openMarketMissions,
  directProposals,
  scheduledMissions = [],
  currentUserId,
}: DriverMissionsTabsProps) {
  const [activeTab, setActiveTab] = useState<"OPEN_MARKET" | "DIRECT" | "AGENDA">(
    directProposals.length > 0
      ? "DIRECT"
      : scheduledMissions.length > 0 && openMarketMissions.length === 0
      ? "AGENDA"
      : "OPEN_MARKET"
  );

  return (
    <div className="space-y-4">
      {/* Barre à 3 onglets : Marché ouvert | Propositions directes | Agenda */}
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-800 bg-slate-900 p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("OPEN_MARKET")}
          className={`flex h-12 items-center justify-center gap-1.5 rounded-xl px-2 text-xs sm:text-sm font-bold transition ${
            activeTab === "OPEN_MARKET"
              ? "bg-primary text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Compass className="h-4 w-4 shrink-0" />
          <span>Marché ({openMarketMissions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("DIRECT")}
          className={`flex h-12 items-center justify-center gap-1.5 rounded-xl px-2 text-xs sm:text-sm font-bold transition ${
            activeTab === "DIRECT"
              ? "bg-primary text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <HeartHandshake className="h-4 w-4 shrink-0" />
          <span>Directes ({directProposals.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("AGENDA")}
          className={`flex h-12 items-center justify-center gap-1.5 rounded-xl px-2 text-xs sm:text-sm font-bold transition ${
            activeTab === "AGENDA"
              ? "bg-primary text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Calendar className="h-4 w-4 shrink-0" />
          <span>Agenda ({scheduledMissions.length})</span>
        </button>
      </div>

      {activeTab === "OPEN_MARKET" ? (
        openMarketMissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
              <Compass className="h-6 w-6" />
            </div>
            <p className="text-base text-slate-400">
              Aucune mission disponible sur le marché ouvert
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {openMarketMissions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                isKycVerified={isKycVerified}
              />
            ))}
          </div>
        )
      ) : activeTab === "DIRECT" ? (
        directProposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
              <HeartHandshake className="h-6 w-6" />
            </div>
            <p className="text-base text-slate-400">
              Aucune proposition directe en attente
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {directProposals.map((item) => (
              <MissionCard
                key={item.id}
                proposalId={item.id}
                mission={item.mission}
                isKycVerified={isKycVerified}
              />
            ))}
          </div>
        )
      ) : (
        <AgendaList
          missions={scheduledMissions}
          userRole="DRIVER"
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}

