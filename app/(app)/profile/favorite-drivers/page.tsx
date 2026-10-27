"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KycBadges } from "@/components/KycBadges";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Heart,
  Loader2,
  Phone,
  Search,
  Star,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

interface DriverSummary {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  kycStatus: string;
  verified: boolean;
  averageRating: number | null;
  ratingsCount: number;
  badges: {
    idCardVerified: boolean;
    syndicateVerified: boolean;
    syndicateName: string | null;
    enrollmentVerified: boolean;
  };
}

interface FavoriteDriverItem {
  id: string;
  buyerId: string;
  driverId: string;
  note: string | null;
  createdAt: string;
  driver: DriverSummary;
}

const MAX_FAVORITE_DRIVERS = 5;

function getDriverInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function FavoriteDriversPage() {
  const [favorites, setFavorites] = useState<FavoriteDriverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [searchResults, setSearchResults] = useState<DriverSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch("/api/favorite-drivers");
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // Recherche dynamique par téléphone ou par nom
  useEffect(() => {
    if (!showAddModal || searchInput.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/favorite-drivers?q=${encodeURIComponent(searchInput.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.searchResults || []);
        }
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchInput, showAddModal]);

  const handleAddByPhoneOrId = async (payload: {
    driverPhone?: string;
    driverId?: string;
  }) => {
    setAdding(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/favorite-drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          note: noteInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: "error",
          text: data.error || "Impossible d'ajouter ce livreur.",
        });
        return;
      }

      setFavorites((prev) => [data.favorite, ...prev]);
      setSearchInput("");
      setNoteInput("");
      setSearchResults([]);
      setShowAddModal(false);
      setFeedback({
        type: "success",
        text: "Livreur ajouté à vos livreurs préférés.",
      });
    } catch {
      setFeedback({
        type: "error",
        text: "Erreur réseau lors de l'ajout.",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (favId: string) => {
    setRemovingId(favId);
    setFeedback(null);

    try {
      const res = await fetch(`/api/favorite-drivers/${favId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFavorites((prev) => prev.filter((item) => item.id !== favId));
        setFeedback({
          type: "success",
          text: "Livreur retiré de votre liste.",
        });
      }
    } finally {
      setRemovingId(null);
    }
  };

  const isMaxReached = favorites.length >= MAX_FAVORITE_DRIVERS;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300 transition active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Profil</span>
        </Link>

        <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
          {favorites.length} / {MAX_FAVORITE_DRIVERS} livreurs
        </span>
      </div>

      <div>
        <h1 className="text-lg font-bold text-slate-50">
          Mes livreurs préférés
        </h1>
        <p className="text-base text-slate-400">
          Enregistrez jusqu&apos;à {MAX_FAVORITE_DRIVERS} livreurs de confiance pour leur proposer vos courses en priorité.
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2.5 rounded-2xl border p-4 text-sm font-semibold ${
            feedback.type === "success"
              ? "border-success/40 bg-success/10 text-success"
              : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Bouton Ajouter un livreur */}
      <button
        type="button"
        disabled={isMaxReached}
        onClick={() => {
          setFeedback(null);
          setShowAddModal(true);
        }}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-400 disabled:shadow-none"
      >
        <UserPlus className="h-5 w-5" />
        <span>
          {isMaxReached
            ? "Limite de 5 livreurs atteinte"
            : "Ajouter un livreur"}
        </span>
      </button>

      {/* Modale / Panneau de recherche et d'ajout */}
      {showAddModal && (
        <div className="rounded-2xl border border-primary/40 bg-slate-900 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-50">
              Rechercher un livreur vérifié
            </h2>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Téléphone (+237 6XX...) ou nom du livreur"
                className="h-14 w-full rounded-xl border border-slate-700 bg-slate-950 pl-11 pr-4 text-base text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
              />
            </div>

            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Note personnelle (optionnel, ex: Quartier Akwa)"
              className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
            />

            {/* Résultats de recherche en direct */}
            {searching && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Recherche en cours...</span>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Livreurs vérifiés trouvés
                </p>
                {searchResults.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-bold text-slate-50">
                        {d.name}
                      </p>
                      <p className="text-xs text-slate-400">{d.phone}</p>
                      <KycBadges
                        idCardVerified={d.badges.idCardVerified}
                        syndicateVerified={d.badges.syndicateVerified}
                        syndicateName={d.badges.syndicateName}
                        enrollmentVerified={d.badges.enrollmentVerified}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={adding}
                      onClick={() => handleAddByPhoneOrId({ driverId: d.id })}
                      className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
                    >
                      Ajouter
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={!searchInput.trim() || adding}
              onClick={() =>
                handleAddByPhoneOrId({ driverPhone: searchInput.trim() })
              }
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
            >
              {adding ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <UserPlus className="h-5 w-5" />
                  <span>Ajouter par numéro / nom</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Liste des livreurs préférés */}
      <section className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 p-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
              <Heart className="h-6 w-6" />
            </div>
            <p className="text-base text-slate-400">
              Vous n&apos;avez pas encore de livreur préféré.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {fav.driver.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={fav.driver.photoUrl}
                        alt={fav.driver.name}
                        className="h-12 w-12 rounded-full object-cover border border-slate-700"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/20 text-base font-extrabold text-primary">
                        {getDriverInitials(fav.driver.name)}
                      </div>
                    )}

                    <div>
                      <Link
                        href={`/drivers/${fav.driver.id}`}
                        className="text-base font-bold text-slate-50 hover:text-primary"
                      >
                        {fav.driver.name}
                      </Link>
                      <p className="flex items-center gap-1 text-xs text-slate-400">
                        <Phone className="h-3 w-3 text-primary" />
                        <span>{fav.driver.phone}</span>
                      </p>
                      <div className="flex items-center gap-1 pt-0.5 text-xs text-secondary">
                        <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
                        <span className="font-semibold">
                          {fav.driver.averageRating !== null
                            ? `${fav.driver.averageRating} / 5 (${fav.driver.ratingsCount})`
                            : "Nouveau livreur"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={removingId === fav.id}
                    onClick={() => handleRemove(fav.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger transition active:scale-95 disabled:opacity-50"
                  >
                    {removingId === fav.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    <span>Retirer</span>
                  </button>
                </div>

                {fav.note && (
                  <p className="rounded-xl bg-slate-950/70 px-3 py-2 text-xs text-slate-300 border border-slate-800">
                    Note : {fav.note}
                  </p>
                )}

                <KycBadges
                  idCardVerified={fav.driver.badges.idCardVerified}
                  syndicateVerified={fav.driver.badges.syndicateVerified}
                  syndicateName={fav.driver.badges.syndicateName}
                  enrollmentVerified={fav.driver.badges.enrollmentVerified}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Mention CGU Livreurs préférés */}
      <p className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs leading-relaxed text-slate-400">
        L&apos;acheteur ou le vendeur peut enregistrer des livreurs préférés et leur proposer directement des courses. Cette fonctionnalité est un annuaire de confiance. MotoLink ne garantit pas la disponibilité ni la qualité du livreur. Le livreur reste libre d&apos;accepter ou de refuser.
      </p>
    </div>
  );
}

