import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/notchpay";
import AgendaList from "@/components/AgendaList";
import { ArrowLeft, Calendar, PlusCircle } from "lucide-react";

export default async function VendorAgendaPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "VENDOR") {
    redirect(`/dashboard/${session.role.toLowerCase()}`);
  }

  const activeSub = await getActiveSubscription(session.userId);

  const scheduledMissions = await prisma.mission.findMany({
    where: {
      vendorId: session.userId,
      scheduledAt: { not: null },
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/vendor"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-50">
              Agenda des livraisons
            </h1>
            <p className="text-xs text-slate-400">
              Missions programmées à l&apos;avance
            </p>
          </div>
        </div>

        <Link
          href="/missions/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition active:scale-95"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Programmer</span>
        </Link>
      </div>

      <AgendaList
        missions={scheduledMissions.map((m) => ({
          id: m.id,
          vendorId: m.vendorId,
          driverId: m.driverId,
          buyerName: m.buyerName,
          buyerPhone: m.buyerPhone,
          address: m.address,
          articlePhotoUrls: m.articlePhotoUrls,
          description: m.description,
          price: Number(m.price),
          type: m.type,
          status: m.status,
          scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : "",
          scheduledStatus: m.scheduledStatus,
          driver: m.driver,
        }))}
        userRole="VENDOR"
        currentUserId={session.userId}
      />
    </div>
  );
}
