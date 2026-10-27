import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import ProofStepperClient from "@/components/ProofStepperClient";
import { ArrowLeft } from "lucide-react";

export default async function MissionProofPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const mission = await prisma.mission.findUnique({
    where: { id: params.id },
    include: {
      proof: true,
    },
  });

  if (!mission) {
    notFound();
  }

  // Si la preuve a déjà été scellée, redirige vers la page de succès
  if (mission.proof) {
    redirect(`/missions/${mission.id}/proof/success`);
  }

  if (session.role !== "DRIVER" || mission.driverId !== session.userId) {
    redirect(`/missions/${mission.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/missions/${mission.id}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300 transition active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Retour à la mission</span>
        </Link>

        <span className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
          Preuve scellée
        </span>
      </div>

      <ProofStepperClient
        missionId={mission.id}
        missionDescription={mission.description || "Colis MotoLink"}
        buyerName={mission.buyerName || mission.buyerPhone}
        deliveryCodeVerified={Boolean(mission.deliveryCodeVerifiedAt)}
      />
    </div>
  );
}

