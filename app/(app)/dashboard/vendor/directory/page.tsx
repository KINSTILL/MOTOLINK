"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookUser,
  Search,
  MapPin,
  ShieldCheck,
  Award,
  FileCheck2,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCw,
  Users,
  Star,
} from "lucide-react";
import { ContactStatus, DirectoryDriver } from "@/lib/directory";

const CITIES = ["Douala", "Yaoundé", "Bafoussam", "Garoua", "Kribi"];

export default function VendorDirectoryPage() {
  const [drivers, setDrivers] = useState<DirectoryDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtres
  const [search, setSearch] = useState("");
  const [selectedCity, setSelectedCity] = useState("Douala");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "on_mission" | "offline">("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  // État d'envoi de demandes de contact
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchDrivers = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (selectedCity) params.set("city", selectedCity);
        if (search.trim()) params.set("search", search.trim());
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (verifiedOnly) params.set("verified", "true");
        params.set("limit", "50");

        const res = await fetch(`/api/directory/drivers?${params.toString()}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Impossible de charger l'annuaire.");
        }

        setDrivers(data.drivers || []);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Erreur lors du chargement de l'annuaire."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedCity, search, statusFilter, verifiedOnly]
  );

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const handleRequestContact = async (driver: DirectoryDriver) => {
    if (submittingId || driver.inFleet || driver.contactStatus === "pending") return;
    setSubmittingId(driver.driverId);

    try {
      const res = await fetch("/api/directory/contact-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: driver.driverId }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Échec de l'envoi de la demande.");
      }

      // Mise à jour optimiste de la carte
      setDrivers((prev) =>
        prev.map((d) =>
          d.driverId === driver.driverId ? { ...d, contactStatus: "pending" as ContactStatus } : d
        )
      );

      setToastMessage(
        `Demande envoyée à ${driver.name}. Le livreur a été notifié.`
      );
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setSubmittingId(null);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || "ML";
  };

  return (
    <div className="space-y-6">
      {/* Toast de confirmation */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-primary/30 bg-primary/95 px-4 py-2.5 text-xs font-semibold text-white shadow-xl backdrop-blur animate-in fade-in">
          {toastMessage}
        </div>
      )}

      {/* Navigation retour */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/vendor/fleet"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300 transition active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Ma flotte</span>
        </Link>

        <button
          type="button"
          onClick={() => fetchDrivers(true)}
          disabled={refreshing || loading}
          aria-label="Actualiser l'annuaire"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 transition hover:text-slate-200 active:scale-95"
        >
          <RotateCw className={`h-4 w-4 ${refreshing ? "animate-spin text-primary" : ""}`} />
        </button>
      </div>

      {/* En-tête de l'annuaire */}
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <BookUser className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-50">Annuaire des livreurs</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Livreurs indépendants volontairement inscrits. Le numéro de téléphone reste confidentiel et
            n&apos;est révélé qu&apos;après acceptation de votre demande de contact.
          </p>
        </div>
      </div>

      {/* Sélecteur de ville */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Villes">
        {CITIES.map((city) => {
          const active = selectedCity.toLowerCase() === city.toLowerCase();
          return (
            <button
              key={city}
              type="button"
              onClick={() => setSelectedCity(city)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
                active
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>{city}</span>
            </button>
          );
        })}
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, quartier, zone..."
          className="h-12 w-full rounded-xl border border-slate-800 bg-slate-900 pl-11 pr-4 text-sm text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Filtres de statut & KYC */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "all", label: "Tous" },
              { id: "available", label: "Disponibles" },
              { id: "on_mission", label: "En mission" },
              { id: "offline", label: "Hors ligne" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                statusFilter === tab.id
                  ? "bg-slate-800 text-slate-100 border border-slate-700"
                  : "bg-slate-900/50 text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-400 hover:text-slate-200">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/20"
          />
          <span>Vérifiés KYC uniquement</span>
        </label>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-xs font-semibold text-danger">
          {error}
        </div>
      )}

      {/* Liste des livreurs */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-slate-400 font-medium">Recherche dans l&apos;annuaire...</p>
        </div>
      ) : drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center space-y-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-slate-400">
            <Users className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-slate-200">Aucun livreur trouvé</h3>
          <p className="max-w-xs text-xs text-slate-400">
            Aucun livreur visible ne correspond à vos critères à {selectedCity}. Essayez d&apos;élargir
            votre recherche ou de sélectionner une autre ville.
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="directory-list">
          {drivers.map((driver) => {
            const isAvailable = driver.driverStatus === "AVAILABLE";
            const isOnMission = driver.driverStatus === "ON_MISSION";
            const isOffline = driver.driverStatus === "OFFLINE";

            return (
              <div
                key={driver.driverId}
                className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-all hover:border-slate-700 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {driver.photoUrl ? (
                      <img
                        src={driver.photoUrl}
                        alt={driver.name}
                        className="h-12 w-12 shrink-0 rounded-full border border-slate-700 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-primary/20 text-sm font-bold text-primary">
                        {getInitials(driver.name)}
                      </div>
                    )}

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-50 leading-tight">
                          {driver.name}
                        </h3>
                        {driver.inFleet && (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                            Dans votre flotte
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <MapPin className="h-3 w-3 text-secondary" />
                        <span>{driver.city}</span>
                        {driver.zones.length > 0 && (
                          <span className="text-slate-500">• {driver.zones.join(", ")}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Score de confiance */}
                  {driver.score !== null && (
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1 text-xs font-semibold text-secondary">
                        <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
                        <span>{Math.round(driver.score)}</span>
                        <span className="text-[10px] text-slate-500">/100</span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {driver.ratingCount} avis
                      </span>
                    </div>
                  )}
                </div>

                {/* Badges de confiance & Statut */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {isAvailable && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Disponible
                    </span>
                  )}
                  {isOnMission && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      En mission
                    </span>
                  )}
                  {isOffline && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-slate-500" />
                      Hors ligne
                    </span>
                  )}

                  {driver.badges.includes("id_verified") && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      <ShieldCheck className="h-3 w-3" />
                      KYC vérifié
                    </span>
                  )}
                  {driver.badges.includes("syndicate") && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 text-[11px] font-semibold text-secondary">
                      <Award className="h-3 w-3" />
                      Syndicat
                    </span>
                  )}
                  {driver.badges.includes("enrolled") && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-400">
                      <FileCheck2 className="h-3 w-3" />
                      Enrôlé CUD
                    </span>
                  )}
                </div>

                {/* Action de contact contextuelle */}
                <div className="pt-2 border-t border-slate-800/80">
                  {driver.inFleet ? (
                    <Link
                      href="/dashboard/vendor/fleet"
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20 active:scale-95"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Livreur dans votre flotte</span>
                    </Link>
                  ) : driver.contactStatus === "pending" ? (
                    <button
                      type="button"
                      disabled
                      className="flex min-h-[44px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs font-bold text-amber-300 opacity-90"
                    >
                      <Clock className="h-4 w-4" />
                      <span>Demande envoyée • En attente de réponse</span>
                    </button>
                  ) : driver.contactStatus === "refused" ? (
                    <button
                      type="button"
                      disabled
                      className="flex min-h-[44px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 text-xs font-semibold text-slate-400"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Demande déclinée</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submittingId === driver.driverId}
                      onClick={() => handleRequestContact(driver)}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-white shadow-md shadow-primary/25 transition active:scale-95 hover:bg-primary-hover disabled:opacity-50"
                    >
                      {submittingId === driver.driverId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      <span>Demander le contact</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Note d'information CGU */}
      <p className="text-center text-[11px] leading-relaxed text-slate-500 pt-2">
        La mise en relation via l&apos;annuaire respecte le libre consentement du livreur. Aucun contrat
        d&apos;exclusivité ni lien de subordination n&apos;est créé.
      </p>
    </div>
  );
}

