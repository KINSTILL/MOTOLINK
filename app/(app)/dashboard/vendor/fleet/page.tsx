"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  UserPlus,
  RotateCw,
  AlertTriangle,
  X,
  Phone,
  CheckCircle2,
  HelpCircle,
  Trophy,
  BookUser,
} from "lucide-react";
import FleetTabs, { FleetCounts, FleetTab } from "@/components/FleetTabs";
import FleetDriverCard, { FleetDriverItem } from "@/components/FleetDriverCard";
import FleetEmptyState from "@/components/FleetEmptyState";
import NotifyOfflineDriverModal from "@/components/NotifyOfflineDriverModal";
import InviteDriverModal from "@/components/InviteDriverModal";

export default function VendorFleetPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<FleetTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [fleet, setFleet] = useState<FleetDriverItem[]>([]);
  const [counts, setCounts] = useState<FleetCounts>({
    all: 0,
    available: 0,
    on_mission: 0,
    offline: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modale de notification coursier hors ligne
  const [selectedOfflineDriver, setSelectedOfflineDriver] = useState<FleetDriverItem | null>(null);

  // Modale d'invitation de livreur (parrainage)
  const [showAddModal, setShowAddModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Debounce de la saisie recherche (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Chargement des données de flotte
  const fetchFleet = useCallback(
    async (isBackground = false) => {
      if (!isBackground) {
        setLoading(true);
        setError(null);
      }
      try {
        const params = new URLSearchParams();
        if (activeTab !== "all") params.set("filter", activeTab);
        if (debouncedSearch) params.set("search", debouncedSearch);

        const res = await fetch(`/api/vendors/fleet?${params.toString()}`, {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Impossible de charger votre flotte.");
        }

        const data = await res.json();
        setFleet(data.fleet || []);
        if (data.counts) {
          setCounts(data.counts);
        }
      } catch (err: any) {
        if (!isBackground) {
          setError(err.message || "Erreur de connexion.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, debouncedSearch]
  );

  // Fetch à chaque changement d'onglet ou de recherche debouncée
  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  // Polling léger toutes les 30s si la page est au premier plan
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchFleet(true);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchFleet]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchFleet(false);
  };

  const handleNotifySuccess = (channel: string) => {
    const driverName = selectedOfflineDriver?.name || "le livreur";
    setSelectedOfflineDriver(null);
    setToastMessage(`Notification envoyée via ${channel.toUpperCase()} à ${driverName}.`);
    fetchFleet(true);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleRemoveDriver = async (driver: FleetDriverItem) => {
    try {
      const res = await fetch(`/api/vendors/fleet/${driver.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Échec de la suppression.");
        return;
      }
      // Mise à jour optimiste locale
      setFleet((prev) => prev.filter((d) => d.id !== driver.id));
      // Re-fetch des compteurs complets
      fetchFleet(true);
      setToastMessage(`${driver.name} a été retiré de votre flotte.`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch {
      alert("Erreur réseau lors de la suppression.");
    }
  };

  const handleProposeMission = (driver: FleetDriverItem) => {
    startTransition(() => {
      router.push(`/missions/new?driverId=${driver.driverId}`);
    });
  };

  return (
    <div className="space-y-5 pb-16">
      {/* Toast de confirmation */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-primary/30 bg-primary/95 px-4 py-2.5 text-xs font-semibold text-white shadow-xl backdrop-blur">
          {toastMessage}
        </div>
      )}

      {/* Titre & Rafraîchissement */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-50">Ma flotte</h1>
          <p className="text-sm text-slate-400">
            Gérez vos livreurs de confiance et proposez-leur des courses.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/vendor/directory"
            aria-label="Annuaire des livreurs"
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-bold text-primary transition active:scale-95"
          >
            <BookUser className="h-4 w-4" />
            <span>Annuaire</span>
          </Link>
          <Link
            href="/dashboard/vendor/leaderboard"
            aria-label="Tableau d'honneur du mois"
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-secondary/30 bg-secondary/10 px-3 text-xs font-bold text-secondary transition active:scale-95"
          >
            <Trophy className="h-4 w-4" />
            <span>Top du mois</span>
          </Link>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            aria-label="Actualiser la liste"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 transition hover:text-slate-200 active:scale-95"
          >
            <RotateCw className={`h-4 w-4 ${refreshing ? "animate-spin text-primary" : ""}`} />
          </button>
        </div>
      </div>

      {/* Barre de recherche avec icône loupe */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher par nom ou numéro..."
          className="h-12 w-full rounded-xl border border-slate-800 bg-slate-900 pl-11 pr-10 text-sm text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Onglets statut : Tous | Dispo | En mission | Hors ligne */}
      <FleetTabs
        activeTab={activeTab}
        counts={counts}
        onChange={(tab) => {
          setActiveTab(tab);
        }}
      />

      {/* États d'affichage : Erreur | Chargement | Vide | Liste */}
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-6 text-center text-danger">
          <AlertTriangle className="h-8 w-8" />
          <p className="text-sm font-semibold">{error}</p>
          <button
            type="button"
            onClick={() => fetchFleet()}
            className="rounded-xl bg-danger/20 px-4 py-2 text-xs font-bold text-danger border border-danger/30 active:scale-95"
          >
            Réessayer
          </button>
        </div>
      ) : loading ? (
        // Skeletons de 3 cartes
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4"
            />
          ))}
        </div>
      ) : fleet.length === 0 ? (
        <FleetEmptyState
          filter={activeTab}
          onAddDriver={() => setShowAddModal(true)}
        />
      ) : (
        <div className="space-y-3">
          {fleet.map((driver) => (
            <FleetDriverCard
              key={driver.id}
              driver={driver}
              onRemove={handleRemoveDriver}
              onPropose={handleProposeMission}
              onNotifyOffline={(d) => setSelectedOfflineDriver(d)}
            />
          ))}
        </div>
      )}

      {/* Bouton d'action flottant "Ajouter un livreur" */}
      <div className="sticky bottom-20 z-20 pt-2">
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-primary/30 transition active:scale-[0.98] hover:bg-primary-hover"
        >
          <UserPlus className="h-5 w-5" />
          <span>Ajouter un livreur à ma flotte</span>
        </button>
      </div>

      {/* Modal Inviter un livreur */}
      <InviteDriverModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          fetchFleet(true);
        }}
      />

      {/* Modale de notification coursier hors ligne */}
      {selectedOfflineDriver && (
        <NotifyOfflineDriverModal
          driverId={selectedOfflineDriver.driverId}
          driverName={selectedOfflineDriver.name}
          onClose={() => setSelectedOfflineDriver(null)}
          onSuccess={handleNotifySuccess}
        />
      )}
    </div>
  );
}

