import crypto from "crypto";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const GENESIS_HASH = "GENESIS";

export type AuditEventType =
  | "PROOF_CREATED"
  | "PROOF_VERIFIED"
  | "PROOF_VIEWED"
  | "PROOF_EXPORTED"
  | "MISSION_STATUS_CHANGED"
  | "KYC_SUBMITTED"
  | "KYC_VALIDATED"
  | "KYC_REJECTED"
  | "BUYER_CONTACT_VIEWED"
  | "BUYER_PRESENCE_CONFIRMED"
  | "DRIVER_STATUS_CHANGED"
  | "FLEET_DRIVER_REMOVED"
  | "FLEET_DRIVER_VIEWED"
  | "OFFLINE_NOTIFICATION_SENT"
  | "OFFLINE_NOTIFICATION_FAILED"
  | "INVITATION_SENT"
  | "INVITATION_ACCEPTED"
  | "INVITATION_EXPIRED"
  | "REFERRAL_CREATED"
  | "REFERRAL_COMPLETED"
  | "REFERRAL_REWARD_APPLIED"
  | "PRIORITY_MISSION_USED"
  | "UNSPONSORED"
  | string;

export type AuditEntityType = "PROOF" | "MISSION" | "KYC" | "DRIVER" | "FLEET" | "NOTIFICATION" | "INVITATION" | "REFERRAL" | string;

export interface VerifyChainResult {
  valid: boolean;
  brokenAt?: string;
  totalLogs: number;
}

/**
 * Calcule le hash SHA-256 d'un maillon du journal d'audit :
 * SHA256(previousHash + id + eventType + entityId + actorId + createdAt)
 */
export function computeAuditHash(params: {
  previousHash: string;
  id: string;
  eventType: string;
  entityId: string;
  actorId?: string | null;
  createdAt: Date | string;
}): string {
  const createdAtIso =
    typeof params.createdAt === "string"
      ? new Date(params.createdAt).toISOString()
      : params.createdAt.toISOString();

  const payload = `${params.previousHash}${params.id}${params.eventType}${
    params.entityId
  }${params.actorId ?? ""}${createdAtIso}`;

  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Extrait l'adresse IP du client depuis les en-têtes HTTP Next.js (si disponibles).
 */
function extractRequestIp(metadata?: Record<string, unknown> | null): string {
  if (metadata && typeof metadata.actorIp === "string" && metadata.actorIp) {
    return metadata.actorIp;
  }
  if (metadata && typeof metadata.ip === "string" && metadata.ip) {
    return metadata.ip;
  }
  try {
    const hdrs = headers();
    const forwarded = hdrs.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
    const realIp = hdrs.get("x-real-ip");
    if (realIp) {
      return realIp.trim();
    }
  } catch {
    // Hors contexte de requête Next.js (ex: script de test ou tâche de fond)
  }
  return "127.0.0.1";
}

/**
 * Enregistre un événement dans le journal d'audit append-only avec chaînage cryptographique SHA-256.
 * Ne lève jamais d'exception : une erreur d'écriture de log ne bloque jamais l'action métier principale.
 */
export async function logEvent(
  eventType: AuditEventType,
  entityType: AuditEntityType,
  entityId: string,
  actorId?: string | null,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  try {
    const actorIp = extractRequestIp(metadata);

    let actorRole: string = actorId ? "USER" : "PUBLIC";
    if (metadata && typeof metadata.actorRole === "string" && metadata.actorRole) {
      actorRole = metadata.actorRole;
    } else if (actorId) {
      try {
        const session = await getSession();
        if (session && session.userId === actorId && session.role) {
          actorRole = session.role;
        } else {
          const user = await prisma.user.findUnique({
            where: { id: actorId },
            select: { role: true },
          });
          if (user?.role) {
            actorRole = user.role;
          }
        }
      } catch {
        // Ignore hors contexte
      }
    }

    // a. Récupère previousHash (dernier log chaîné)
    const lastLog = await prisma.auditLog.findFirst({
      where: {
        currentHash: { not: "" },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        currentHash: true,
        createdAt: true,
      },
    });

    const previousHash = lastLog?.currentHash || GENESIS_HASH;
    const id = crypto.randomUUID();

    // Garantit un horodatage strictement monotone (+1ms minimum par rapport au maillon précédent)
    const nowMs = Date.now();
    const minMs = lastLog ? lastLog.createdAt.getTime() + 1 : nowMs;
    const createdAt = new Date(Math.max(nowMs, minMs));

    const normalizedActorId = actorId ?? null;

    // b. currentHash = SHA256(previousHash + id + eventType + entityId + actorId + createdAt)
    const currentHash = computeAuditHash({
      previousHash,
      id,
      eventType,
      entityId,
      actorId: normalizedActorId,
      createdAt,
    });

    // c. Insère en base (append-only)
    await prisma.auditLog.create({
      data: {
        id,
        eventType,
        entityType,
        entityId,
        actorId: normalizedActorId,
        actorRole,
        actorIp,
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        previousHash,
        currentHash,
        action: eventType,
        createdAt,
      },
    });
  } catch (error) {
    console.error("[Audit] Erreur non-bloquante lors de logEvent :", error);
  }
}

/**
 * Vérifie l'intégrité cryptographique de la chaîne d'audit append-only.
 * Recalcule chaque hash SHA-256 et vérifie la continuité de previousHash.
 */
export async function verifyChain(
  startId?: string
): Promise<VerifyChainResult> {
  const logs = await prisma.auditLog.findMany({
    where: {
      currentHash: { not: "" },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (logs.length === 0) {
    return { valid: true, totalLogs: 0 };
  }

  let startIndex = 0;
  if (startId) {
    const foundIdx = logs.findIndex((l) => l.id === startId);
    if (foundIdx === -1) {
      return { valid: false, brokenAt: startId, totalLogs: logs.length };
    }
    startIndex = foundIdx;
  }

  for (let i = startIndex; i < logs.length; i++) {
    const log = logs[i];
    const expectedPreviousHash =
      i === 0 ? GENESIS_HASH : logs[i - 1].currentHash;

    if (log.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        brokenAt: log.id,
        totalLogs: logs.length,
      };
    }

    const recalculatedHash = computeAuditHash({
      previousHash: log.previousHash,
      id: log.id,
      eventType: log.eventType,
      entityId: log.entityId,
      actorId: log.actorId,
      createdAt: log.createdAt,
    });

    if (log.currentHash !== recalculatedHash) {
      return {
        valid: false,
        brokenAt: log.id,
        totalLogs: logs.length,
      };
    }
  }

  return {
    valid: true,
    totalLogs: logs.length,
  };
}

