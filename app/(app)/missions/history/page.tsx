import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatDoualaDateTime, formatFCFA } from "@/lib/utils";
import { getMissionTypeBadge } from "@/lib/validations/mission";
import { ChevronRight, Clock, MapPin } from "lucide-react";

export default async function DriverHistoryPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const completedMissions = await prisma.mission.findMany({
    where: {
      driverId: session.userId,
      status: { in: ["DELIVERED", "CANCELLED", "DISPUTE"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-50">
          Historique des courses
        </h1>
        <p className="text-base text-slate-400">
          Retrouvez vos livraisons effectuées et leurs jalons horodatés.
        </p>
      </div>

      {completedMissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
            <Clock className="h-6 w-6" />
          </div>
          <p className="text-base text-slate-400">
            Aucune course terminée pour le moment
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {completedMissions.map((mission) => (
            <Link
              key={mission.id}
              href={`/missions/${mission.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 transition active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded-lg border border-primary/30 bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                      {getMissionTypeBadge(mission.type)}
                    </span>
                    <p className="truncate text-base font-bold text-slate-50">
                      {mission.description || "Colis MotoLink"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                    {mission.status}
                  </span>
                </div>
                <p className="flex items-center gap-1.5 truncate text-sm text-slate-400">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-secondary" />
                  <span className="truncate">{mission.address}</span>
                </p>
                <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
                  <span className="font-bold text-secondary">
                    {formatFCFA(Number(mission.price))}
                  </span>
                  <span>•</span>
                  <span>{formatDoualaDateTime(mission.updatedAt)}</span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
