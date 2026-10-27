import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  DEFAULT_CITY,
  getLeaderboardCities,
  getMonthRange,
  getMonthlyLeaderboard,
} from "@/lib/rating";
import { ArrowLeft, Crown, MapPin, Star, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

const MEDALS = ["🥇", "🥈", "🥉"];

function getMonthLabel(): string {
  const { start } = getMonthRange();
  // start est en UTC (veille 23:00 pour l'heure de Douala) : on affiche le mois en heure de Douala
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Douala",
  }).format(new Date(start.getTime() + 2 * 60 * 60 * 1000));
}

export default async function VendorLeaderboardPage({
  searchParams,
}: {
  searchParams?: { city?: string };
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "VENDOR") {
    redirect(`/dashboard/${session.role.toLowerCase()}`);
  }

  const cities = await getLeaderboardCities();
  const requestedCity = searchParams?.city?.trim();
  const city =
    cities.find((c) => c.toLowerCase() === requestedCity?.toLowerCase()) ||
    DEFAULT_CITY;

  const entries = await getMonthlyLeaderboard({ city, limit: 10 });

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/vendor/fleet"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300 transition active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Ma flotte</span>
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
          <Trophy className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-50">Tableau d&apos;honneur</h1>
          <p className="text-sm capitalize text-slate-400">{getMonthLabel()}</p>
        </div>
      </div>

      {/* Sélecteur de ville */}
      <nav
        aria-label="Choisir une ville"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {cities.map((c) => {
          const active = c === city;
          return (
            <Link
              key={c}
              href={`/dashboard/vendor/leaderboard?city=${encodeURIComponent(c)}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition active:scale-95 ${
                active
                  ? "border-secondary bg-secondary/15 text-secondary"
                  : "border-slate-800 bg-slate-900 text-slate-400"
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              {c}
            </Link>
          );
        })}
      </nav>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <Trophy className="mx-auto h-10 w-10 text-slate-600" />
          <p className="mt-3 text-base font-semibold text-slate-200">
            Pas encore de classement à {city}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Les livreurs apparaissent ici dès qu&apos;ils ont effectué une livraison
            ce mois-ci et reçu au moins une note.
          </p>
        </div>
      ) : (
        <ol className="space-y-3" data-testid="leaderboard-list">
          {entries.map((entry) => (
            <li
              key={entry.driverId}
              className={`rounded-2xl border p-4 ${
                entry.isTopOfMonth
                  ? "border-secondary/50 bg-secondary/10"
                  : "border-slate-800 bg-slate-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-lg font-extrabold text-slate-200">
                  {MEDALS[entry.rank - 1] ?? entry.rank}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    href={`/drivers/${entry.driverId}`}
                    className="block truncate text-base font-bold text-slate-50 hover:text-primary"
                  >
                    {entry.name}
                  </Link>
                  {entry.isTopOfMonth && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-secondary/40 bg-secondary/15 px-2 py-0.5 text-[11px] font-bold text-secondary">
                      <Crown className="h-3 w-3" />
                      Top Livreur du Mois
                    </span>
                  )}
                  <p className="text-xs text-slate-400">
                    {entry.deliveriesThisMonth} livraison
                    {entry.deliveriesThisMonth > 1 ? "s" : ""} ce mois •{" "}
                    {entry.ratingCount} avis
                  </p>
                </div>

                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-lg font-extrabold text-secondary">
                    <Star className="h-4 w-4 fill-secondary" />
                    {Math.round(entry.score)}
                    <span className="text-xs font-semibold text-slate-500">/100</span>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="text-center text-[11px] leading-relaxed text-slate-500">
        Score de confiance basé sur les 50 dernières notes. Indicateur de
        fiabilité : il ne constitue pas une certification.
      </p>
    </div>
  );
}

