import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/audit";
import { formatDoualaDateTime } from "@/lib/utils";
import TsaVerifyModal from "@/components/TsaVerifyModal";
import CopyHashButton from "@/components/CopyHashButton";
import Footer from "@/components/Footer";
import {
  Bike,
  Camera,
  Clock,
  FileText,
  History,
  MapPin,
  Package,
  ShieldCheck,
} from "lucide-react";

/**
 * Tronque l'adresse IP pour l'affichage public (ex: 197.159.22.10 -> 197.159.22.***).
 */
function truncateIp(ip: string | null | undefined): string {
  if (!ip) return "127.0.0.***";
  const clean = ip.trim();
  if (clean.includes(".")) {
    const parts = clean.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
    }
  }
  if (clean.includes(":")) {
    const parts = clean.split(":");
    return `${parts.slice(0, 2).join(":")}:****`;
  }
  return clean;
}

export default async function PublicVerifyProofPage({
  params,
  searchParams,
}: {
  params: { hash: string };
  searchParams?: { tsa?: string };
}) {
  const proof = await prisma.proof.findUnique({
    where: { proofHash: params.hash },
    select: {
      id: true,
      missionId: true,
      photoUrl: true,
      signatureUrl: true,
      pdfUrl: true,
      proofHash: true,
      lat: true,
      lng: true,
      gpsAccuracy: true,
      capturedAt: true,
      createdAt: true,
      tsaVerified: true,
      tsaTimestamp: true,
      tsaUrl: true,
      mission: {
        select: {
          id: true,
          description: true,
          address: true,
          price: true,
          buyerName: true,
          buyerPhone: true,
          vendor: {
            select: { shopName: true, name: true, phone: true },
          },
          driver: {
            select: { name: true, phone: true },
          },
        },
      },
    },
  });

  let lastVerificationLog: {
    createdAt: Date;
    actorIp: string | null;
  } | null = null;

  if (proof) {
    // Récupère la dernière vérification enregistrée avant ou lors de cet accès
    await logEvent("PROOF_VERIFIED", "PROOF", proof.id, null, {
      proofHash: proof.proofHash,
      missionId: proof.missionId,
      actorRole: "PUBLIC",
    });

    lastVerificationLog = await prisma.auditLog.findFirst({
      where: {
        entityType: "PROOF",
        entityId: proof.id,
        eventType: "PROOF_VERIFIED",
      },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        actorIp: true,
      },
    });
  }

  const hashLine1 = proof ? proof.proofHash.slice(0, 32) : "";
  const hashLine2 = proof ? proof.proofHash.slice(32, 64) : "";

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-6 text-slate-50">
      <div className="mx-auto max-w-md space-y-5">
        {/* Header simple : logo + "Vérification de preuve" */}
        <header className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/25">
              <Bike className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight text-slate-50">
                Moto<span className="text-secondary">Link</span>
              </span>
              <p className="text-xs font-semibold text-slate-400">
                Vérification de preuve
              </p>
            </div>
          </div>
          <span className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-400">
            SHA-256
          </span>
        </header>

        {proof ? (
          <div className="space-y-4">
            {/* 1. BADGE : vert "✓ Preuve authentique" + "Créée le {date}, non modifiée" */}
            <section className="rounded-2xl border border-emerald-500/50 bg-emerald-500/15 p-5 text-center space-y-1.5">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-1.5 text-lg font-extrabold text-emerald-300">
                <span>✓ Preuve authentique</span>
              </div>
              <p className="text-xs font-medium text-slate-200">
                Créée le {formatDoualaDateTime(proof.createdAt)}, non modifiée
              </p>
            </section>

            {/* 2. DÉTAILS */}

            {/* Carte Mission : ID, vendeur, livreur, acheteur, description */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <Package className="h-4 w-4" />
                <span>Carte Mission</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <span className="text-slate-400">ID Mission</span>
                  <span className="font-mono font-semibold text-slate-200">
                    {proof.mission.id.slice(0, 8)}...{proof.mission.id.slice(-4)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Vendeur</span>
                  <span className="font-semibold text-slate-100">
                    {proof.mission.vendor.shopName ||
                      proof.mission.vendor.name ||
                      proof.mission.vendor.phone}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Livreur</span>
                  <span className="font-semibold text-slate-100">
                    {proof.mission.driver?.name ||
                      proof.mission.driver?.phone ||
                      "Livreur MotoLink"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Acheteur</span>
                  <span className="font-semibold text-slate-100">
                    {proof.mission.buyerName || proof.mission.buyerPhone}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-slate-400">Description</span>
                  <span className="text-right font-medium text-slate-200">
                    {proof.mission.description || "Colis MotoLink"}
                  </span>
                </div>
              </div>
            </section>

            {/* Carte Horodatage : createdAt (Douala), TSA badge "🔒 Horodaté par FreeTSA" ou "Ancrage indisponible" */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <Clock className="h-4 w-4" />
                <span>Carte Horodatage</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Horodatage (Douala)</span>
                <span className="font-semibold text-slate-100">
                  {formatDoualaDateTime(proof.createdAt)}
                </span>
              </div>

              {proof.tsaVerified ? (
                <TsaVerifyModal
                  proofHash={proof.proofHash}
                  initialOpen={searchParams?.tsa === "true"}
                  tsaUrl={proof.tsaUrl}
                  tsaTimestampIso={
                    proof.tsaTimestamp ? proof.tsaTimestamp.toISOString() : null
                  }
                />
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs">
                  <span className="font-semibold text-amber-300">
                    Ancrage indisponible
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Preuve locale uniquement
                  </span>
                </div>
              )}
            </section>

            {/* Carte Géolocalisation : lat/lng arrondis, précision ±Xm, ou "Non disponible" */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <MapPin className="h-4 w-4" />
                <span>Carte Géolocalisation</span>
              </div>

              {proof.lat !== null && proof.lng !== null ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs">
                  <span className="font-mono font-semibold text-slate-100">
                    {proof.lat.toFixed(4)}, {proof.lng.toFixed(4)}
                  </span>
                  <span className="rounded-lg border border-secondary/40 bg-secondary/15 px-2 py-0.5 font-semibold text-secondary">
                    Précision ±
                    {proof.gpsAccuracy !== null
                      ? `${Math.round(proof.gpsAccuracy)}m`
                      : "N/A"}
                  </span>
                </div>
              ) : (
                <p className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs font-medium text-slate-400">
                  Non disponible
                </p>
              )}
            </section>

            {/* Carte Empreinte : hash SHA-256 monospace 2 lignes, bouton Copier */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Carte Empreinte (SHA-256)</span>
                </div>
                <CopyHashButton hash={proof.proofHash} />
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200">
                <div className="truncate">{hashLine1}</div>
                <div className="truncate">{hashLine2}</div>
              </div>
            </section>

            {/* Carte Signature/Photo : miniatures, bouton "Voir le PDF complet" */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                <Camera className="h-4 w-4" />
                <span>Carte Signature & Photo</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-slate-400">
                    Photo du colis
                  </span>
                  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={proof.photoUrl}
                      alt="Miniature photo du colis livré"
                      className="h-28 w-full object-cover"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-[11px] font-semibold text-slate-400">
                    Signature acheteur
                  </span>
                  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={proof.signatureUrl}
                      alt="Miniature signature manuscrite de l'acheteur"
                      className="h-28 w-full object-contain p-1"
                    />
                  </div>
                </div>
              </div>

              <a
                href={proof.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98]"
              >
                <FileText className="h-4 w-4" />
                <span>Voir le PDF complet</span>
              </a>
            </section>

            {/* 3. HISTORIQUE : "Dernière vérification le {date} par {ip tronquée}" */}
            {lastVerificationLog && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 shrink-0 text-primary" />
                  <span>
                    Dernière vérification le{" "}
                    <strong className="text-slate-100">
                      {formatDoualaDateTime(lastVerificationLog.createdAt)}
                    </strong>{" "}
                    par{" "}
                    <span className="font-mono text-slate-200">
                      {truncateIp(lastVerificationLog.actorIp)}
                    </span>
                  </span>
                </div>
              </section>
            )}
          </div>
        ) : (
          /* 1. BADGE : rouge "✗ Introuvable" */
          <section className="rounded-2xl border border-danger/50 bg-danger/15 p-6 text-center space-y-3">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-danger/20 px-4 py-1.5 text-lg font-extrabold text-danger">
              <span>✗ Introuvable</span>
            </div>
            <p className="text-sm text-slate-200">
              Aucune preuve de livraison scellée ne correspond à cette empreinte
              SHA-256.
            </p>
            <p className="break-all rounded-xl border border-danger/30 bg-slate-950 p-3 font-mono text-xs text-slate-400">
              {params.hash}
            </p>
          </section>
        )}

        <Footer />
      </div>
    </main>
  );
}
