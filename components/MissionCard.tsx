"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Flame,
  Loader2,
  Lock,
  MapPin,
  XCircle,
} from "lucide-react";
import { formatDoualaDateTime, formatFCFA } from "@/lib/utils";
import { getMissionTypeBadge } from "@/lib/validations/mission";
import MissionCategoryBadge from "@/components/MissionCategoryBadge";
import { acceptMissionAction } from "@/lib/offline-actions";

export interface MissionCardData {
  id: string;
  description: string | null;
  address: string;
  price: number;
  type?: string | null;
  gasCertified?: boolean;
  category?: string | null;
  createdAt: string;
  vendorName: string;
}

interface MissionCardProps {
  mission: MissionCardData;
  isKycVerified: boolean;
  proposalId?: string;
}

export default function MissionCard({
  mission,
  isKycVerified,
  proposalId,
}: MissionCardProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<
    "ACCEPT" | "REFUSE" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [refusedDone, setRefusedDone] = useState(false);

  const badgeLabel = getMissionTypeBadge(mission.type);

  const handleOpenMarketAccept = async () => {
    if (!isKycVerified || loadingAction) return;

    setLoadingAction("ACCEPT");
    setError(null);

    try {
      const res = await acceptMissionAction({ missionId: mission.id });
      if (!res.success) {
        setError("Impossible d'accepter la mission.");
        setLoadingAction(null);
        return;
      }

      router.push(`/missions/${mission.id}`);
      router.refresh();
    } catch {
      setError("Erreur lors de l'acceptation de la mission.");
      setLoadingAction(null);
    }
  };

  const handleProposalResponse = async (response: "ACCEPTED" | "REFUSED") => {
    if (!proposalId || loadingAction) return;
    if (response === "ACCEPTED" && !isKycVerified) return;

    setLoadingAction(response === "ACCEPTED" ? "ACCEPT" : "REFUSE");
    setError(null);

    try {
      const res = await fetch(`/api/direct-proposals/${proposalId}/respond`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de traiter la proposition.");
        setLoadingAction(null);
        return;
      }

      if (response === "ACCEPTED") {
        router.push(`/missions/${mission.id}`);
        router.refresh();
      } else {
        setRefusedDone(true);
        setLoadingAction(null);
        router.refresh();
      }
    } catch {
      setError("Erreur réseau.");
      setLoadingAction(null);
    }
  };

  if (refusedDone) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-lg border border-primary/30 bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
              {badgeLabel}
            </span>
            <MissionCategoryBadge category={mission.category} />
            <h3 className="truncate text-base font-bold text-slate-50">
              {mission.description || "Colis MotoLink"}
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Vendeur : {mission.vendorName} •{" "}
            {formatDoualaDateTime(mission.createdAt)}
          </p>
        </div>
        <span className="whitespace-nowrap text-base font-extrabold text-secondary">
          {formatFCFA(mission.price)}
        </span>
      </div>

      {mission.type === "GAS" && mission.gasCertified && (
        <div className="inline-flex items-center gap-1.5 rounded-xl border border-secondary/40 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
          <Flame className="h-3.5 w-3.5" />
          <span>Certifiée sécurisée par le vendeur</span>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-sm text-slate-300">
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <span>{mission.address}</span>
      </p>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}

      {proposalId ? (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!isKycVerified || loadingAction !== null}
              onClick={() => handleProposalResponse("ACCEPTED")}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white transition active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-400"
            >
              {loadingAction === "ACCEPT" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Accepter</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={loadingAction !== null}
              onClick={() => handleProposalResponse("REFUSED")}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-danger/40 bg-danger/15 px-4 text-base font-semibold text-danger transition active:scale-[0.98] disabled:opacity-50"
            >
              {loadingAction === "REFUSE" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <XCircle className="h-5 w-5" />
                  <span>Refuser</span>
                </>
              )}
            </button>
          </div>

          {!isKycVerified && (
            <p className="text-center text-xs font-medium text-warning">
              Complétez votre vérification d&apos;identité
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5 pt-1">
          <button
            type="button"
            disabled={!isKycVerified || loadingAction !== null}
            onClick={handleOpenMarketAccept}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
          >
            {loadingAction === "ACCEPT" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Acceptation...</span>
              </>
            ) : isKycVerified ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                <span>Accepter la mission</span>
              </>
            ) : (
              <>
                <Lock className="h-5 w-5" />
                <span>Accepter la mission</span>
              </>
            )}
          </button>

          {!isKycVerified && (
            <p className="text-center text-xs font-medium text-warning">
              Complétez votre vérification d&apos;identité
            </p>
          )}
        </div>
      )}
    </div>
  );
}

