/**
 * MotoLink - Actions critiques hors ligne & optimistes
 * Permet aux formulaires et boutons de fonctionner même sans connexion (mode avion / zone blanche).
 */

import { enqueueAction, PendingAction } from "@/lib/offline-queue";
import { compressImageBase64 } from "@/lib/image-compression";

function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * 1. POST /api/missions/[id]/messages
 * Envoi d'un message avec mise en file d'attente hors ligne et message optimiste immédiat.
 */
export async function sendMissionMessage(params: {
  missionId: string;
  content: string;
  senderName?: string;
}) {
  const { missionId, content, senderName } = params;

  if (!isOnline()) {
    const action = await enqueueAction("SEND_MESSAGE", { content }, missionId);
    return {
      success: true,
      offline: true,
      actionId: action.id,
      message: {
        id: `local_msg_${Date.now()}`,
        missionId,
        content,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
        sender: {
          name: senderName || "Vous",
        },
      },
    };
  }

  try {
    const res = await fetch(`/api/missions/${missionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erreur lors de l'envoi du message.");
    }

    const data = await res.json();
    return {
      success: true,
      offline: false,
      message: data.message,
    };
  } catch (err: any) {
    // Si coupure de réseau inopinée pendant le fetch, mise en file d'attente
    const action = await enqueueAction("SEND_MESSAGE", { content }, missionId);
    return {
      success: true,
      offline: true,
      actionId: action.id,
      message: {
        id: `local_msg_${Date.now()}`,
        missionId,
        content,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
        sender: {
          name: senderName || "Vous",
        },
      },
    };
  }
}

/**
 * 2. POST /api/missions/[id]/checkpoint
 * Enregistrement de jalon avec mise en file d'attente hors ligne et jalon optimiste immédiat.
 */
export async function postMissionCheckpoint(params: {
  missionId: string;
  type: "PICKED_UP" | "IN_TRANSIT" | "NEARBY" | "DELIVERED" | "CUSTOM";
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
}) {
  const { missionId, type, lat = null, lng = null, note = null } = params;

  // Calcul du statut de mission déduit
  let nextStatus = "IN_PROGRESS";
  if (type === "DELIVERED") nextStatus = "DELIVERED";

  if (!isOnline()) {
    const action = await enqueueAction(
      "POST_CHECKPOINT",
      { type, lat, lng, note },
      missionId
    );
    return {
      success: true,
      offline: true,
      actionId: action.id,
      missionStatus: nextStatus,
      checkpoint: {
        id: `local_cp_${Date.now()}`,
        missionId,
        type,
        lat,
        lng,
        note,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
      },
    };
  }

  try {
    const res = await fetch(`/api/missions/${missionId}/checkpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, lat, lng, note }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erreur lors de l'enregistrement du jalon.");
    }

    const data = await res.json();
    return {
      success: true,
      offline: false,
      checkpoint: data.checkpoint,
      missionStatus: data.missionStatus || nextStatus,
    };
  } catch (err: any) {
    const action = await enqueueAction(
      "POST_CHECKPOINT",
      { type, lat, lng, note },
      missionId
    );
    return {
      success: true,
      offline: true,
      actionId: action.id,
      missionStatus: nextStatus,
      checkpoint: {
        id: `local_cp_${Date.now()}`,
        missionId,
        type,
        lat,
        lng,
        note,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
      },
    };
  }
}

/**
 * 3. PATCH /api/missions/[id]/accept
 * Acceptation d'une mission par un livreur (optimiste en mode hors ligne).
 */
export async function acceptMissionAction(params: { missionId: string }) {
  const { missionId } = params;

  if (!isOnline()) {
    const action = await enqueueAction("ACCEPT_MISSION", {}, missionId);
    return {
      success: true,
      offline: true,
      actionId: action.id,
      mission: {
        id: missionId,
        status: "ACCEPTED",
        isOptimistic: true,
      },
    };
  }

  try {
    const res = await fetch(`/api/missions/${missionId}/accept`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Impossible d'accepter la mission.");
    }

    const data = await res.json();
    return {
      success: true,
      offline: false,
      mission: data.mission,
    };
  } catch (err: any) {
    const action = await enqueueAction("ACCEPT_MISSION", {}, missionId);
    return {
      success: true,
      offline: true,
      actionId: action.id,
      mission: {
        id: missionId,
        status: "ACCEPTED",
        isOptimistic: true,
      },
    };
  }
}

/**
 * 4. POST /api/missions/[id]/proof
 * Upload d'une preuve scellée avec compression photo < 1 Mo et file d'attente hors ligne.
 */
export async function uploadMissionProof(params: {
  missionId: string;
  photoBase64: string;
  signatureBase64: string;
  lat?: number | null;
  lng?: number | null;
  gpsAccuracy?: number | null;
  deviceFingerprint?: string | null;
}) {
  const {
    missionId,
    photoBase64,
    signatureBase64,
    lat = null,
    lng = null,
    gpsAccuracy = null,
    deviceFingerprint = null,
  } = params;

  // Compression automatique de la photo sous 1 Mo avant mise en cache ou envoi
  const compressedPhoto = await compressImageBase64(photoBase64, {
    maxSizeBytes: 1024 * 1024,
    maxWidthOrHeight: 1280,
  });

  const payload = {
    photoBase64: compressedPhoto,
    signatureBase64,
    lat,
    lng,
    gpsAccuracy,
    deviceFingerprint,
  };

  if (!isOnline()) {
    const action = await enqueueAction("UPLOAD_PROOF", payload, missionId);
    return {
      success: true,
      offline: true,
      actionId: action.id,
      notice: "Preuve enregistrée localement. Elle sera scellée au retour du réseau.",
    };
  }

  try {
    const res = await fetch(`/api/missions/${missionId}/proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Impossible de sceller la preuve.");
    }

    const data = await res.json();
    return {
      success: true,
      offline: false,
      proof: data.proof,
      pdfUrl: data.pdfUrl,
    };
  } catch (err: any) {
    const action = await enqueueAction("UPLOAD_PROOF", payload, missionId);
    return {
      success: true,
      offline: true,
      actionId: action.id,
      notice: "Preuve enregistrée localement. Elle sera scellée au retour du réseau.",
    };
  }
}

