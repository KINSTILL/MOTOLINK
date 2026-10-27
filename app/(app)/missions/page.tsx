import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getActiveSubscription } from "@/lib/notchpay";
import { expireStaleDirectProposals } from "@/lib/proposals";
import DriverMissionsTabs from "@/components/DriverMissionsTabs";
import DriverMissionsStatusBanner from "@/components/DriverMissionsStatusBanner";
import { CreditCard, Lock } from "lucide-react";

export default async function DriverMissionsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (session.role !== "DRIVER") {
    redirect(`/dashboard/${session.role.toLowerCase()}`);
  }

  await expireStaleDirectProposals();

  const [driver, activeSub] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        kycStatus: true,
        driverStatus: true,
      },
    }),
    getActiveSubscription(session.userId),
  ]);

  if (!driver) {
    redirect("/login");
  }

  if (!activeSub) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-bold text-slate-50">
            Missions de course
          </h1>
          <p className="text-base text-slate-400">
            Consultez le marché ouvert ou répondez à vos propositions directes.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Lock className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-slate-200">
            Abonnez-vous pour voir les missions
          </p>
          <p className="text-xs text-slate-400">
            Formule livreur : 250 FCFA / semaine ou 800 FCFA / mois.
          </p>
          <Link
            href="/subscription"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white transition active:scale-[0.98]"
          >
            <CreditCard className="h-5 w-5" />
            <span>S&apos;abonner maintenant</span>
          </Link>
        </div>
      </div>
    );
  }

  const [openMarketMissions, directProposals] = await Promise.all([
    prisma.mission.findMany({
      where: {
        status: "CREATED",
        driverId: null,
        directProposals: {
          none: {
            status: "PENDING",
          },
        },
      },
      include: {
        vendor: {
          select: {
            shopName: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.directProposal.findMany({
      where: {
        driverId: session.userId,
        status: "PENDING",
        mission: {
          status: "CREATED",
          driverId: null,
        },
      },
      include: {
        mission: {
          include: {
            vendor: {
              select: {
                shopName: true,
                name: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const isKycVerified = driver.kycStatus === "VERIFIED";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-50">Missions de course</h1>
        <p className="text-base text-slate-400">
          Consultez le marché ouvert ou répondez à vos propositions directes.
        </p>
      </div>

      <DriverMissionsStatusBanner
        initialStatus={driver.driverStatus}
        isKycVerified={isKycVerified}
      />

      <DriverMissionsTabs
        isKycVerified={isKycVerified}
        openMarketMissions={openMarketMissions.map((m) => ({
          id: m.id,
          description: m.description,
          address: m.address,
          price: Number(m.price),
          type: m.type,
          gasCertified: m.gasCertified,
          category: m.category,
          createdAt: m.createdAt.toISOString(),
          vendorName: m.vendor.shopName || m.vendor.name || m.vendor.phone,
        }))}
        directProposals={directProposals.map((p) => ({
          id: p.id,
          mission: {
            id: p.mission.id,
            description: p.mission.description,
            address: p.mission.address,
            price: Number(p.mission.price),
            type: p.mission.type,
            gasCertified: p.mission.gasCertified,
            category: p.mission.category,
            createdAt: p.mission.createdAt.toISOString(),
            vendorName:
              p.mission.vendor.shopName ||
              p.mission.vendor.name ||
              p.mission.vendor.phone,
          },
        }))}
      />
    </div>
  );
}
