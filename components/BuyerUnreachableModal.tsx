"use client";

import { useState } from "react";
import { AlertCircle, Camera, Check, Loader2, X } from "lucide-react";
import PhotoCapture from "@/components/PhotoCapture";

interface BuyerUnreachableModalProps {
  missionId: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

/**
 * Modale « client absent » : le livreur prend une photo prouvant qu'il est bien
 * sur place mais que l'acheteur ne répond pas, et ajoute éventuellement une note.
 * Cette action n'empêche pas le livreur de poursuivre la procédure.
 */
export default function BuyerUnreachableModal({
  missionId,
  onClose,
  onSubmitted,
}: BuyerUnreachableModalProps) {
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmPhoto = (capturedBase64: string) => {
    setPhotoBase64(capturedBase64);
  };

  const handleSubmit = async () => {
    if (!photoBase64 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/missions/${missionId}/buyer-unreachable`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoBase64,
            note: note.trim() || null,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Échec de l'enregistrement.");
      }

      onSubmitted?.();
      onClose();
    } catch (err: any) {
      setError(
        err?.message || "Erreur lors de l'enregistrement. Veuillez réessayer."
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in-50 duration-200"
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl sm:rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/20 text-danger">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Client absent
              </h2>
              <p className="text-xs text-slate-400">
                Preuve que vous êtes bien sur place
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

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 text-xs text-slate-300">
            📸 <strong>Prenez une photo</strong> montrant que vous êtes arrivé
            à l&apos;adresse. L&apos;acheteur sera notifié qu&apos;il n&apos;a
            pas pu être joint.
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

          <div className="space-y-1.5">
            <label
              htmlFor="unreachable-note"
              className="text-xs font-semibold uppercase tracking-wider text-slate-400"
            >
              Note (optionnel)
            </label>
            <textarea
              id="unreachable-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={250}
              rows={2}
              placeholder="Ex : personne à l'adresse, téléphone sonne dans le vide…"
              className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        {photoBase64 && (
          <div className="border-t border-slate-800 bg-slate-950/80 p-4">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-danger text-base font-bold text-white shadow-lg shadow-danger/30 transition hover:bg-danger/90 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Check className="h-5 w-5" />
                  <span>Confirmer le client absent</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
