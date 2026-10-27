"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const { isOnline, queueSize, isSyncing, syncNow } = useOnlineStatus();

  // Si tout est en ligne et aucune action en attente, le bandeau n'a pas besoin de s'afficher
  if (isOnline && queueSize === 0 && !isSyncing) {
    return null;
  }

  // Cas 1 : Utilisateur hors ligne (bandeau rouge alertant)
  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b border-red-500/30 bg-danger px-4 py-2.5 text-xs font-semibold text-white shadow-lg animate-in slide-in-from-top-2 duration-200"
      >
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4 shrink-0 animate-pulse text-white" />
          <span>
            Vous êtes hors ligne. Les actions seront synchronisées au retour du
            réseau.
          </span>
        </div>
        {queueSize > 0 && (
          <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold text-white">
            {queueSize} en attente
          </span>
        )}
      </div>
    );
  }

  // Cas 2 : Réseau rétabli avec des actions en file d'attente à synchroniser
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-primary/30 bg-primary/95 px-4 py-2 text-xs font-medium text-white shadow-md backdrop-blur-sm animate-in slide-in-from-top-2 duration-200"
    >
      <div className="flex items-center gap-2">
        <Wifi className="h-4 w-4 shrink-0 text-emerald-300" />
        <span>
          Connexion rétablie —{" "}
          <strong className="font-bold text-white">
            {queueSize} action{queueSize > 1 ? "s" : ""}
          </strong>{" "}
          à synchroniser.
        </span>
      </div>

      <button
        onClick={() => syncNow()}
        disabled={isSyncing}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-primary shadow-sm transition hover:bg-slate-100 disabled:opacity-60"
      >
        {isSyncing ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Synchronisation...</span>
          </>
        ) : (
          <>
            <RefreshCw className="h-3 w-3" />
            <span>Synchroniser maintenant</span>
          </>
        )}
      </button>
    </div>
  );
}
