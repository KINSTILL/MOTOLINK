import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { DEFAULT_CITY } from "@/lib/rating";
import { normalizeChannel, sendNotification } from "@/lib/notifications";

/**
 * MotoLink — Annuaire volontaire des livreurs.
 * Règle d'or : le numéro de téléphone du livreur n'est JAMAIS exposé par l'annuaire.
 * Il n'est révélé au vendeur qu'après acceptation explicite de sa demande de contact.
 */

export const REFUSAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours sans nouvelle demande après un refus
const DIRECTORY_FETCH_CAP = 500;
const DRIVER_LINK = "https://motolink.cm/dashboard/driver";
const VENDOR_LINK = "https://motolink.cm/dashboard/vendor/directory";

export class DirectoryError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DirectoryError";
    this.status = status;
  }
}

export type ContactStatus = "none" | "pending" | "accepted" | "refused";

export interface DirectoryDriver {
  driverId: string;
  name: string;
  photoUrl: string | null;
  city: string;
  zones: string[];
  driverStatus: "AVAILABLE" | "ON_MISSION" | "OFFLINE";
  score: number | null;
  ratingCount: number;
  badges: string[]; // id_verified, syndicate, enrolled, sponsor, sponsor_confirmed, sponsor_gold, sponsor_platinum
  contactStatus: ContactStatus;
  inFleet: boolean;
}

// ---------------------------------------------------------------------------
// Visibilité
// ---------------------------------------------------------------------------

export async function setDirectoryVisibility(
  driverId: string,
  visible: boolean
): Promise<{ visible: boolean; visibleAt: Date | null; changed: boolean }> {
  const driver = await prisma.user.findUnique({
    where: { id: driverId },
    select: { id: true, role: true, directoryVisible: true, directoryVisibleAt: true },
  });
  if (!driver || driver.role !== "DRIVER") {
    throw new DirectoryError(403, "Réservé aux livreurs.");
  }

  if (driver.directoryVisible === visible) {
    return {
      visible,
      visibleAt: driver.directoryVisibleAt,
      changed: false,
    };
  }

  const visibleAt = visible ? new Date() : null;
  await prisma.user.update({
    where: { id: driverId },
    data: { directoryVisible: visible, directoryVisibleAt: visibleAt },
  });

  await logEvent("DIRECTORY_VISIBILITY_TOGGLED", "DRIVER", driverId, driverId, {
    visible,
    previous: driver.directoryVisible,
    consentAt: visibleAt ? visibleAt.toISOString() : null,
  });

  return { visible, visibleAt, changed: true };
}

// ---------------------------------------------------------------------------
// Liste de l'annuaire (jamais de téléphone)
// ---------------------------------------------------------------------------

export interface ListDirectoryOptions {
  vendorId: string;
  city?: string;
  search?: string;
  status?: "available" | "on_mission" | "offline";
  verifiedOnly?: boolean;
  limit?: number;
}

export async function listDirectoryDrivers(
  options: ListDirectoryOptions
): Promise<DirectoryDriver[]> {
  const limit = Math.min(Math.max(1, options.limit ?? 20), 50);
  const city = options.city?.trim();
  const search = options.search?.trim().toLowerCase();

  const cityFilter = city
    ? city.toLowerCase() === DEFAULT_CITY.toLowerCase()
      ? {
          OR: [
            { city: { equals: city, mode: "insensitive" as const } },
            { city: null },
          ],
        }
      : { city: { equals: city, mode: "insensitive" as const } }
    : {};

  const drivers = await prisma.user.findMany({
    where: {
      role: "DRIVER",
      directoryVisible: true,
      ...cityFilter,
    },
    // Sélection explicite : le champ `phone` est volontairement absent
    select: {
      id: true,
      name: true,
      brandingLogoUrl: true,
      city: true,
      workZones: true,
      driverStatus: true,
      driverScore: true,
      driverRatingCount: true,
      referrerBadge: true,
      kycDocuments: {
        where: { status: "VERIFIED" },
        select: { type: true },
      },
    },
    take: DIRECTORY_FETCH_CAP,
  });

  const ids = drivers.map((d) => d.id);
  const [requests, favorites] = await Promise.all([
    prisma.directoryContactRequest.findMany({
      where: { vendorId: options.vendorId, driverId: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: { driverId: true, status: true },
    }),
    prisma.favoriteDriver.findMany({
      where: { buyerId: options.vendorId, driverId: { in: ids } },
      select: { driverId: true },
    }),
  ]);

  // La demande la plus récente fait foi (les plus récentes viennent en premier)
  const latestStatus = new Map<string, ContactStatus>();
  for (const r of requests) {
    if (!latestStatus.has(r.driverId)) {
      latestStatus.set(r.driverId, r.status as ContactStatus);
    }
  }
  const inFleet = new Set(favorites.map((f) => f.driverId));

  const statusPriority = { AVAILABLE: 0, ON_MISSION: 1, OFFLINE: 2 } as const;

  const items: DirectoryDriver[] = drivers.map((d) => {
    const badges: string[] = [];
    const types = new Set(d.kycDocuments.map((k) => k.type));
    if (types.has("ID_CARD")) badges.push("id_verified");
    if (types.has("SYNDICATE_CARD")) badges.push("syndicate");
    if (types.has("ENROLLMENT_CERT")) badges.push("enrolled");
    if (d.referrerBadge) badges.push(d.referrerBadge);

    return {
      driverId: d.id,
      name: d.name || "Livreur MotoLink",
      photoUrl: d.brandingLogoUrl || null,
      city: d.city || DEFAULT_CITY,
      zones: d.workZones,
      driverStatus: d.driverStatus,
      score:
        d.driverRatingCount > 0 ? Math.round(d.driverScore * 10) / 10 : null,
      ratingCount: d.driverRatingCount,
      badges,
      contactStatus: latestStatus.get(d.id) ?? "none",
      inFleet: inFleet.has(d.id),
    };
  });

  return items
    .filter((item) => {
      if (options.status) {
        if (item.driverStatus.toLowerCase() !== options.status) return false;
      }
      if (options.verifiedOnly && !item.badges.includes("id_verified")) {
        return false;
      }
      if (search) {
        const haystack = [item.name, item.city, ...item.zones]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        statusPriority[a.driverStatus] - statusPriority[b.driverStatus] ||
        (b.score ?? -1) - (a.score ?? -1) ||
        a.name.localeCompare(b.name, "fr")
    )
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Demande de contact
// ---------------------------------------------------------------------------

async function notifyUser(
  target: {
    phone: string;
    preferredChannel: string | null;
    notificationChannel: string | null;
  },
  template: string,
  params: Record<string, string>
): Promise<"sent" | "failed"> {
  try {
    const result = await sendNotification(
      target.phone,
      template,
      params,
      normalizeChannel(target.preferredChannel || target.notificationChannel)
    );
    return result.success ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function requestContact(vendorId: string, driverId: string) {
  const [vendor, driver] = await Promise.all([
    prisma.user.findUnique({
      where: { id: vendorId },
      select: { id: true, role: true, shopName: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        directoryVisible: true,
        preferredChannel: true,
        notificationChannel: true,
      },
    }),
  ]);

  if (!vendor || vendor.role !== "VENDOR") {
    throw new DirectoryError(403, "Accès réservé aux vendeurs.");
  }
  // Un livreur qui a désactivé sa visibilité n'est plus joignable via l'annuaire
  if (!driver || driver.role !== "DRIVER" || !driver.directoryVisible) {
    throw new DirectoryError(404, "Ce livreur n'est pas disponible dans l'annuaire.");
  }

  const alreadyInFleet = await prisma.favoriteDriver.findUnique({
    where: { buyerId_driverId: { buyerId: vendorId, driverId } },
    select: { id: true },
  });
  if (alreadyInFleet) {
    throw new DirectoryError(409, "Ce livreur fait déjà partie de votre flotte.");
  }

  const last = await prisma.directoryContactRequest.findFirst({
    where: { vendorId, driverId },
    orderBy: { createdAt: "desc" },
  });
  if (last?.status === "pending") {
    throw new DirectoryError(409, "Une demande est déjà en attente pour ce livreur.");
  }
  if (
    last?.status === "refused" &&
    last.respondedAt &&
    Date.now() - last.respondedAt.getTime() < REFUSAL_COOLDOWN_MS
  ) {
    throw new DirectoryError(
      429,
      "Ce livreur a décliné votre dernière demande. Vous pourrez le recontacter dans quelques jours."
    );
  }

  const request = await prisma.directoryContactRequest.create({
    data: { vendorId, driverId },
  });

  const shopName = vendor.shopName || vendor.name || "Un vendeur MotoLink";
  const driverNotifStatus = await notifyUser(driver, "directory_contact_request", {
    driverName: driver.name || "Livreur",
    shopName,
    link: DRIVER_LINK,
  });

  const updated = await prisma.directoryContactRequest.update({
    where: { id: request.id },
    data: { driverNotifStatus },
  });

  await logEvent("DIRECTORY_CONTACT_REQUESTED", "DIRECTORY", request.id, vendorId, {
    requestId: request.id,
    driverId,
    shopName,
    driverNotifStatus,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Réponse du livreur
// ---------------------------------------------------------------------------

export async function respondToContactRequest(
  requestId: string,
  driverId: string,
  response: "accepted" | "refused"
) {
  const request = await prisma.directoryContactRequest.findUnique({
    where: { id: requestId },
    include: {
      vendor: {
        select: {
          id: true,
          phone: true,
          shopName: true,
          name: true,
          preferredChannel: true,
          notificationChannel: true,
        },
      },
      driver: { select: { id: true, name: true } },
    },
  });

  // Une demande qui ne vous est pas adressée est traitée comme introuvable
  if (!request || request.driverId !== driverId) {
    throw new DirectoryError(404, "Demande introuvable.");
  }

  const respondedAt = new Date();

  // Garde atomique : une demande ne peut être traitée qu'une seule fois
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.directoryContactRequest.updateMany({
      where: { id: requestId, status: "pending" },
      data: { status: response, respondedAt },
    });
    if (claimed.count === 0) {
      throw new DirectoryError(409, "Cette demande a déjà reçu une réponse.");
    }

    if (response === "accepted") {
      await tx.favoriteDriver.upsert({
        where: {
          buyerId_driverId: { buyerId: request.vendorId, driverId },
        },
        create: {
          buyerId: request.vendorId,
          driverId,
          source: "directory",
        },
        update: {},
      });
    }

    return tx.directoryContactRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
  });

  const driverName = request.driver.name || "Le livreur";
  const shopName = request.vendor.shopName || request.vendor.name || "";
  const vendorNotifStatus = await notifyUser(
    request.vendor,
    response === "accepted"
      ? "directory_contact_accepted"
      : "directory_contact_refused",
    { driverName, shopName, link: VENDOR_LINK }
  );

  const final = await prisma.directoryContactRequest.update({
    where: { id: requestId },
    data: { vendorNotifStatus },
  });

  await logEvent(
    response === "accepted"
      ? "DIRECTORY_CONTACT_ACCEPTED"
      : "DIRECTORY_CONTACT_REFUSED",
    "DIRECTORY",
    requestId,
    driverId,
    {
      requestId,
      vendorId: request.vendorId,
      response,
      phoneRevealed: response === "accepted",
      vendorNotifStatus,
    }
  );

  return { request: final, respondedAt: updated.respondedAt };
}

// ---------------------------------------------------------------------------
// Listes des demandes (vendeur : envoyées / livreur : reçues)
// ---------------------------------------------------------------------------

export async function listContactRequests(userId: string, role: string) {
  if (role === "VENDOR") {
    const rows = await prisma.directoryContactRequest.findMany({
      where: { vendorId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        driver: { select: { id: true, name: true, phone: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      respondedAt: r.respondedAt,
      driver: {
        id: r.driver.id,
        name: r.driver.name || "Livreur MotoLink",
        // Le numéro n'est révélé qu'après acceptation
        phone: r.status === "accepted" ? r.driver.phone : null,
      },
    }));
  }

  if (role === "DRIVER") {
    const rows = await prisma.directoryContactRequest.findMany({
      where: { driverId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        vendor: { select: { id: true, shopName: true, name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      respondedAt: r.respondedAt,
      vendor: {
        id: r.vendor.id,
        name: r.vendor.shopName || r.vendor.name || "Vendeur MotoLink",
      },
    }));
  }

  throw new DirectoryError(403, "Accès non autorisé.");
}

// Rate limiting : max 10 demandes de contact par minute et par vendeur
const contactRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const MAX_REQUESTS_PER_MINUTE = 10;
const ONE_MINUTE_MS = 60 * 1000;

export function checkContactRequestRateLimit(vendorId: string): boolean {
  const now = Date.now();
  const entry = contactRateLimitMap.get(vendorId);
  if (!entry || now - entry.windowStart > ONE_MINUTE_MS) {
    contactRateLimitMap.set(vendorId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_MINUTE) return false;
  entry.count += 1;
  return true;
}

export function resetContactRequestRateLimit(vendorId?: string) {
  if (vendorId) contactRateLimitMap.delete(vendorId);
  else contactRateLimitMap.clear();
}


