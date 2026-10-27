"use client";

import { useState } from "react";
import { AlertCircle, BookUser, Loader2 } from "lucide-react";

interface DirectoryVisibilityToggleProps {
  initialVisible: boolean;
}

/**
 * Toggle ON/OFF de visibilité dans l'annuaire des livreurs.
 * Consentement explicite : désactivé par défaut, réversible à tout moment.
 */
export default function DirectoryVisibilityToggle({
  initialVisible,
}: DirectoryVisibilityToggleProps) {
  const [visible, setVisible] = useState(initialVisible);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    if (saving) return;
    const next = !visible;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/drivers/directory-visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Impossible de modifier la visibilité.");
      }
      setVisible(Boolean(data.visible));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Erreur inattendue. Réessayez."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <BookUser className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-base font-semibold text-slate-50">
              Apparaître dans l&apos;annuaire
            </p>
            <p
              className={`text-xs font-semibold ${
                visible ? "text-emerald-400" : "text-slate-500"
              }`}
            >
              {visible ? "Activé : vous êtes visible" : "Désactivé : vous êtes invisible"}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={visible}
          aria-label="Apparaître dans l'annuaire des livreurs"
          onClick={handleToggle}
          disabled={saving}
          className={`relative flex h-8 w-14 shrink-0 items-center rounded-full border transition disabled:opacity-60 ${
            visible
              ? "border-emerald-500 bg-emerald-500/30"
              : "border-slate-600 bg-slate-800"
          }`}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full bg-white shadow transition-transform ${
              visible ? "translate-x-7" : "translate-x-1"
            }`}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600" />}
          </span>
        </button>
      </div>

      <p className="text-xs leading-relaxed text-slate-400">
        En activant cette option, vous acceptez d&apos;apparaître dans un annuaire visible par
        les vendeurs abonnés (nom, photo, note, badges et zones de travail).{" "}
        <strong className="text-slate-300">
          Votre numéro n&apos;est jamais affiché.
        </strong>{" "}
        Un vendeur doit vous envoyer une demande de contact : vous pouvez l&apos;accepter ou la
        refuser. Votre numéro n&apos;est révélé qu&apos;en cas d&apos;acceptation. Vous pouvez vous
        retirer de l&apos;annuaire à tout moment.
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs font-semibold text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

