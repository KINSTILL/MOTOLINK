"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, Store, X } from "lucide-react";

interface IncomingRequest {
  id: string;
  status: string;
  createdAt: string;
  vendor: { id: string; name: string };
}

/**
 * Demandes de contact reçues via l'annuaire (livreur).
 * N'affiche rien s'il n'y a aucune demande en attente.
 */
export default function DirectoryContactRequests() {
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/directory/contact-request");
      if (!res.ok) return;
      const data = await res.json();
      setRequests(
        (data.requests as IncomingRequest[]).filter((r) => r.status === "pending")
      );
    } catch {
      // Silencieux : la section reste simplement masquée
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (id: string, response: "accepted" | "refused") => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/directory/contact-request/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'enregistrer votre réponse.");
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setBusyId(null);
    }
  };

  if (requests.length === 0 && !error) return null;

  return (
    <section
      aria-label="Demandes de contact"
      className="space-y-3 rounded-2xl border border-primary/40 bg-primary/10 p-4"
    >
      <h2 className="text-base font-bold text-slate-50">
        Demandes de contact ({requests.length})
      </h2>
      <p className="text-xs text-slate-300">
        En acceptant, votre numéro sera révélé au vendeur et il rejoindra vos contacts. Vous
        restez libre de refuser, sans justification.
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs font-semibold text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ul className="space-y-2">
        {requests.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border border-slate-800 bg-slate-900 p-3"
          >
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 shrink-0 text-secondary" />
              <p className="text-sm font-semibold text-slate-50">
                {r.vendor.name} souhaite vous confier une mission.
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => respond(r.id, "refused")}
                className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 text-sm font-semibold text-slate-300 transition active:scale-95 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Refuser
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => respond(r.id, "accepted")}
                className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-bold text-white transition active:scale-95 disabled:opacity-50"
              >
                {busyId === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Accepter
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

