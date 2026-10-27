"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { CheckCircle2, Loader2, RefreshCw, WifiOff } from "lucide-react";

interface SyncButtonProps {
  className?: string;
  showWhenEmpty?: boolean;
}

export default function SyncButton({
  className = "",
  showWhenEmpty = false,
}: SyncButtonProps) {
  const { isOnline, queueSize, isSyncing, syncNow } = useOnlineStatus();

  if (!showWhenEmpty && queueSize === 0 && !isSyncing) {
    return null;
  }

  if (!isOnline) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-300 ${className}`}
      >
        <WifiOff className="h-3.5 w-3.5" />
        <span>Hors ligne ({queueSize})</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => syncNow()}
      disabled={isSyncing || queueSize === 0}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      title="Synchroniser la file d'attente hors ligne"
    >
      {isSyncing ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Synchronisation...</span>
        </>
      ) : queueSize > 0 ? (
        <>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Synchroniser ({queueSize})</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span>À jour</span>
        </>
      )}
    </button>
  );
}

