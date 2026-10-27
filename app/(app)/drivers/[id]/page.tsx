import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { KycBadges, KycCguNotice } from "@/components/KycBadges";
import { ArrowLeft, Bike, Phone, Star } from "lucide-react";

export default async function PublicDriverProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const driver = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      verified: true,
      kycStatus: true,
      createdAt: true,
      driverScore: true,
      driverRatingCount: true,
      // On sélectionne uniquement le type, le statut et le nom du syndicat — JAMAIS les clés de fichiers privés !
      kycDocuments: {
        where: { status: "VERIFIED" },
        select: {
          type: true,
          status: true,
          syndicateName: true,
        },
      },
      ratingsTo: {
        select: { score: true },
      },
    },
  });

  if (!driver || driver.role !== "DRIVER") {
    notFound();
  }

  const idCardVerified =
    driver.kycStatus === "VERIFIED" ||
    driver.kycDocuments.some((d) => d.type === "ID_CARD");
  const syndicateDoc = driver.kycDocuments.find(
    (d) => d.type === "SYNDICATE_CARD"
  );
  const enrollmentVerified = driver.kycDocuments.some(
    (d) => d.type === "ENROLLMENT_CERT"
  );

  const avgRating =
    driver.ratingsTo.length > 0
      ? (
          driver.ratingsTo.reduce((acc, r) => acc + r.score, 0) /
          driver.ratingsTo.length
        ).toFixed(1)
      : null;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Retour</span>
      </Link>

      {/* Carte Profil Public Livreur */}
      <section className="rounded-2xl bg-slate-900 p-6 border border-slate-800 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
            <Bike className="h-9 w-9" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-50">
              {driver.name || "Livreur MotoLink"}
            </h1>
            <p className="text-sm text-slate-400">{driver.phone}</p>
            {avgRating && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-warning">
                <Star className="h-3.5 w-3.5 fill-warning" />
                <span>
                  {avgRating} / 5 ({driver.ratingsTo.length} avis)
                </span>
              </p>
            )}
            {driver.driverRatingCount > 0 && (
              <p
                className="mt-1 inline-flex items-center gap-1 rounded-full border border-secondary/30 bg-secondary/10 px-2.5 py-0.5 text-xs font-bold text-secondary"
                title="Indicateur de fiabilité basé sur les 50 dernières notes — ne constitue pas une certification"
              >
                Score de confiance : {Math.round(driver.driverScore)}/100
              </p>
            )}
          </div>
        </div>

        {/* Badges cumulés KYC (sans jamais exposer les pièces d'identité) */}
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Badges de vérification cumulés
          </p>
          <KycBadges
            idCardVerified={idCardVerified}
            syndicateVerified={Boolean(syndicateDoc)}
            syndicateName={syndicateDoc?.syndicateName}
            enrollmentVerified={enrollmentVerified}
            showEmpty
          />
        </div>

        <a
          href={`tel:${driver.phone}`}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white"
        >
          <Phone className="h-5 w-5" />
          <span>Contacter le livreur</span>
        </a>
      </section>

      {/* Article CGU KYC */}
      <KycCguNotice />
    </div>
  );
}

