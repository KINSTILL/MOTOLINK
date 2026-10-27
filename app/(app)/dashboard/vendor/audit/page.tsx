import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatDoualaDateTime } from "@/lib/utils";
import AuditVerifyButton from "@/components/AuditVerifyButton";
import {
  ArrowLeft,
  Clock,
  Globe,
  Link2,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

const EVENT_LABELS: Record<string, { label: string; badgeClass: string }> = {
  PROOF_CREATED: {
    label: "Preuve scellée (PROOF_CREATED)",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  },
  PROOF_VERIFIED: {
    label: "Vérification publique (PROOF_VERIFIED)",
    badgeClass: "border-primary/40 bg-primary/15 text-blue-300",
  },
  PROOF_VIEWED: {
    label: "Preuve consultée (PROOF_VIEWED)",
    badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  },
  PROOF_EXPORTED: {
    label: "PDF exporté (PROOF_EXPORTED)",
    badgeClass: "border-purple-500/40 bg-purple-500/15 text-purple-300",
  },
  MISSION_STATUS_CHANGED: {
    label: "Statut mission modifié (MISSION_STATUS_CHANGED)",
    badgeClass: "border-slate-700 bg-slate-800 text-slate-300",
  },
  OFFLINE_NOTIFICATION_SENT: {
    label: "Notification livreur envoyée (OFFLINE_NOTIFICATION_SENT)",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  },
  OFFLINE_NOTIFICATION_FAILED: {
    label: "Notification livreur échouée (OFFLINE_NOTIFICATION_FAILED)",
    badgeClass: "border-danger/40 bg-danger/15 text-danger",
  },
  FLEET_DRIVER_REMOVED: {
    label: "Livreur retiré de la flotte (FLEET_DRIVER_REMOVED)",
    badgeClass: "border-slate-700 bg-slate-800 text-slate-300",
  },
};

export default async function VendorAuditPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "VENDOR") {
    redirect(`/dashboard/${session.role.toLowerCase()}`);
  }

  // Récupère les missions et preuves appartenant au vendeur
  const vendorMissions = await prisma.mission.findMany({
    where: { vendorId: session.userId },
    select: {
      id: true,
      description: true,
      buyerName: true,
      proof: {
        select: {
          id: true,
          proofHash: true,
        },
      },
    },
  });

  const missionIds = vendorMissions.map((m) => m.id);
  const proofIds = vendorMissions
    .map((m) => m.proof?.id)
    .filter((id): id is string => Boolean(id));

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        ...(proofIds.length > 0
          ? [{ entityType: "PROOF", entityId: { in: proofIds } }]
          : []),
        ...(missionIds.length > 0
          ? [{ entityType: "MISSION", entityId: { in: missionIds } }]
          : []),
        { actorId: session.userId, entityType: { in: ["NOTIFICATION", "FLEET"] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const actorIds = Array.from(
    new Set(
      auditLogs
        .map((l) => l.actorId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, shopName: true, phone: true, role: true },
        })
      : [];

  const actorMap = new Map(actors.map((a) => [a.id, a]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/vendor"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300 transition active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Tableau de bord</span>
        </Link>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
          <Link2 className="h-3.5 w-3.5" />
          <span>Append-Only SHA-256</span>
        </span>
      </div>

      <header className="space-y-1">
        <h1 className="text-xl font-extrabold text-slate-50">
          Journal d&apos;audit de mes preuves
        </h1>
        <p className="text-xs text-slate-400">
          Historique immuable et chaîné cryptographiquement des scellements,
          consultations, exports et vérifications publiques.
        </p>
      </header>

      {/* Bouton "Vérifier l'intégrité" */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>Contrôle de la chaîne cryptographique</span>
        </div>
        <AuditVerifyButton />
      </section>

      {/* Liste des entrées d'audit */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Événements enregistrés ({auditLogs.length})
        </h2>

        {auditLogs.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
            Aucun événement d&apos;audit enregistré pour vos preuves de
            livraison.
          </div>
        ) : (
          <div className="space-y-3">
            {auditLogs.map((log) => {
              const eventCode = log.eventType || log.action || "EVENT";
              const eventInfo = EVENT_LABELS[eventCode] || {
                label: eventCode,
                badgeClass: "border-slate-700 bg-slate-800 text-slate-200",
              };

              const actor = log.actorId ? actorMap.get(log.actorId) : null;
              const actorDisplay = actor
                ? `${actor.shopName || actor.name || actor.phone} (${
                    log.actorRole || actor.role
                  })`
                : "Vérification publique";

              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${eventInfo.badgeClass}`}
                    >
                      {eventInfo.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDoualaDateTime(log.createdAt)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 pt-1 text-slate-300 sm:grid-cols-2">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="text-slate-400">Acteur :</span>
                      <span className="font-semibold text-slate-100">
                        {actorDisplay}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 shrink-0 text-secondary" />
                      <span className="text-slate-400">IP :</span>
                      <span className="font-mono text-slate-200">
                        {log.actorIp || "127.0.0.1"}
                      </span>
                    </div>
                  </div>

                  {log.metadata &&
                    typeof log.metadata === "object" &&
                    (log.metadata as any).driverName && (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2 text-slate-300">
                        <span className="text-slate-400">Livreur : </span>
                        <span className="font-semibold text-slate-100">
                          {(log.metadata as any).driverName}
                        </span>
                        {(log.metadata as any).channel && (
                          <>
                            <span className="ml-2 text-slate-400">• Canal : </span>
                            <span className="font-semibold text-slate-100 uppercase">
                              {(log.metadata as any).channel}
                            </span>
                          </>
                        )}
                        {(log.metadata as any).status && (
                          <>
                            <span className="ml-2 text-slate-400">• Statut : </span>
                            <span className="font-semibold text-slate-100">
                              {(log.metadata as any).status}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                  {log.currentHash && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-mono text-[10px] text-slate-400 space-y-1">
                      <div className="truncate">
                        <span className="text-slate-500">prev : </span>
                        <span>{log.previousHash}</span>
                      </div>
                      <div className="truncate text-slate-300">
                        <span className="text-primary">hash : </span>
                        <span>{log.currentHash}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

