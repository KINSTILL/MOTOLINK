"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Lock,
  MapPin,
  AlertCircle,
  CheckCircle2,
  X,
  CalendarDays,
  CalendarClock,
  Ban,
  UserX,
  Loader2,
  ChevronRight,
  Package,
} from "lucide-react";
import { formatFCFA } from "@/lib/utils";

export interface AgendaMissionItem {
  id: string;
  vendorId?: string;
  driverId?: string | null;
  buyerName?: string | null;
  buyerPhone?: string;
  address: string;
  articlePhotoUrls?: string[];
  description?: string | null;
  price: number;
  type?: string;
  status: string;
  scheduledAt: string | Date;
  scheduledStatus?: string | null;
  vendor?: {
    id?: string;
    shopName?: string | null;
    name?: string | null;
    phone?: string;
  };
  driver?: {
    id?: string;
    name?: string | null;
    phone?: string;
  } | null;
}

interface AgendaListProps {
  missions: AgendaMissionItem[];
  userRole: "DRIVER" | "VENDOR";
  currentUserId?: string;
  onRefresh?: () => void;
}

/**
 * Formate le titre du jour (Aujourd'hui, Demain, ou Jour JJ Mois)
 */
function getDayGroupLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) {
    return "Aujourd'hui";
  }
  if (target.getTime() === tomorrow.getTime()) {
    return "Demain";
  }

  const raw = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Formate l'heure HH:MM
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AgendaList({
  missions: initialMissions,
  userRole,
  currentUserId,
  onRefresh,
}: AgendaListProps) {
  const [missions, setMissions] = useState<AgendaMissionItem[]>(initialMissions);

  // Synchronisation avec initialMissions
  React.useEffect(() => {
    setMissions(initialMissions);
  }, [initialMissions]);

  // Modale Report (vendeur)
  const [rescheduleMission, setRescheduleMission] = useState<AgendaMissionItem | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Modale Annulation / Refus
  const [cancelMission, setCancelMission] = useState<AgendaMissionItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Fermer le toast après 4s
  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Ouverture modale report
  const openRescheduleModal = (m: AgendaMissionItem) => {
    setRescheduleMission(m);
    setRescheduleReason("");
    setRescheduleError(null);

    // Initialiser la date actuelle de la mission + 24h par défaut
    const current = new Date(m.scheduledAt);
    const d = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(current.getHours()).padStart(2, "0");
    const min = String(current.getMinutes()).padStart(2, "0");
    setNewDate(`${yyyy}-${mm}-${dd}`);
    setNewTime(`${hh}:${min}`);
  };

  // Soumission report
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleMission) return;

    if (!newDate || !newTime) {
      setRescheduleError("Veuillez sélectionner une date et une heure.");
      return;
    }

    const scheduledDate = new Date(`${newDate}T${newTime}:00`);
    if (isNaN(scheduledDate.getTime())) {
      setRescheduleError("Date ou heure invalide.");
      return;
    }

    const diff = scheduledDate.getTime() - Date.now();
    if (diff < 2 * 60 * 60 * 1000 - 1000) {
      setRescheduleError("La nouvelle date doit être fixée au moins 2 heures à l'avance.");
      return;
    }

    setRescheduleLoading(true);
    setRescheduleError(null);

    try {
      const res = await fetch(`/api/missions/${rescheduleMission.id}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: scheduledDate.toISOString(),
          reason: rescheduleReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRescheduleError(data.error || "Impossible de reporter la mission.");
        setRescheduleLoading(false);
        return;
      }

      setToast({ type: "success", message: "Mission reportée avec succès." });
      setRescheduleMission(null);

      // Mise à jour locale
      setMissions((prev) =>
        prev.map((item) =>
          item.id === rescheduleMission.id
            ? { ...item, scheduledAt: scheduledDate.toISOString() }
            : item
        )
      );

      if (onRefresh) onRefresh();
    } catch {
      setRescheduleError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setRescheduleLoading(false);
    }
  };

  // Ouverture modale annulation
  const openCancelModal = (m: AgendaMissionItem) => {
    setCancelMission(m);
    setCancelReason("");
    setCancelError(null);
  };

  // Soumission annulation / refus
  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelMission) return;

    if (!cancelReason.trim()) {
      setCancelError("Le motif est obligatoire.");
      return;
    }

    setCancelLoading(true);
    setCancelError(null);

    try {
      const res = await fetch(`/api/missions/${cancelMission.id}/cancel-scheduled`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.error || "Impossible d'annuler la mission.");
        setCancelLoading(false);
        return;
      }

      const msg =
        userRole === "DRIVER"
          ? "Mission refusée. Elle a été remise sur le marché ouvert."
          : "Mission programmée annulée.";

      setToast({ type: "success", message: msg });
      setCancelMission(null);

      // Mise à jour locale
      if (userRole === "DRIVER") {
        // Le livreur s'est désisté : retirer ou mettre à jour
        setMissions((prev) => prev.filter((item) => item.id !== cancelMission.id));
      } else {
        // Le vendeur a annulé : passer en cancelled
        setMissions((prev) =>
          prev.map((item) =>
            item.id === cancelMission.id
              ? { ...item, scheduledStatus: "cancelled", status: "CANCELLED" }
              : item
          )
        );
      }

      if (onRefresh) onRefresh();
    } catch {
      setCancelError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setCancelLoading(false);
    }
  };

  // Grouper les missions par jour
  const groupedMissions = React.useMemo(() => {
    const groups: { [dayKey: string]: { label: string; date: Date; items: AgendaMissionItem[] } } = {};

    missions.forEach((m) => {
      const d = new Date(m.scheduledAt);
      if (isNaN(d.getTime())) return;

      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;

      if (!groups[dayKey]) {
        groups[dayKey] = {
          label: getDayGroupLabel(d),
          date: d,
          items: [],
        };
      }
      groups[dayKey].items.push(m);
    });

    // Trier les clés de jours
    return Object.keys(groups)
      .sort()
      .map((k) => {
        // Trier les missions du jour par heure asc
        groups[k].items.sort(
          (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
        );
        return groups[k];
      });
  }, [missions]);

  if (missions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-slate-400">
          <CalendarDays className="h-7 w-7" />
        </div>
        <p className="text-base font-semibold text-slate-200">
          Aucune mission programmée dans votre agenda
        </p>
        <p className="text-xs text-slate-400 max-w-sm">
          {userRole === "DRIVER"
            ? "Les missions à l'avance que vous acceptez ou qui vous sont assignées apparaîtront ici."
            : "Programmez vos prochaines livraisons à l'avance pour sécuriser vos livreurs."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          role="alert"
          className={`fixed left-4 right-4 top-16 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border p-4 shadow-xl transition ${
            toast.type === "success"
              ? "border-success/50 bg-slate-900 text-success"
              : "border-danger/50 bg-slate-900 text-danger"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Groupes par jour */}
      {groupedMissions.map((group) => (
        <div key={group.label} className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
              {group.label}
            </h3>
            <span className="text-xs text-slate-500">({group.items.length})</span>
          </div>

          <div className="space-y-3">
            {group.items.map((mission) => {
              const missionDate = new Date(mission.scheduledAt);
              const timeStr = formatTime(missionDate);
              const diffMs = missionDate.getTime() - Date.now();
              const twoHoursMs = 2 * 60 * 60 * 1000;
              const isLocked = diffMs < twoHoursMs;
              const isAssignedToMe =
                userRole === "DRIVER" &&
                (mission.driverId === currentUserId || mission.scheduledStatus === "assigned");
              const isVendor = userRole === "VENDOR";

              return (
                <div
                  key={mission.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-4 transition hover:border-slate-700 space-y-3"
                >
                  {/* Ligne 1 : Heure + Statut Badge + Montant */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{timeStr}</span>
                      </span>

                      {/* Statut Badge */}
                      {mission.scheduledStatus === "cancelled" || mission.status === "CANCELLED" ? (
                        <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-semibold text-danger">
                          Annulée
                        </span>
                      ) : isLocked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
                          <Lock className="h-3 w-3" />
                          <span>Verrouillée (&lt; 2h)</span>
                        </span>
                      ) : mission.scheduledStatus === "assigned" ? (
                        <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
                          Assignée
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-700/50 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                          En attente
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-base font-extrabold text-secondary">
                        {formatFCFA(Number(mission.price))}
                      </span>
                    </div>
                  </div>

                  {/* Ligne 2 : Description & Adresse */}
                  <div className="space-y-1">
                    {mission.description && (
                      <p className="text-sm font-semibold text-slate-100 line-clamp-1">
                        {mission.description}
                      </p>
                    )}
                    <div className="flex items-start gap-1.5 text-xs text-slate-400">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500 mt-0.5" />
                      <span className="line-clamp-2">{mission.address}</span>
                    </div>
                  </div>

                  {/* Ligne 3 : Info Vendeur ou Livreur */}
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/80">
                    <div>
                      {isVendor ? (
                        mission.driver?.name ? (
                          <span>Livreur : <strong className="text-slate-200">{mission.driver.name}</strong></span>
                        ) : (
                          <span className="text-amber-400">En attente d&apos;attribution</span>
                        )
                      ) : (
                        <span>
                          Vendeur :{" "}
                          <strong className="text-slate-200">
                            {mission.vendor?.shopName || mission.vendor?.name || "Boutique"}
                          </strong>
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/missions/${mission.id}`}
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      <span>Détails</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  {/* Ligne 4 : Actions contextuelles */}
                  {mission.scheduledStatus !== "cancelled" && mission.status !== "CANCELLED" && (
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      {/* Livreur assigné et > 2h */}
                      {isAssignedToMe && !isLocked && (
                        <button
                          type="button"
                          onClick={() => openCancelModal(mission)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition active:scale-95 hover:bg-danger/20"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          <span>Je ne pourrai pas</span>
                        </button>
                      )}

                      {/* Vendeur et > 2h */}
                      {isVendor && !isLocked && (
                        <>
                          <button
                            type="button"
                            onClick={() => openRescheduleModal(mission)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition active:scale-95 hover:bg-slate-700"
                          >
                            <CalendarClock className="h-3.5 w-3.5 text-primary" />
                            <span>Reporter</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openCancelModal(mission)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition active:scale-95 hover:bg-danger/20"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            <span>Annuler</span>
                          </button>
                        </>
                      )}

                      {/* Verrouillée (< 2h) info */}
                      {isLocked && (
                        <p className="text-xs text-slate-500 italic">
                          À moins de 2h de l&apos;échéance, la mission est verrouillée.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* MODALE DE REPORT (Vendeur) */}
      {rescheduleMission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold text-slate-50">
                  Reporter la livraison
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleMission(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Choisissez une nouvelle date et heure (minimum 2 heures dans le futur). Le livreur sera notifié automatiquement.
            </p>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Nouvelle date
                  </label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Nouvelle heure
                  </label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Motif du report <span className="text-slate-500">(optionnel)</span>
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Ex: Client indisponible ce matin"
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none"
                />
              </div>

              {rescheduleError && (
                <div className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{rescheduleError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleMission(null)}
                  disabled={rescheduleLoading}
                  className="h-11 flex-1 rounded-xl border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={rescheduleLoading}
                  className="h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-white transition hover:bg-primary/90 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {rescheduleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>Confirmer le report</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODALE ANNULATION / REFUS */}
      {cancelMission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {userRole === "DRIVER" ? (
                  <UserX className="h-5 w-5 text-danger" />
                ) : (
                  <Ban className="h-5 w-5 text-danger" />
                )}
                <h3 className="text-base font-bold text-slate-50">
                  {userRole === "DRIVER"
                    ? "Ne pas pouvoir assurer cette mission"
                    : "Annuler la mission programmée"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCancelMission(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {userRole === "DRIVER"
                ? "En refusant cette mission, elle sera immédiatement remise à disposition sur le marché ouvert afin qu'un autre livreur puisse la prendre en charge."
                : "L'annulation est gratuite jusqu'à 2 heures avant l'échéance. Le livreur sera notifié immédiatement."}
            </p>

            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Motif obligatoire <span className="text-danger">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={
                    userRole === "DRIVER"
                      ? "Ex: Panne mécanique imprévue, indisponibilité..."
                      : "Ex: Commande annulée par le client..."
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none"
                />
              </div>

              {cancelError && (
                <div className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{cancelError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelMission(null)}
                  disabled={cancelLoading}
                  className="h-11 flex-1 rounded-xl border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
                >
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={cancelLoading}
                  className="h-11 flex-1 rounded-xl bg-danger text-sm font-semibold text-white transition hover:bg-danger/90 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {cancelLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>
                      {userRole === "DRIVER" ? "Confirmer le désistement" : "Confirmer l'annulation"}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
