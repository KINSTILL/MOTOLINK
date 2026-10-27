import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCarnetBySlug } from "@/lib/carnet";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const carnet = await getCarnetBySlug(params.slug);
  if (!carnet) {
    return { title: "Carnet de bord introuvable — MotoLink" };
  }
  return {
    title: `${carnet.name} — Carnet de bord MotoLink`,
    description: `Profil public de ${carnet.name} : note ${carnet.ratingAverage}/5, ${carnet.deliveredCount} livraisons.`,
  };
}

export default async function CarnetPage({
  params,
}: {
  params: { slug: string };
}) {
  const carnet = await getCarnetBySlug(params.slug);
  if (!carnet) notFound();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-6 pt-8">
        <div className="text-center">
          <div className="w-24 h-24 rounded-full bg-slate-800 mx-auto flex items-center justify-center text-3xl font-bold">
            {carnet.initials}
          </div>
          <h1 className="text-xl font-semibold mt-4">{carnet.name}</h1>
          <div className="text-sm text-slate-400 mt-1">
            ⭐ {carnet.ratingAverage || "—"} ({carnet.ratingCount} avis)
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400">Livraisons effectuées</span>
            <span className="font-semibold">{carnet.deliveredCount}</span>
          </div>
          {carnet.zones && (
            <div className="flex justify-between">
              <span className="text-slate-400">Zones</span>
              <span className="font-medium text-right">{carnet.zones}</span>
            </div>
          )}
        </div>

        <div className="bg-slate-900 rounded-2xl p-4">
          <div className="text-sm text-slate-400 mb-2">Vérifications</div>
          <div className="flex flex-wrap gap-2">
            {carnet.badges.kycVerified && (
              <Badge emoji="✅" label="Identité vérifiée" />
            )}
            {carnet.badges.syndicate && (
              <Badge emoji="🤝" label="Membre de syndicat" />
            )}
            {carnet.badges.enrolled && (
              <Badge emoji="🏛️" label="Enrôlé CUD" />
            )}
            {carnet.badges.sponsor && (
              <Badge emoji="🎖️" label={`Parrain ${carnet.badges.sponsor}`} />
            )}
            {!carnet.badges.kycVerified &&
              !carnet.badges.syndicate &&
              !carnet.badges.enrolled &&
              !carnet.badges.sponsor && (
                <span className="text-sm text-slate-500">
                  Aucun badge pour l&apos;instant
                </span>
              )}
          </div>
        </div>

        <Link
          href={`/login?redirect=/dashboard/vendor/directory&driver=${carnet.slug}`}
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center font-semibold py-3 rounded-xl"
        >
          Contacter via MotoLink
        </Link>

        <p className="text-xs text-center text-slate-500 pt-4">
          Carnet de bord MotoLink · {carnet.name} · Aucune donnée personnelle
          exposée
        </p>
      </div>
    </div>
  );
}

function Badge({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-lg text-xs">
      <span>{emoji}</span>
      <span>{label}</span>
    </span>
  );
}
