"use client";

import { useState } from "react";
import { AlertCircle, Camera, Check, Loader2, X } from "lucide-react";
import PhotoCapture from "@/components/PhotoCapture";

interface PickupPhotoModalProps {
  missionId: string;
  onClose: () => void;
  onPhotoTaken: (checkpoint: any, photoUrl: string) => void;
}

export default function PickupPhotoModal({
  missionId,
  onClose,
  onPhotoTaken,
}: PickupPhotoModalProps) {
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmPhoto = async (capturedBase64: string) => {
    setPhotoBase64(capturedBase64);
  };

  const handleSubmit = async () => {
    if (!photoBase64 || submitting) return;

    setSubmitting(true);
    setError(null);

    // Tentative de récupération GPS rapide (3s timeout)
    let lat: number | null = null;
    let lng: number | null = null;

    if (typeof window !== "undefined" && "geolocation" in navigator) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 3000,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // Fallback sans GPS
      }
    }

    try {
      const res = await fetch(`/api/missions/${missionId}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "PICKED_UP",
          photoBase64,
          lat,
          lng,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Échec de l'enregistrement de la photo.");
      }

      onPhotoTaken(data.checkpoint, data.photoUrl);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'enregistrement. Veuillez réessayer.");
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in-50 duration-200"
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl sm:rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header de la modale */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Photo au départ
              </h2>
              <p className="text-xs text-slate-400">
                Preuve obligatoire de prise en charge du colis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
            title="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corps de la modale */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary-light text-slate-300">
            📦 <strong>Prenez une photo claire du colis</strong> avant de démarrer la course. Elle sera scellée et visible sur le suivi de l&apos;acheteur.
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs font-semibold text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <PhotoCapture
            initialPhotoBase64={photoBase64}
            onConfirm={handleConfirmPhoto}
          />
        </div>

        {/* Footer avec bouton d'action */}
        {photoBase64 && (
          <div className="border-t border-slate-800 bg-slate-950/80 p-4">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Validation de la prise en charge...</span>
                </>
              ) : (
                <>
                  <Check className="h-5 w-5" />
                  <span>Confirmer la prise en charge du colis</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

