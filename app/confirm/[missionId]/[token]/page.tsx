import Link from "next/link";
import prisma from "@/lib/prisma";
import { verifyBuyerConfirmToken } from "@/lib/order-confirmation";
import BuyerConfirmButton from "@/components/BuyerConfirmButton";
import Footer from "@/components/Footer";
import { Bike, MapPin, Package, ShieldAlert } from "lucide-react";

function sanitizePublicAddress(fullAddress: string): string {
  return fullAddress
    .replace(/(porte|étage|apt|appartement|code|digicode)\s*[:#]?\s*\w+/gi, "")
    .trim();
}

export default async function BuyerConfirmPage({
  params,
}: {
  params: { missionId: string; token: string };
}) {
  const mission = await prisma.mission.findUnique({
    where: { id: params.missionId },
    select: {
      id: true,
      status: true,
      address: true,
      description: true,
      buyerName: true,
      buyerConfirmToken: true,
      buyerConfirmedAt: true,
      vendor: { select: { shopName: true, name: true } },
    },
  });

  const isValid =
    mission !== null &&
    verifyBuyerConfirmToken(mission.buyerConfirmToken, params.token);

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-6 text-slate-50">
      <div className="mx-auto max-w-md space-y-6">
        <header className="flex items-center gap-2 border-b border-slate-800 pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
            <Bike className="h-5 w-5" />
          </div>
          <span className="text-base font-extrabold">
            Moto<span className="text-secondary">Link</span> • Confirmation
          </span>
        </header>

        {!isValid || !mission ? (
          <div className="space-y-3 rounded-2xl border border-danger/40 bg-danger/10 p-5">
            <div className="flex items-center gap-2 text-danger">
              <ShieldAlert className="h-5 w-5" />
              <h1 className="text-base font-bold">Lien de confirmation invalide</h1>
            </div>
            <p className="text-sm text-slate-300">
              Ce lien est incorrect ou a expiré. Contactez directement votre vendeur.
            </p>
          </div>
        ) : (
          <>
            <section className="space-y-2">
              <h1 className="text-lg font-bold">
                Bonjour{mission.buyerName ? ` ${mission.buyerName}` : ""} 👋
              </h1>
              <p className="text-base text-slate-300">
                <span className="font-semibold text-slate-50">
                  {mission.vendor.shopName || mission.vendor.name || "Votre vendeur"}
                </span>{" "}
                prépare votre commande. Confirmez-vous votre adresse et votre
                disponibilité ?
              </p>
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    Adresse de livraison
                  </p>
                  <p className="text-base text-slate-50">
                    {sanitizePublicAddress(mission.address)}
                  </p>
                </div>
              </div>
              {mission.description && (
                <div className="flex items-start gap-2.5">
                  <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Commande
                    </p>
                    <p className="text-base text-slate-50">{mission.description}</p>
                  </div>
                </div>
              )}
            </section>

            {mission.status === "CANCELLED" ? (
              <p className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
                Cette commande a été annulée.
              </p>
            ) : (
              <BuyerConfirmButton
                missionId={mission.id}
                token={params.token}
                alreadyConfirmed={Boolean(mission.buyerConfirmedAt)}
              />
            )}

            <Link
              href={`/suivi/${mission.id}`}
              className="block text-center text-sm font-medium text-primary underline"
            >
              Suivre ma livraison
            </Link>
          </>
        )}

        <Footer />
      </div>
    </main>
  );
}

