import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatFCFA } from "@/lib/utils";
import { getMissionTypeBadge } from "@/lib/validations/mission";
import MissionCheckpointPanel from "@/components/MissionCheckpointPanel";
import { Compass, MapPin, Navigation, Phone } from "lucide-react";

export default async function DriverActiveMissionsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const activeMissions = await prisma.mission.findMany({
    where: {
      driverId: session.userId,
      status: { in: ["ACCEPTED", "IN_PROGRESS"] },
    },
    include: {
      checkpoints: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-50">Mission en cours</h1>
        <p className="text-base text-slate-400">
          Validez chaque étape avec les 4 boutons de jalons ci-dessous.
        </p>
      </div>

      {activeMissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
            <Navigation className="h-6 w-6" />
          </div>
          <p className="text-base text-slate-400">
            Aucune course active en ce moment
          </p>
          <Link
            href="/missions"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white transition active:scale-[0.98]"
          >
            <Compass className="h-5 w-5" />
            <span>Voir les missions disponibles</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {activeMissions.map((mission) => (
            <div key={mission.id} className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-primary/30 bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
                      {getMissionTypeBadge(mission.type)}
                    </span>
                    <h2 className="text-base font-bold text-slate-50">
                      {mission.description || "Colis MotoLink"}
                    </h2>
                  </div>
                  <span className="text-base font-extrabold text-secondary">
                    {formatFCFA(Number(mission.price))}
                  </span>
                </div>

                <p className="flex items-center gap-2 text-sm text-slate-300">
                  <MapPin className="h-4 w-4 shrink-0 text-secondary" />
                  <span>{mission.address}</span>
                </p>

                <div className="flex items-center justify-between pt-1">
                  <a
                    href={`tel:${mission.buyerPhone}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary/15 px-3.5 py-2 text-xs font-semibold text-primary"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    <span>Appeler client ({mission.buyerPhone})</span>
                  </a>

                  <Link
                    href={`/missions/${mission.id}`}
                    className="text-xs font-semibold text-slate-300 underline"
                  >
                    Voir fiche complète
                  </Link>
                </div>
              </div>

              <MissionCheckpointPanel
                missionId={mission.id}
                initialStatus={mission.status}
                missionCreatedAt={mission.createdAt.toISOString()}
                isAssignedDriver={true}
                initialCheckpoints={mission.checkpoints.map((cp) => ({
                  id: cp.id,
                  type: cp.type,
                  lat: cp.lat,
                  lng: cp.lng,
                  note: cp.note,
                  createdAt: cp.createdAt.toISOString(),
                }))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
