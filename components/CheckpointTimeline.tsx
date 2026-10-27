import { formatDoualaDateTime } from "@/lib/utils";
import { Clock, MapPin } from "lucide-react";

export interface CheckpointTimelineItem {
  id: string;
  type: "PICKED_UP" | "IN_TRANSIT" | "NEARBY" | "DELIVERED" | "CUSTOM" | string;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  createdAt: string | Date;
}

export const CHECKPOINT_TRANSLATIONS: Record<
  string,
  { label: string; emoji: string; dotColor: string }
> = {
  PICKED_UP: {
    label: "Colis récupéré",
    emoji: "📦",
    dotColor: "bg-[#2563eb]",
  },
  IN_TRANSIT: {
    label: "En route",
    emoji: "🛵",
    dotColor: "bg-[#f97316]",
  },
  NEARBY: {
    label: "Arrivé sur place",
    emoji: "📍",
    dotColor: "bg-[#eab308]",
  },
  DELIVERED: {
    label: "Livré",
    emoji: "✅",
    dotColor: "bg-[#16a34a]",
  },
  CUSTOM: {
    label: "Note",
    emoji: "📝",
    dotColor: "bg-slate-400",
  },
};

interface CheckpointTimelineProps {
  checkpoints: CheckpointTimelineItem[];
  missionCreatedAt?: string | Date;
}

export default function CheckpointTimeline({
  checkpoints,
  missionCreatedAt,
}: CheckpointTimelineProps) {
  const sorted = [...checkpoints].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <ol className="relative ml-3 border-l border-slate-700 space-y-5">
        {missionCreatedAt && (
          <li className="ml-4">
            <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-slate-900 bg-primary" />
            <p className="text-base font-semibold text-slate-50">
              🆕 Mission créée
            </p>
            <time className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3 w-3" />
              <span>{formatDoualaDateTime(missionCreatedAt)}</span>
            </time>
          </li>
        )}

        {sorted.map((cp) => {
          const meta = CHECKPOINT_TRANSLATIONS[cp.type] || {
            label: cp.type,
            emoji: "📝",
            dotColor: "bg-slate-400",
          };
          const hasGps =
            typeof cp.lat === "number" && typeof cp.lng === "number";

          return (
            <li key={cp.id} className="ml-4 space-y-1">
              <div
                className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-slate-900 ${meta.dotColor}`}
              />
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden="true">
                  {meta.emoji}
                </span>
                <p className="text-base font-semibold text-slate-50">
                  {meta.label}
                </p>
              </div>

              {cp.note && (
                <p className="text-sm text-slate-300">{cp.note}</p>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <time className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{formatDoualaDateTime(cp.createdAt)}</span>
                </time>

                {hasGps && (
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <MapPin className="h-3 w-3 text-primary" />
                    <span>
                      {cp.lat!.toFixed(4)}, {cp.lng!.toFixed(4)}
                    </span>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

