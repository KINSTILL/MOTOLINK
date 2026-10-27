"use client";

import { useState } from "react";
import CheckpointButtons from "@/components/CheckpointButtons";
import CheckpointTimeline, {
  CheckpointTimelineItem,
} from "@/components/CheckpointTimeline";

interface MissionCheckpointPanelProps {
  missionId: string;
  initialStatus: string;
  missionCreatedAt: string;
  initialCheckpoints: CheckpointTimelineItem[];
  isAssignedDriver: boolean;
  buyerContact?: { phone: string; name?: string | null } | null;
}

export default function MissionCheckpointPanel({
  missionId,
  initialStatus,
  missionCreatedAt,
  initialCheckpoints,
  isAssignedDriver,
  buyerContact = null,
}: MissionCheckpointPanelProps) {
  const [status, setStatus] = useState(initialStatus);
  const [checkpoints, setCheckpoints] =
    useState<CheckpointTimelineItem[]>(initialCheckpoints);

  const handleCheckpointAdded = (
    newCheckpoint: CheckpointTimelineItem,
    nextStatus: string
  ) => {
    setCheckpoints((prev) => [...prev, newCheckpoint]);
    setStatus(nextStatus);
  };

  return (
    <div className="space-y-6">
      {/* 4 Boutons de jalons pour le livreur assigné */}
      {isAssignedDriver &&
        (status === "ACCEPTED" || status === "IN_PROGRESS") && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-50">
              Jalons de livraison
            </h2>
            <CheckpointButtons
              missionId={missionId}
              currentStatus={status}
              initialCheckpoints={checkpoints}
              buyerContact={buyerContact}
              onCheckpointAdded={handleCheckpointAdded}
            />
          </section>
        )}

      {/* Section Historique : timeline des checkpoints */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-50">Historique</h2>
        <CheckpointTimeline
          checkpoints={checkpoints}
          missionCreatedAt={missionCreatedAt}
        />
      </section>
    </div>
  );
}

