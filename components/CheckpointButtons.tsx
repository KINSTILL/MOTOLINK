"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, WifiOff } from "lucide-react";
import {
  enqueueOfflineCheckpoint,
  flushOfflineCheckpoints,
} from "@/lib/offline-queue";
import { CheckpointTimelineItem } from "@/components/CheckpointTimeline";
import PickupPhotoModal from "@/components/PickupPhotoModal";
import ArrivalContactModal from "@/components/ArrivalContactModal";
import DriverCallModal, { CallPhase } from "@/components/DriverCallModal";

export type StepCheckpointType =
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "NEARBY"
  | "DELIVERED";

interface CheckpointStepConfig {
  type: StepCheckpointType;
  emoji: string;
  label: string;
  activeBgClass: string;
  activeHex: string;
}

const CHECKPOINT_STEPS: CheckpointStepConfig[] = [
  {
    type: "PICKED_UP",
    emoji: "📦",
    label: "J'ai récupéré",
    activeBgClass: "bg-[#2563eb] text-white shadow-lg shadow-[#2563eb]/35",
    activeHex: "#2563eb",
  },
  {
    type: "IN_TRANSIT",
    emoji: "🛵",
    label: "Je suis en route",
    activeBgClass: "bg-[#f97316] text-white shadow-lg shadow-[#f97316]/35",
    activeHex: "#f97316",
  },
  {
    type: "NEARBY",
    emoji: "📍",
    label: "Je suis arrivé",
    activeBgClass: "bg-[#eab308] text-slate-950 shadow-lg shadow-[#eab308]/35",
    activeHex: "#eab308",
  },
  {
    type: "DELIVERED",
    emoji: "✅",
    label: "J'ai livré",
    activeBgClass: "bg-[#16a34a] text-white shadow-lg shadow-[#16a34a]/35",
    activeHex: "#16a34a",
  },
];

export interface CheckpointButtonsProps {
  missionId: string;
  currentStatus: string;
  initialCheckpoints?: CheckpointTimelineItem[];
  /** Coordonnées de l'acheteur pour les modales d'appel du livreur (optionnel) */
  buyerContact?: { phone: string; name?: string | null } | null;
  onCheckpointAdded?: (
    checkpoint: CheckpointTimelineItem,
    nextMissionStatus: string
  ) => void;
}

/**
 * Tente de récupérer la position GPS en moins de 3,5 secondes.
 * Si indisponible ou refusée, résout `{ lat: null, lng: null }` sans jamais bloquer.
 */
function getOptionalGpsPosition(): Promise<{
  lat: number | null;
  lng: number | null;
}> {
  return new Promise((resolve) => {
    if (
      typeof window === "undefined" ||
      !("geolocation" in navigator)
    ) {
      resolve({ lat: null, lng: null });
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ lat: null, lng: null });
      }
    }, 3500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ lat: null, lng: null });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 3000,
        maximumAge: 15000,
      }
    );
  });
}

export default function CheckpointButtons({
  missionId,
  currentStatus: initialStatus,
  initialCheckpoints = [],
  buyerContact = null,
  onCheckpointAdded,
}: CheckpointButtonsProps) {
  const router = useRouter();

  const [status, setStatus] = useState(initialStatus);
  const [completedTypes, setCompletedTypes] = useState<string[]>(() =>
    initialStatus === "ACCEPTED"
      ? []
      : initialCheckpoints.map((cp) => cp.type)
  );
  const [submittingStep, setSubmittingStep] =
    useState<StepCheckpointType | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);

  // Modales d'interaction livreur : Photo au départ & Contact à l'arrivée
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [arrivalModalData, setArrivalModalData] = useState<{
    buyerContact: { phone: string; name?: string | null };
    messageTemplate: string;
    buyerPresenceConfirmed: boolean;
  } | null>(null);

  // Modale d'appel livreur (2 moments critiques : avant départ & à l'arrivée).
  // Aucun blocage : le livreur peut choisir « Continuer sans appeler ».
  const [callModalPhase, setCallModalPhase] = useState<CallPhase | null>(null);
  // NEARBY différé : si présent, on exécute le jalon après l'appel d'arrivée
  const [pendingNearby, setPendingNearby] = useState(false);

  // Synchronise automatiquement la file IndexedDB au retour du réseau
  useEffect(() => {
    const handleOnline = () => {
      flushOfflineCheckpoints(() => {
        setQueuedNotice(null);
        router.refresh();
      });
    };

    window.addEventListener("online", handleOnline);
    flushOfflineCheckpoints();
    return () => window.removeEventListener("online", handleOnline);
  }, [router]);

  // Détermine l'index de l'unique bouton actif (0 à 3)
  const activeStepIndex = useMemo(() => {
    if (status === "DELIVERED" || completedTypes.includes("DELIVERED")) {
      return 4; // Tous complétés
    }
    if (status === "ACCEPTED" && !completedTypes.includes("PICKED_UP")) {
      return 0; // "📦 J'ai récupéré" actif
    }
    if (!completedTypes.includes("PICKED_UP")) {
      return 0;
    }
    if (!completedTypes.includes("IN_TRANSIT")) {
      return 1; // "🛵 Je suis en route" actif
    }
    if (!completedTypes.includes("NEARBY")) {
      return 2; // "📍 Je suis arrivé" actif
    }
    return 3; // "✅ J'ai livré" actif
  }, [status, completedTypes]);

  const handleTap = async (step: CheckpointStepConfig, index: number) => {
    if (index !== activeStepIndex || submittingStep !== null) {
      return;
    }

    // Vibration haptique au tap
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(50);
      } catch {
        // Ignoré sur les appareils non compatibles
      }
    }

    // ÉTAPE 5 : PICKED_UP requiert obligatoirement une photo de prise en charge
    if (step.type === "PICKED_UP") {
      setShowPickupModal(true);
      return;
    }

    // NEARBY : proposer d'abord d'appeler l'acheteur (sans blocage),
    // puis exécuter le jalon lorsque la modale est fermée.
    if (step.type === "NEARBY" && buyerContact) {
      setPendingNearby(true);
      setCallModalPhase("at_arrival");
      return;
    }

    await submitCheckpoint(step, index);
  };

  const submitCheckpoint = async (
    step: CheckpointStepConfig,
    _index: number
  ) => {
    setSubmittingStep(step.type);
    setToastError(null);
    setQueuedNotice(null);

    const coords = await getOptionalGpsPosition();
    const nextStatus =
      step.type === "DELIVERED" ? "DELIVERED" : "IN_PROGRESS";

    // Si hors-ligne, mise en file d'attente IndexedDB
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const queued = await enqueueOfflineCheckpoint({
        missionId,
        type: step.type,
        lat: coords.lat,
        lng: coords.lng,
        note:
          coords.lat === null
            ? "Jalon enregistré hors-ligne (sans GPS)"
            : "Jalon enregistré hors-ligne",
      });

      const optimisticCheckpoint: CheckpointTimelineItem = {
        id: queued.id,
        type: step.type,
        lat: coords.lat,
        lng: coords.lng,
        note: queued.note,
        createdAt: queued.queuedAt,
      };

      setCompletedTypes((prev) => [...prev, step.type]);
      setStatus(nextStatus);
      setSubmittingStep(null);
      setQueuedNotice(
        "Hors ligne : jalon sauvegardé dans IndexedDB et synchronisé dès le retour du réseau."
      );
      onCheckpointAdded?.(optimisticCheckpoint, nextStatus);

      if (step.type === "DELIVERED") {
        router.push(`/missions/${missionId}/proof`);
      }
      return;
    }

    try {
      const res = await fetch(`/api/missions/${missionId}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: step.type,
          lat: coords.lat,
          lng: coords.lng,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setToastError(
          data.error || "Erreur serveur lors de l'enregistrement du jalon."
        );
        setSubmittingStep(null);
        return;
      }

      const createdCp: CheckpointTimelineItem = data.checkpoint;
      const updatedStatus: string = data.missionStatus || nextStatus;

      setCompletedTypes((prev) => [...prev, step.type]);
      setStatus(updatedStatus);
      setSubmittingStep(null);
      onCheckpointAdded?.(createdCp, updatedStatus);

      // ÉTAPE 6 : NEARBY ouvre la modale des coordonnées de l'acheteur
      if (step.type === "NEARBY" && data.buyerContact) {
        setArrivalModalData({
          buyerContact: data.buyerContact,
          messageTemplate: data.messageTemplate,
          buyerPresenceConfirmed: Boolean(data.buyerPresenceConfirmed),
        });
      }

      if (step.type === "DELIVERED") {
        router.push(`/missions/${missionId}/proof`);
        return;
      }

      router.refresh();
    } catch {
      // Échec réseau pendant la requête → fallback file d'attente IndexedDB
      const queued = await enqueueOfflineCheckpoint({
        missionId,
        type: step.type,
        lat: coords.lat,
        lng: coords.lng,
        note: "Sauvegardé hors-ligne (réseau interrompu)",
      });

      const optimisticCheckpoint: CheckpointTimelineItem = {
        id: queued.id,
        type: step.type,
        lat: coords.lat,
        lng: coords.lng,
        note: queued.note,
        createdAt: queued.queuedAt,
      };

      setCompletedTypes((prev) => [...prev, step.type]);
      setStatus(nextStatus);
      setSubmittingStep(null);
      setQueuedNotice(
        "Réseau indisponible : jalon mis en file d'attente IndexedDB."
      );
      onCheckpointAdded?.(optimisticCheckpoint, nextStatus);

      if (step.type === "DELIVERED") {
        router.push(`/missions/${missionId}/proof`);
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Toast d'erreur serveur */}
      {toastError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl border border-danger/50 bg-slate-900 p-4 text-sm font-semibold text-danger shadow-lg"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{toastError}</span>
        </div>
      )}

      {/* Notification file d'attente IndexedDB */}
      {queuedNotice && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs font-medium text-warning">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>{queuedNotice}</span>
        </div>
      )}

      {/* 4 boutons verticaux plein écran h-20 w-full rounded-2xl text-xl font-bold */}
      <div className="space-y-3">
        {CHECKPOINT_STEPS.map((step, index) => {
          const isCompleted = index < activeStepIndex;
          const isActive = index === activeStepIndex;
          const isSubmitting = submittingStep === step.type;

          return (
            <button
              key={step.type}
              type="button"
              disabled={!isActive || submittingStep !== null}
              onClick={() => handleTap(step, index)}
              style={
                isActive ? { backgroundColor: step.activeHex } : undefined
              }
              className={`flex h-20 w-full items-center justify-between rounded-2xl px-6 text-xl font-bold transition active:scale-[0.98] ${
                isActive
                  ? `${step.activeBgClass} animate-pulse cursor-pointer`
                  : isCompleted
                  ? "border border-success/40 bg-slate-900/90 text-success cursor-default"
                  : "border border-slate-800 bg-slate-800/70 text-slate-500 cursor-not-allowed opacity-60"
              }`}
            >
              {/* Icône text-3xl à gauche */}
              <span className="text-3xl leading-none" aria-hidden="true">
                {step.emoji}
              </span>

              {/* Texte à droite */}
              <span className="flex items-center gap-2">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Validation...</span>
                  </>
                ) : (
                  <>
                    <span>{step.label}</span>
                    {isCompleted && <Check className="h-6 w-6 text-success" />}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Modale de photo de prise en charge obligatoire */}
      {showPickupModal && (
        <PickupPhotoModal
          missionId={missionId}
          onClose={() => setShowPickupModal(false)}
          onPhotoTaken={(cp, _photoUrl) => {
            setCompletedTypes((prev) => [...prev, "PICKED_UP"]);
            setStatus("IN_PROGRESS");
            onCheckpointAdded?.(cp, "IN_PROGRESS");
            router.refresh();
            // Après la photo de départ : proposer d'appeler l'acheteur (sans blocage)
            if (buyerContact) {
              setCallModalPhase("before_departure");
            }
          }}
        />
      )}

      {/* Modale d'appel du livreur (avant départ / à l'arrivée) */}
      {callModalPhase && buyerContact && (
        <DriverCallModal
          missionId={missionId}
          phase={callModalPhase}
          buyerContact={buyerContact}
          onClose={() => {
            const phase = callModalPhase;
            setCallModalPhase(null);
            // Fermeture (appel effectué / « Continuer sans appeler ») :
            // déclenche le jalon NEARBY différé, sans jamais bloquer le livreur.
            if (phase === "at_arrival" && pendingNearby) {
              setPendingNearby(false);
              const nearbyStep = CHECKPOINT_STEPS.find(
                (s) => s.type === "NEARBY"
              );
              if (nearbyStep) {
                void submitCheckpoint(
                  nearbyStep,
                  CHECKPOINT_STEPS.indexOf(nearbyStep)
                );
              }
            }
          }}
        />
      )}

      {/* Modale de contact à l'arrivée (NEARBY) */}
      {arrivalModalData && (
        <ArrivalContactModal
          missionId={missionId}
          buyerContact={arrivalModalData.buyerContact}
          messageTemplate={arrivalModalData.messageTemplate}
          buyerPresenceConfirmed={arrivalModalData.buyerPresenceConfirmed}
          onClose={() => setArrivalModalData(null)}
        />
      )}
    </div>
  );
}

