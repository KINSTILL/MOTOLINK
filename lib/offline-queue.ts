/**
 * MotoLink PWA - File d'attente IndexedDB pour le mode hors ligne
 * Gère la persistance locale des actions en mode avion / 3G instable
 * et la synchronisation automatique dès le retour du réseau.
 */

export type OfflineActionType =
  | "SEND_MESSAGE"
  | "POST_CHECKPOINT"
  | "UPLOAD_PROOF"
  | "ACCEPT_MISSION";

export interface PendingAction<T = any> {
  id: string;
  type: OfflineActionType;
  payload: T;
  missionId: string;
  createdAt: string;
  retries: number;
  lastError?: string | null;
}

const DB_NAME = "motolink_offline_db";
const DB_VERSION = 2;
const STORE_NAME = "pendingActions";
const LEGACY_STORE_NAME = "pending_checkpoints";

// Mémoire de secours si IndexedDB n'est pas disponible (ex: environnement Node/Tests SSR)
const memoryStore = new Map<string, PendingAction>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB non disponible dans cet environnement"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("missionId", "missionId", { unique: false });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        db.createObjectStore(LEGACY_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Impossible d'ouvrir IndexedDB"));
  });
}

function notifyQueueChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("motolink:offline-queue-changed"));
  }
}

/**
 * Ajoute une action dans la file d'attente locale IndexedDB.
 */
export async function enqueueAction<T = any>(
  type: OfflineActionType,
  payload: T,
  missionId?: string
): Promise<PendingAction<T>> {
  const extractedMissionId =
    missionId ||
    (payload as any)?.missionId ||
    (payload as any)?.id ||
    "global";

  const action: PendingAction<T> = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    payload,
    missionId: extractedMissionId,
    createdAt: new Date().toISOString(),
    retries: 0,
  };

  if (!isBrowser()) {
    memoryStore.set(action.id, action);
    notifyQueueChange();
    return action;
  }

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(action);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("[OfflineQueue] Fallback mémoire suite à erreur IndexedDB:", err);
    memoryStore.set(action.id, action);
  }

  notifyQueueChange();
  return action;
}

/**
 * Récupère toutes les actions en attente dans la file.
 */
export async function getPendingActions(): Promise<PendingAction[]> {
  if (!isBrowser()) {
    return Array.from(memoryStore.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
  }

  try {
    const db = await openDb();
    const items = await new Promise<PendingAction[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return Array.from(memoryStore.values());
  }
}

/**
 * Supprime une action de la file après synchronisation réussie ou abandon.
 */
export async function removePendingAction(id: string): Promise<void> {
  memoryStore.delete(id);

  if (isBrowser()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (err) {
      console.warn("[OfflineQueue] Erreur suppression IndexedDB:", err);
    }
  }

  notifyQueueChange();
}

/**
 * Met à jour le nombre de retries d'une action en échec.
 */
export async function updateActionRetry(
  id: string,
  retries: number,
  errorMessage: string
): Promise<void> {
  const existingMemory = memoryStore.get(id);
  if (existingMemory) {
    existingMemory.retries = retries;
    existingMemory.lastError = errorMessage;
  }

  if (isBrowser()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const action = getReq.result as PendingAction | undefined;
          if (action) {
            action.retries = retries;
            action.lastError = errorMessage;
            store.put(action);
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
      db.close();
    } catch (err) {
      console.warn("[OfflineQueue] Erreur mise à jour retry IndexedDB:", err);
    }
  }

  notifyQueueChange();
}

/**
 * Renvoie le nombre total d'actions en attente.
 */
export async function getQueueSize(): Promise<number> {
  const actions = await getPendingActions();
  return actions.length;
}

/**
 * Vide complètement la file (utilisé pour réinitialisation ou tests).
 */
export async function clearQueue(): Promise<void> {
  memoryStore.clear();

  if (isBrowser()) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Ignorer
    }
  }

  notifyQueueChange();
}

/**
 * Déclenche une notification système ou personnalisée
 */
function notifyUser(title: string, body: string) {
  if (typeof window !== "undefined") {
    // Événement CustomEvent pour le Toast de l'app
    window.dispatchEvent(
      new CustomEvent("motolink:notification", {
        detail: { title, body },
      })
    );

    // Notification native Push / Browser si permission accordée
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, { body, icon: "/icons/icon-192x192.png" });
      } catch {
        // Fallback silencieux sur mobile où new Notification peut échouer hors SW
      }
    }
  }
}

/**
 * Exécute une action individuelle vers le serveur.
 */
async function executeAction(action: PendingAction): Promise<boolean> {
  const { type, payload, missionId } = action;

  switch (type) {
    case "SEND_MESSAGE": {
      const res = await fetch(`/api/missions/${missionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: payload.content }),
      });
      // 200, 201 ou 400 (si déjà traité ou requête invalide, on ne bloque pas la file)
      return res.ok || res.status === 400;
    }

    case "POST_CHECKPOINT": {
      const res = await fetch(`/api/missions/${missionId}/checkpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: payload.type,
          lat: payload.lat ?? null,
          lng: payload.lng ?? null,
          note: payload.note ?? null,
        }),
      });
      // 200/201 succès ou 409 (checkpoint déjà scellé / passé)
      return res.ok || res.status === 409;
    }

    case "ACCEPT_MISSION": {
      const res = await fetch(`/api/missions/${missionId}/accept`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      return res.ok || res.status === 409;
    }

    case "UPLOAD_PROOF": {
      const res = await fetch(`/api/missions/${missionId}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoBase64: payload.photoBase64,
          signatureBase64: payload.signatureBase64,
          lat: payload.lat ?? null,
          lng: payload.lng ?? null,
          gpsAccuracy: payload.gpsAccuracy ?? null,
          deviceFingerprint: payload.deviceFingerprint ?? null,
        }),
      });
      return res.ok || res.status === 409;
    }

    default:
      return true;
  }
}

let isProcessing = false;

/**
 * Parcourt la file d'attente et synchronise chaque action en attente.
 * Supprime l'action en cas de succès, incrémente retries en cas d'échec.
 * Après 5 retries, alerte l'utilisateur et retire l'action de blocage.
 */
export async function processQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  if (isProcessing) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  isProcessing = true;
  let succeeded = 0;
  let failed = 0;

  try {
    const queue = await getPendingActions();

    for (const action of queue) {
      if (action.retries >= 5) {
        // Abandon après 5 tentatives infructueuses
        await removePendingAction(action.id);
        notifyUser(
          "Action échouée",
          "Une action n'a pas pu être synchronisée après 5 tentatives. Vérifiez votre connexion."
        );
        failed++;
        continue;
      }

      try {
        const success = await executeAction(action);
        if (success) {
          await removePendingAction(action.id);
          succeeded++;
        } else {
          const nextRetries = action.retries + 1;
          await updateActionRetry(
            action.id,
            nextRetries,
            `Échec HTTP serveur lors de l'exécution (${nextRetries}/5)`
          );
          failed++;
        }
      } catch (err: any) {
        const nextRetries = action.retries + 1;
        await updateActionRetry(
          action.id,
          nextRetries,
          err?.message || "Erreur réseau"
        );
        failed++;
        // Si coupure totale du réseau, interruption du lot
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          break;
        }
      }
    }

    if (succeeded > 0) {
      notifyUser(
        "MotoLink Synchronisation",
        `${succeeded} action${succeeded > 1 ? "s" : ""} synchronisée${
          succeeded > 1 ? "s" : ""
        } avec succès.`
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("motolink:sync-completed", {
            detail: { count: succeeded },
          })
        );
      }
    }
  } finally {
    isProcessing = false;
  }

  return {
    processed: succeeded + failed,
    succeeded,
    failed,
  };
}

// ==========================================
// RÉTROCOMPATIBILITÉ (pour CheckpointButtons)
// ==========================================

export interface QueuedCheckpointAction {
  id: string;
  missionId: string;
  type: "PICKED_UP" | "IN_TRANSIT" | "NEARBY" | "DELIVERED" | "CUSTOM";
  lat: number | null;
  lng: number | null;
  note?: string | null;
  queuedAt: string;
}

export async function enqueueOfflineCheckpoint(
  item: Omit<QueuedCheckpointAction, "id" | "queuedAt">
): Promise<QueuedCheckpointAction> {
  const action = await enqueueAction("POST_CHECKPOINT", {
    type: item.type,
    lat: item.lat,
    lng: item.lng,
    note: item.note,
  }, item.missionId);

  return {
    id: action.id,
    missionId: item.missionId,
    type: item.type,
    lat: item.lat,
    lng: item.lng,
    note: item.note,
    queuedAt: action.createdAt,
  };
}

export async function getQueuedCheckpoints(
  missionId?: string
): Promise<QueuedCheckpointAction[]> {
  const actions = await getPendingActions();
  const cpActions = actions.filter((a) => a.type === "POST_CHECKPOINT");
  const mapped = cpActions.map((a) => ({
    id: a.id,
    missionId: a.missionId,
    type: a.payload.type,
    lat: a.payload.lat,
    lng: a.payload.lng,
    note: a.payload.note,
    queuedAt: a.createdAt,
  }));

  return missionId
    ? mapped.filter((item) => item.missionId === missionId)
    : mapped;
}

export async function removeQueuedCheckpoint(id: string): Promise<void> {
  await removePendingAction(id);
}

export async function flushOfflineCheckpoints(
  onSynced?: (item: QueuedCheckpointAction) => void
): Promise<number> {
  const result = await processQueue();
  return result.succeeded;
}
