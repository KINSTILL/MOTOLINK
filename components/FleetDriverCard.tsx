"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Star,
  Phone,
  PhoneOff,
  ShieldCheck,
  Award,
  FileCheck2,
  Send,
  BellRing,
  Clock,
  Trash2,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { DriverStatus } from "@/components/DriverStatusToggle";

export interface FleetDriverItem {
  id: string; // favoriteDriverId
  driverId: string;
  name: string;
  phone: string;
  phoneVisibleToVendor: boolean;
  photoUrl: string | null;
  driverStatus: DriverStatus;
  rating: {
    average: number;
    count: number;
  };
  score?: number | null; // score de confiance sur 100 (null si aucune note)
  deliveriesCount?: number; // nombre de livraisons réussies
  badges: string[]; // ["id_verified", "syndicate", "enrolled"]
  hasActiveSubscription: boolean;
  source: string; // "manual" | "sponsored" | "directory"
  priorityMissionsRemaining: number;
  isOfflineNotifiable: boolean;
}

interface FleetDriverCardProps {
  driver: FleetDriverItem;
  onRemove: (driver: FleetDriverItem) => void;
  onPropose?: (driver: FleetDriverItem) => void;
  onNotifyOffline?: (driver: FleetDriverItem) => Promise<void> | void;
}

export default function FleetDriverCard({
  driver,
  onRemove,
  onPropose,
  onNotifyOffline,
}: FleetDriverCardProps) {
  const [notifying, setNotifying] = useState(false);
  const [notifiedJustNow, setNotifiedJustNow] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [canNotifyStatus, setCanNotifyStatus] = useState<boolean>(driver.isOfflineNotifiable);
  const [hoursLeft, setHoursLeft] = useState<number | null>(null);

  // Vérification dynamique du statut 24h pour les livreurs hors ligne
  React.useEffect(() => {
    if (driver.driverStatus === "OFFLINE") {
      let isMounted = true;
      fetch(`/api/vendors/notify-offline-driver/status?driverId=${driver.driverId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (isMounted && data) {
            setCanNotifyStatus(Boolean(data.canNotify));
            if (!data.canNotify && data.nextAvailableAt) {
              const diffMs = new Date(data.nextAvailableAt).getTime() - Date.now();
              const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
              setHoursLeft(hours);
            }
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }
  }, [driver.driverId, driver.driverStatus]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || "ML";
  };

  const handleNotify = async () => {
    if (notifying || notifiedJustNow || !driver.isOfflineNotifiable) return;
    setNotifying(true);
    try {
      if (onNotifyOffline) {
        await onNotifyOffline(driver);
      } else {
        await fetch(`/api/vendors/fleet/${driver.id}`, { method: "POST" });
      }
      setNotifiedJustNow(true);
    } catch {
      // Ignorer
    } finally {
      setNotifying(false);
    }
  };

  const isAvailable = driver.driverStatus === "AVAILABLE";
  const isOnMission = driver.driverStatus === "ON_MISSION";
  const isOffline = driver.driverStatus === "OFFLINE";

  return (
    <div
      role="article"
      aria-label={`Fiche livreur ${driver.name}, statut ${
        isAvailable ? "Disponible" : isOnMission ? "En mission" : "Hors ligne"
      }`}
      className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-all hover:border-slate-700"
    >
      <div className="space-y-3">
        {/* En-tête : Avatar, Nom, Note, Téléphone, Badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Avatar rond 40x40 ou initiales */}
            {driver.photoUrl ? (
              <img
                src={driver.photoUrl}
                alt={driver.name}
                className="h-11 w-11 shrink-0 rounded-full border border-slate-700 object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-primary/20 text-sm font-bold text-primary">
                {getInitials(driver.name)}
              </div>
            )}

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-50 leading-tight">
                  {driver.name}
                </h3>

                {/* Source badge */}
                {driver.source === "sponsored" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30">
                    <span>🎁 Parrainé</span>
                    {driver.priorityMissionsRemaining > 0 && (
                      <span className="text-[9px] text-purple-200 font-medium">
                        (Priorité {3 - driver.priorityMissionsRemaining}/3)
                      </span>
                    )}
                  </span>
                )}
                {driver.source === "directory" && (
                  <span className="rounded-full bg-blue-500/20 px-2 py-0.2 text-[10px] font-bold text-blue-300 border border-blue-500/30">
                    Annuaire
                  </span>
                )}
              </div>

              {/* Téléphone (cliquable si visible) */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                {driver.phoneVisibleToVendor ? (
                  <a
                    href={`tel:${driver.phone.replace(/\s+/g, "")}`}
                    className="flex items-center gap-1 text-slate-300 hover:text-primary transition"
                  >
                    <Phone className="h-3 w-3 text-secondary" />
                    <span>{driver.phone}</span>
                  </a>
                ) : (
                  <span className="flex items-center gap-1 text-slate-500 italic">
                    <PhoneOff className="h-3 w-3" />
                    <span>Numéro masqué</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Note moyenne : "⭐ 4.9 (48 livraisons)" + score de confiance /100 */}
          <div className="flex flex-col items-end gap-1">
            <div
              className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1 text-xs font-semibold text-secondary"
              data-testid="fleet-driver-rating"
            >
              <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
              <span>{driver.rating.average.toFixed(1)}</span>
              <span className="text-[10px] text-slate-500">
                ({driver.deliveriesCount ?? 0} livraison
                {(driver.deliveriesCount ?? 0) > 1 ? "s" : ""})
              </span>
            </div>
            {driver.score !== null && driver.score !== undefined && (
              <span
                className="text-[10px] font-semibold text-slate-400"
                title="Score de confiance sur 100 (50 dernières notes) — indicateur de fiabilité, non certification"
                data-testid="fleet-driver-score"
              >
                Confiance {Math.round(driver.score)}/100
              </span>
            )}
          </div>
        </div>

        {/* Badges de confiance KYC & Statut de disponibilité */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {/* Badge Statut */}
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

          {/* Badges KYC */}
          {driver.badges.includes("id_verified") && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <ShieldCheck className="h-3 w-3" />
              KYC
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
      </div>

      {/* Actions contextuelles selon le statut */}
      <div className="mt-4 flex items-center gap-2 pt-3 border-t border-slate-800/80">
        {/* Bouton d'action principale selon le statut */}
        {isAvailable && (
          <Link
            href={`/missions/new?driverId=${driver.driverId}`}
            onClick={(e) => {
              if (onPropose) {
                e.preventDefault();
                onPropose(driver);
              }
            }}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/25 transition active:scale-95 hover:bg-primary-hover"
          >
            <Send className="h-4 w-4" />
            <span>Proposer une mission</span>
          </Link>
        )}

        {isOnMission && (
          <button
            type="button"
            disabled
            className="flex min-h-[48px] flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-300 opacity-80"
          >
            <Clock className="h-4 w-4" />
            <span>En mission</span>
          </button>
        )}

        {isOffline && (
          <button
            type="button"
            disabled={!canNotifyStatus || notifying || notifiedJustNow}
            onClick={() => {
              if (onNotifyOffline) {
                onNotifyOffline(driver);
              } else {
                handleNotify();
              }
            }}
            className={`flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold transition active:scale-95 ${
              notifiedJustNow
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : canNotifyStatus
                ? "border border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-600 hover:bg-slate-750"
                : "cursor-not-allowed border border-slate-800 bg-slate-900/60 text-slate-500"
            }`}
          >
            {notifying ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : notifiedJustNow ? (
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            ) : (
              <BellRing className="h-4 w-4" />
            )}
            <span>
              {notifiedJustNow
                ? "Demande envoyée !"
                : canNotifyStatus
                ? "Lui demander s'il est dispo"
                : hoursLeft
                ? `Déjà notifié (${hoursLeft}h)`
                : "Déjà notifié (24h)"}
            </span>
          </button>
        )}

        {/* Bouton secondaire discret "Retirer" */}
        <button
          type="button"
          aria-label={`Retirer ${driver.name} de ma flotte`}
          disabled={removing}
          onClick={async () => {
            if (
              window.confirm(
                `Voulez-vous retirer ${driver.name} de votre flotte de livreurs ?`
              )
            ) {
              setRemoving(true);
              try {
                await onRemove(driver);
              } finally {
                setRemoving(false);
              }
            }
          }}
          className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-slate-800 bg-slate-950/60 text-slate-400 transition hover:border-danger/30 hover:bg-danger/10 hover:text-danger active:scale-95"
        >
          {removing ? (
            <Loader2 className="h-4 w-4 animate-spin text-danger" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

