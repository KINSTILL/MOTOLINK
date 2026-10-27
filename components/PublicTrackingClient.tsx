"use client";

import { useState } from "react";
import Footer from "@/components/Footer";
import SignaturePad from "@/components/SignaturePad";
import { formatDoualaDateTime, formatFCFA } from "@/lib/utils";
import {
  getMissionTypeBadge,
  getMissionTypeFullLabel,
} from "@/lib/validations/mission";
import {
  Bike,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flame,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  ShieldCheck,
  Star,
  Store,
  X,
} from "lucide-react";

export interface PublicTrackingMission {
  id: string;
  publicToken: string;
  status: "CREATED" | "ACCEPTED" | "IN_PROGRESS" | "DELIVERED" | "CANCELLED" | "DISPUTE";
  type: "PARCEL" | "GAS" | "GROCERIES" | "OTHER";
  gasCertified?: boolean;
  description?: string | null;
  price: number;
  articlePhotoUrls: string[];
  address: string;
  buyerPresenceConfirmedAt?: string | null;
  pickupPhotoUrl?: string | null;
  createdAt: string;
  vendor: {
    shopName: string;
    brandingLogoUrl?: string | null;
    brandingColorHex?: string | null;
    catalogUrl?: string | null;
    rating?: number | null;
    ratingCount?: number;
  };
  driver?: {
    name: string;
    phone: string;
    rating?: number | null;
    ratingCount?: number;
    kycBadges: {
      idCardVerified: boolean;
      syndicateVerified: boolean;
      syndicateName?: string | null;
      enrollmentVerified: boolean;
    };
  } | null;
  checkpoints: Array<{
    id: string;
    type:
      | "PICKED_UP"
      | "IN_TRANSIT"
      | "NEARBY"
      | "DELIVERED"
      | "CUSTOM"
      | "BUYER_CONFIRMED_PRESENCE";
    note?: string | null;
    photoUrl?: string | null;
    createdAt: string;
  }>;
}

const STATUS_DETAILS: Record<
  string,
  { label: string; badgeClass: string; dotClass: string }
> = {
  CREATED: {
    label: "En attente d'un livreur",
    badgeClass: "bg-slate-800 text-slate-300 border-slate-700",
    dotClass: "bg-slate-400",
  },
  ACCEPTED: {
    label: "Livreur assigné",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    dotClass: "bg-blue-400",
  },
  IN_PROGRESS: {
    label: "En cours de livraison",
    badgeClass: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    dotClass: "bg-orange-400 animate-pulse",
  },
  DELIVERED: {
    label: "Livré",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    dotClass: "bg-emerald-400",
  },
  CANCELLED: {
    label: "Annulé",
    badgeClass: "bg-slate-800 text-slate-400 border-slate-700",
    dotClass: "bg-slate-400",
  },
  DISPUTE: {
    label: "En litige",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/30",
    dotClass: "bg-red-400",
  },
};

const CHECKPOINT_TITLES: Record<string, string> = {
  PICKED_UP: "Colis récupéré par le livreur",
  IN_TRANSIT: "En cours de route vers vous",
  NEARBY: "Le livreur est à proximité !",
  BUYER_CONFIRMED_PRESENCE: "Présence confirmée par l'acheteur",
  DELIVERED: "Colis remis et réceptionné",
  CUSTOM: "Point d'étape",
};

export default function PublicTrackingClient({
  mission: initialMission,
}: {
  mission: PublicTrackingMission;
}) {
  const [mission, setMission] = useState<PublicTrackingMission>(initialMission);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [isSigningOpen, setIsSigningOpen] = useState(false);
  const [submittingSignature, setSubmittingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [justSigned, setJustSigned] = useState(false);

  // État de confirmation de présence par l'acheteur
  const [confirmingPresence, setConfirmingPresence] = useState(false);
  const [presenceNotice, setPresenceNotice] = useState<string | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);

  const brandColor = mission.vendor.brandingColorHex || "#2563eb";
  const statusInfo = STATUS_DETAILS[mission.status] || STATUS_DETAILS.CREATED;
  const hasNearbyCheckpoint = mission.checkpoints.some((cp) => cp.type === "NEARBY");

  const handleConfirmPresence = async () => {
    if (confirmingPresence) return;
    setConfirmingPresence(true);
    setPresenceError(null);

    try {
      const res = await fetch(`/api/missions/${mission.id}/confirm-presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken: mission.publicToken }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPresenceError(data.error || "Impossible de confirmer votre présence.");
        setConfirmingPresence(false);
        return;
      }

      const confirmedTime = data.confirmedAt || new Date().toISOString();
      setMission((prev) => ({
        ...prev,
        buyerPresenceConfirmedAt: confirmedTime,
        checkpoints: [
          ...prev.checkpoints,
          {
            id: `cp-presence-${Date.now()}`,
            type: "BUYER_CONFIRMED_PRESENCE",
            note: "Présence confirmée sur place par l'acheteur",
            createdAt: confirmedTime,
          },
        ],
      }));
      setPresenceNotice("✅ Présence confirmée. Le livreur va procéder à la remise.");
    } catch {
      setPresenceError("Erreur réseau lors de la confirmation.");
    } finally {
      setConfirmingPresence(false);
    }
  };

  const handleConfirmSignature = async (sigBase64: string) => {
    setSubmittingSignature(true);
    setSignatureError(null);

    try {
      const res = await fetch(`/api/missions/${mission.id}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureBase64: sigBase64,
          buyerSigned: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSignatureError(data.error || "Impossible d'enregistrer la signature.");
        setSubmittingSignature(false);
        return;
      }

      setMission((prev) => ({
        ...prev,
        status: "DELIVERED",
        checkpoints: [
          ...prev.checkpoints,
          {
            id: `cp-signed-${Date.now()}`,
            type: "DELIVERED",
            note: "Livraison confirmée et signée par l'acheteur",
            createdAt: new Date().toISOString(),
          },
        ],
      }));
      setJustSigned(true);
      setIsSigningOpen(false);
    } catch {
      setSignatureError("Erreur réseau lors de la validation de la signature.");
    } finally {
      setSubmittingSignature(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-50 flex flex-col justify-between">
      <div className="mx-auto w-full max-w-md px-4 py-5 space-y-5">
        {/* 1. HEADER BRANDÉ */}
        <header
          className="rounded-2xl border p-4 space-y-2.5 transition"
          style={{
            borderColor: `${brandColor}40`,
            backgroundColor: `${brandColor}10`,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {mission.vendor.brandingLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mission.vendor.brandingLogoUrl}
                  alt={mission.vendor.shopName}
                  className="h-12 w-12 rounded-xl object-cover border border-slate-700 bg-slate-900 shadow-sm"
                />
              ) : (
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-black text-lg text-white shadow-md"
                  style={{ backgroundColor: brandColor }}
                >
                  {mission.vendor.shopName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Store className="h-4 w-4 text-slate-400" />
                  <h1 className="text-base font-extrabold text-slate-50 line-clamp-1">
                    {mission.vendor.shopName}
                  </h1>
                </div>
                {mission.vendor.rating ? (
                  <div className="flex items-center gap-1 text-xs text-amber-400 font-semibold">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span>{mission.vendor.rating.toFixed(1)} / 5</span>
                    {mission.vendor.ratingCount ? (
                      <span className="text-[11px] text-slate-400">
                        ({mission.vendor.ratingCount} avis)
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Vendeur vérifié MotoLink
                  </span>
                )}
              </div>
            </div>

            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border text-white"
              style={{
                backgroundColor: `${brandColor}25`,
                borderColor: `${brandColor}60`,
              }}
            >
              Suivi direct
            </span>
          </div>
        </header>

        {/* 2. PHOTOS DE L'ARTICLE */}
        {mission.articlePhotoUrls.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Photo{mission.articlePhotoUrls.length > 1 ? "s" : ""} du colis
              </span>
              {mission.articlePhotoUrls.length > 1 && (
                <div className="flex gap-1">
                  {mission.articlePhotoUrls.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActivePhotoIdx(i)}
                      className={`h-2 rounded-full transition-all ${
                        activePhotoIdx === i
                          ? "w-5 bg-primary"
                          : "w-2 bg-slate-700 hover:bg-slate-500"
                      }`}
                      aria-label={`Photo ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mission.articlePhotoUrls[activePhotoIdx]}
                alt={`Photo de l'article ${activePhotoIdx + 1}`}
                className="h-full w-full object-cover transition duration-300"
              />

              {mission.articlePhotoUrls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setActivePhotoIdx((prev) =>
                        prev === 0 ? mission.articlePhotoUrls.length - 1 : prev - 1
                      )
                    }
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/70 text-white backdrop-blur hover:bg-slate-950 transition"
                    aria-label="Photo précédente"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActivePhotoIdx((prev) =>
                        prev === mission.articlePhotoUrls.length - 1 ? 0 : prev + 1
                      )
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/70 text-white backdrop-blur hover:bg-slate-950 transition"
                    aria-label="Photo suivante"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {/* SECTION PHOTO DE PRISE EN CHARGE (si PICKED_UP complété avec photo) */}
        {mission.pickupPhotoUrl && (
          <section className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-300">
                📦 Photo de prise en charge
              </span>
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                Départ vérifié
              </span>
            </div>
            <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mission.pickupPhotoUrl}
                alt="Photo du colis prise par le coursier à la récupération"
                className="h-full w-full object-cover"
              />
            </div>
            <p className="text-[11px] text-slate-300 text-center">
              Photo certifiée prise par le livreur lors de la prise en charge du colis.
            </p>
          </section>
        )}

        {/* 3. STATUT DE LA LIVRAISON & TIMELINE */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Statut de la course
            </span>
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusInfo.badgeClass}`}
            >
              <span className={`h-2 w-2 rounded-full ${statusInfo.dotClass}`} />
              <span>{statusInfo.label}</span>
            </div>
          </div>

          {/* Timeline des étapes */}
          <div className="space-y-3">
            {mission.checkpoints.length === 0 ? (
              <p className="text-xs text-slate-400">
                La commande a été enregistrée le {formatDoualaDateTime(mission.createdAt)}.
              </p>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {mission.checkpoints.map((cp, idx) => (
                  <div key={cp.id} className="relative space-y-0.5">
                    <span
                      className={`absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-slate-900 ${
                        idx === mission.checkpoints.length - 1
                          ? "bg-primary"
                          : "bg-slate-600"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    <p className="text-xs font-bold text-slate-100">
                      {CHECKPOINT_TITLES[cp.type] || cp.type}
                    </p>
                    {cp.note && (
                      <p className="text-[11px] text-slate-400">{cp.note}</p>
                    )}
                    <span className="text-[10px] text-slate-500">
                      {formatDoualaDateTime(cp.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 4. CARTE DU LIVREUR (si assigné) */}
        {mission.driver && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Votre coursier dédié
              </span>
              {mission.driver.rating ? (
                <div className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                  <Star className="h-3 w-3 fill-amber-400" />
                  <span>{mission.driver.rating.toFixed(1)} / 5</span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary/20 text-secondary shadow-md font-bold text-base">
                <Bike className="h-6 w-6" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <h2 className="text-base font-extrabold text-slate-100 truncate">
                  {mission.driver.name}
                </h2>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {mission.driver.kycBadges.idCardVerified && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                      <ShieldCheck className="h-3 w-3" />
                      <span>Identité vérifiée</span>
                    </span>
                  )}
                  {mission.driver.kycBadges.syndicateVerified && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-500/30">
                      <span>🤝 Membre syndicat</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Boutons d'action : Appel direct + WhatsApp */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <a
                href={`tel:${mission.driver.phone}`}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 text-xs font-bold text-slate-100 border border-slate-700 hover:bg-slate-700 transition active:scale-95"
              >
                <Phone className="h-3.5 w-3.5 text-primary" />
                <span>Appeler</span>
              </a>

              <a
                href={`https://wa.me/${mission.driver.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 text-xs font-bold text-white shadow-md shadow-[#25D366]/25 hover:bg-[#22bf5b] transition active:scale-95"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </section>
        )}

        {/* 5. CARTE DU COLIS */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Détails de la course
              </span>
            </div>
            <span className="text-base font-extrabold text-secondary">
              {formatFCFA(mission.price)}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-primary/30 bg-primary/15 px-2.5 py-0.5 font-bold text-primary">
                {getMissionTypeBadge(mission.type)}
              </span>
              <span className="font-semibold text-slate-200">
                {getMissionTypeFullLabel(mission.type)}
              </span>
            </div>

            {mission.type === "GAS" && mission.gasCertified && (
              <div className="flex items-center gap-1.5 rounded-lg border border-secondary/40 bg-secondary/10 px-2.5 py-1 text-xs font-semibold text-secondary">
                <Flame className="h-3.5 w-3.5" />
                <span>Bonbonne sécurisée et vérifiée</span>
              </div>
            )}

            {mission.description && (
              <p className="text-slate-300 leading-relaxed bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                {mission.description}
              </p>
            )}

            <div className="flex items-start gap-2 text-slate-300 pt-1">
              <MapPin className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
              <span>{mission.address}</span>
            </div>
          </div>
        </section>

        {/* 6. SECTION CONDITIONNELLE : VOTRE LIVREUR EST ARRIVÉ / CONFIRMATION DE PRÉSENCE */}
        {mission.status === "IN_PROGRESS" &&
          !mission.buyerPresenceConfirmedAt &&
          hasNearbyCheckpoint && (
            <section className="rounded-2xl border-2 border-warning/60 bg-warning/10 p-5 space-y-4 text-center shadow-xl shadow-warning/10 animate-in fade-in-50">
              <div className="space-y-1">
                <span className="inline-block text-3xl">📍</span>
                <h3 className="text-lg font-black text-white">
                  Votre livreur est arrivé !
                </h3>
                {mission.driver && (
                  <p className="text-xs text-slate-200">
                    <strong>{mission.driver.name}</strong> vous attend sur place avec votre colis.
                    {mission.driver.rating ? (
                      <span className="ml-1 text-amber-300 font-bold">
                        ★ {mission.driver.rating.toFixed(1)}
                      </span>
                    ) : null}
                  </p>
                )}
              </div>

              {/* Boutons d'appel et WhatsApp rapides pour coordonner */}
              {mission.driver && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <a
                    href={`tel:${mission.driver.phone}`}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-100 border border-slate-700 hover:bg-slate-700 transition"
                  >
                    <Phone className="h-4 w-4 text-primary" />
                    <span>Appeler</span>
                  </a>
                  <a
                    href={`https://wa.me/${mission.driver.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-xs font-bold text-white shadow-md hover:bg-[#22bf5b] transition"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              )}

              {presenceError && (
                <p className="text-xs font-bold text-danger">{presenceError}</p>
              )}

              {presenceNotice ? (
                <div className="rounded-xl border border-success/40 bg-success/20 p-3.5 text-xs font-bold text-success">
                  {presenceNotice}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmPresence}
                  disabled={confirmingPresence}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-warning text-slate-950 font-black text-base shadow-lg shadow-warning/30 transition hover:bg-warning/90 active:scale-95 disabled:opacity-50"
                >
                  {confirmingPresence ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Confirmation en cours...</span>
                    </>
                  ) : (
                    <span>Je suis sur place</span>
                  )}
                </button>
              )}
            </section>
          )}

        {/* 7. SI PRÉSENCE CONFIRMÉE : ENCART VERT + BOUTON SIGNER */}
        {mission.status === "IN_PROGRESS" && mission.buyerPresenceConfirmedAt && (
          <section className="rounded-2xl border-2 border-success/50 bg-success/10 p-5 space-y-3.5 text-center shadow-lg shadow-success/10 animate-in fade-in-50">
            <div className="flex items-center justify-center gap-2 text-success font-extrabold text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>
                ✅ Présence confirmée à{" "}
                {formatDoualaDateTime(mission.buyerPresenceConfirmedAt)}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Le livreur va procéder à la remise. Signez pour finaliser et sceller la livraison.
            </p>
            <button
              type="button"
              onClick={() => setIsSigningOpen(true)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-base font-bold text-white shadow-lg shadow-primary/25 transition active:scale-95 hover:bg-primary/90"
            >
              <span>Signer la livraison</span>
            </button>
          </section>
        )}

        {/* 8. ZONE DE SIGNATURE STANDARD (si IN_PROGRESS sans NEARBY) */}
        {mission.status === "IN_PROGRESS" &&
          !hasNearbyCheckpoint &&
          !mission.buyerPresenceConfirmedAt && (
            <section className="rounded-2xl border-2 border-primary/40 bg-primary/10 p-4 space-y-3 text-center shadow-lg shadow-primary/10">
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-white">
                  Le livreur est arrivé ?
                </h3>
                <p className="text-xs text-slate-300">
                  Signez ici pour confirmer la réception en toute sécurité.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsSigningOpen(true)}
                className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-lg shadow-primary/25 transition active:scale-95"
              >
                <span>Signer la livraison</span>
              </button>
            </section>
          )}

        {justSigned && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-4 text-center space-y-1 text-xs text-emerald-300">
            <p className="font-extrabold text-sm">✓ Livraison signée et scellée</p>
            <p>Votre preuve de livraison a été enregistrée avec succès.</p>
          </div>
        )}

        {/* 9. BOUTON CATALOGUE DU VENDEUR */}
        {mission.vendor.catalogUrl && (
          <a
            href={mission.vendor.catalogUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold text-white shadow-lg transition active:scale-95"
            style={{ backgroundColor: brandColor }}
          >
            <span>Voir notre catalogue</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* 10. FOOTER */}
      <Footer className="px-4" />

      {/* MODALE PLEIN ÉCRAN DE SIGNATURE */}
      {isSigningOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-between bg-slate-950 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="space-y-0.5">
              <h2 className="text-base font-bold text-white">
                Confirmation de réception
              </h2>
              <p className="text-xs text-slate-400">
                Signez du doigt ci-dessous pour valider la remise
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsSigningOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:text-white"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="my-auto py-4">
            <SignaturePad
              onConfirm={handleConfirmSignature}
              onBack={() => setIsSigningOpen(false)}
            />
            {submittingSignature && (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Scellement de la signature en cours...</span>
              </div>
            )}
            {signatureError && (
              <p className="mt-2 text-center text-xs font-semibold text-danger">
                {signatureError}
              </p>
            )}
          </div>

          <div className="text-center text-xs text-slate-500 pb-2">
            Signature certifiée et opposable avec horodatage MotoLink
          </div>
        </div>
      )}
    </div>
  );
}
