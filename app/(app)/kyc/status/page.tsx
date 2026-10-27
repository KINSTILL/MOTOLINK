"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KycBadges, KycCguNotice } from "@/components/KycBadges";
import { formatDoualaDateTime } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface LevelDetail {
  id: string;
  type: "ID_CARD" | "SYNDICATE_CARD" | "ENROLLMENT_CERT";
  status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  syndicateName?: string | null;
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  canResubmit: boolean;
  canResubmitAt?: string | null;
}

interface KycStatusResponse {
  kycStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  verified: boolean;
  levels: {
    idCard: LevelDetail | null;
    syndicate: LevelDetail | null;
    enrollment: LevelDetail | null;
  };
}

export default function KycStatusPage() {
  const [data, setData] = useState<KycStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/kyc/status")
      .then((r) => r.json())
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex py-16 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const levelsConfig = [
    {
      key: "idCard" as const,
      title: "Niveau 1 : CNI Recto/Verso + Selfie",
      badgeText: "✅ Identité vérifiée",
      href: "/kyc/id-card",
      detail: data?.levels.idCard,
    },
    {
      key: "syndicate" as const,
      title: "Niveau 2 : Carte de syndicat",
      badgeText: "🤝 Membre de syndicat",
      href: "/kyc/syndicate",
      detail: data?.levels.syndicate,
    },
    {
      key: "enrollment" as const,
      title: "Niveau 3 : Attestation d'enrôlement CUD/Yaoundé",
      badgeText: "🏛️ Enrôlé",
      href: "/kyc/enrollment",
      detail: data?.levels.enrollment,
    },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/driver"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Retour au tableau de bord</span>
      </Link>

      <div className="space-y-2">
        <h1 className="text-lg font-bold text-slate-50">
          Statut de ma vérification KYC
        </h1>
        <KycBadges
          idCardVerified={data?.levels.idCard?.status === "VERIFIED"}
          syndicateVerified={data?.levels.syndicate?.status === "VERIFIED"}
          syndicateName={data?.levels.syndicate?.syndicateName}
          enrollmentVerified={data?.levels.enrollment?.status === "VERIFIED"}
          showEmpty
        />
      </div>

      {/* Cartes par niveau */}
      <div className="space-y-4">
        {levelsConfig.map((lvl) => {
          const doc = lvl.detail;
          const status = doc?.status || "UNVERIFIED";

          return (
            <div
              key={lvl.key}
              className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-50">
                    {lvl.title}
                  </h2>
                  <p className="text-xs text-slate-400">Badge : {lvl.badgeText}</p>
                </div>

                {status === "VERIFIED" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Validé</span>
                  </span>
                )}

                {status === "PENDING" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">
                    <Clock className="h-3.5 w-3.5" />
                    <span>En cours d&apos;examen</span>
                  </span>
                )}

                {status === "REJECTED" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 text-xs font-semibold text-danger">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Rejeté</span>
                  </span>
                )}

                {status === "UNVERIFIED" && (
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-400">
                    Non soumis
                  </span>
                )}
              </div>

              {/* Affichage du motif de rejet et bouton Renvoyer */}
              {status === "REJECTED" && doc && (
                <div className="space-y-2 rounded-xl border border-danger/40 bg-danger/10 p-3">
                  <p className="text-sm font-semibold text-danger">
                    Motif du refus :{" "}
                    <span className="font-normal text-slate-200">
                      {doc.rejectionReason || "Document illisible ou non conforme"}
                    </span>
                  </p>

                  {doc.canResubmit ? (
                    <Link
                      href={lvl.href}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <span>Renvoyer</span>
                    </Link>
                  ) : (
                    <p className="text-xs text-slate-300">
                      Nouvel envoi autorisé après 24h (à partir du{" "}
                      {doc.canResubmitAt
                        ? formatDoualaDateTime(doc.canResubmitAt)
                        : "lendemain"}
                      ).
                    </p>
                  )}
                </div>
              )}

              {status === "UNVERIFIED" && (
                <Link
                  href={lvl.href}
                  className="flex h-12 w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm font-semibold text-slate-200"
                >
                  Compléter ce niveau
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <KycCguNotice />
    </div>
  );
}

