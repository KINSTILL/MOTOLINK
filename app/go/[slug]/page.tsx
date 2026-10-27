import { notFound } from "next/navigation";
import Image from "next/image";
import prisma from "@/lib/prisma";
import DeliveryLinkForm from "./DeliveryLinkForm";
import { Bike, ShieldCheck, Store } from "lucide-react";

interface Props {
  params: { slug: string };
}

export default async function VendorDeliveryLinkPage({ params }: Props) {
  const vendor = await prisma.user.findUnique({
    where: { publicSlug: params.slug },
    select: {
      id: true,
      shopName: true,
      name: true,
      brandingLogoUrl: true,
      brandingColorHex: true,
      role: true,
    },
  });

  if (!vendor || vendor.role !== "VENDOR") {
    notFound();
  }

  const shopName = vendor.shopName || vendor.name || "Boutique Partenaire";
  const brandingColor = vendor.brandingColorHex || "#0284c7";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50 flex flex-col justify-between">
      <div className="mx-auto w-full max-w-md space-y-6">
        {/* Header avec logo ou branding de la boutique */}
        <header className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <Bike className="h-4 w-4" />
            <span>MotoLink Delivery</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            {vendor.brandingLogoUrl ? (
              <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={vendor.brandingLogoUrl}
                  alt={shopName}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-md font-bold text-xl"
                style={{ backgroundColor: brandingColor }}
              >
                <Store className="h-8 w-8" />
              </div>
            )}

            <div>
              <h1 className="text-xl font-extrabold text-slate-50">{shopName}</h1>
              <p className="text-xs text-slate-400">
                Bonjour ! {shopName} vous envoie un colis. Confirmez vos informations.
              </p>
            </div>
          </div>
        </header>

        {/* Formulaire client */}
        <DeliveryLinkForm slug={params.slug} shopName={shopName} />
      </div>

      {/* Footer confiance */}
      <footer className="mt-8 text-center text-xs text-slate-500 space-y-1">
        <p className="flex items-center justify-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span>Plateforme de traçabilité et preuve de livraison MotoLink</span>
        </p>
        <p>© {new Date().getFullYear()} MotoLink Cameroun</p>
      </footer>
    </main>
  );
}

