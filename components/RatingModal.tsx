"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Star, X } from "lucide-react";

interface RatingModalProps {
  missionId: string;
  /** Nom de la personne notée (livreur ou boutique) */
  targetName: string;
  onClose: () => void;
  onRated: () => void;
}

const STAR_LABELS: Record<number, string> = {
  1: "Très mauvais",
  2: "Mauvais",
  3: "Correct",
  4: "Bien",
  5: "Excellent",
};

const MAX_COMMENT_LENGTH = 500;

export default function RatingModal({
  missionId,
  targetName,
  onClose,
  onRated,
}: RatingModalProps) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (score < 1 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score,
          comment: comment.trim() ? comment.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'enregistrer la note.");
      }
      onRated();
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'envoi. Veuillez réessayer."
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Noter ${targetName}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-slate-800 bg-slate-900 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/20 text-secondary">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Noter {targetName}
              </h2>
              <p className="text-xs text-slate-400">
                Votre avis est définitif et ne pourra pas être supprimé
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            title="Fermer"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs font-semibold text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 5 étoiles tactiles */}
          <div className="space-y-2 text-center">
            <div
              role="radiogroup"
              aria-label="Note de 1 à 5 étoiles"
              className="flex items-center justify-center gap-1.5"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={score === value}
                  aria-label={`${value} étoile${value > 1 ? "s" : ""}`}
                  onClick={() => setScore(value)}
                  className="flex h-14 w-14 items-center justify-center rounded-xl transition active:scale-90"
                >
                  <Star
                    className={`h-10 w-10 transition ${
                      value <= score
                        ? "fill-secondary text-secondary"
                        : "text-slate-600"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="h-5 text-sm font-semibold text-secondary">
              {score > 0 ? STAR_LABELS[score] : "Touchez une étoile pour noter"}
            </p>
          </div>

          {/* Commentaire optionnel */}
          <div className="space-y-2">
            <label
              htmlFor="rating-comment"
              className="block text-sm font-medium text-slate-300"
            >
              Commentaire <span className="text-slate-500">(facultatif)</span>
            </label>
            <textarea
              id="rating-comment"
              value={comment}
              onChange={(e) =>
                setComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))
              }
              rows={3}
              placeholder="Ponctualité, soin du colis, communication..."
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-primary focus:outline-none"
            />
            <p className="text-right text-[11px] text-slate-500">
              {comment.length}/{MAX_COMMENT_LENGTH}
            </p>
          </div>
        </div>

        <div className="border-t border-slate-800 bg-slate-950/80 p-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={score < 1 || submitting}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Envoi...</span>
              </>
            ) : (
              <span>Envoyer</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

