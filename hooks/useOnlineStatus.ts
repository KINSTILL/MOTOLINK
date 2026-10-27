"use client";

import { useCallback, useEffect, useState } from "react";
import { getQueueSize, processQueue } from "@/lib/offline-queue";

export interface UseOnlineStatusReturn {
  isOnline: boolean;
  queueSize: number;
  isSyncing: boolean;
  lastSyncCount: number | null;
  syncNow: () => Promise<number>;
}

export function useOnlineStatus(): UseOnlineStatusReturn {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [queueSize, setQueueSize] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncCount, setLastSyncCount] = useState<number | null>(null);

  const refreshQueueSize = useCallback(async () => {
    try {
      const size = await getQueueSize();
      setQueueSize(size);
    } catch {
      // Ignorer
    }
  }, []);

  const syncNow = useCallback(async (): Promise<number> => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return 0;
    }
    setIsSyncing(true);
    try {
      const res = await processQueue();
      setLastSyncCount(res.succeeded);
      await refreshQueueSize();
      return res.succeeded;
    } finally {
      setIsSyncing(false);
    }
  }, [refreshQueueSize]);

  useEffect(() => {
    // État initial
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }
    refreshQueueSize();

    const handleOnline = () => {
      setIsOnline(true);
      // Synchronisation automatique dès que le réseau revient
      syncNow();
    };

    const handleOffline = () => {
      setIsOnline(false);
      refreshQueueSize();
    };

    const handleQueueChange = () => {
      refreshQueueSize();
    };

    const handleSyncCompleted = (e: any) => {
      if (e?.detail?.count) {
        setLastSyncCount(e.detail.count);
      }
      refreshQueueSize();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("motolink:offline-queue-changed", handleQueueChange);
    window.addEventListener("motolink:sync-completed", handleSyncCompleted);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("motolink:offline-queue-changed", handleQueueChange);
      window.removeEventListener("motolink:sync-completed", handleSyncCompleted);
    };
  }, [refreshQueueSize, syncNow]);

  return {
    isOnline,
    queueSize,
    isSyncing,
    lastSyncCount,
    syncNow,
  };
}

