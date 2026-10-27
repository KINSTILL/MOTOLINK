"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDoualaDateTime } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

interface PendingKycDoc {
  id: string;
  type: "ID_CARD" | "SYNDICATE_CARD" | "ENROLLMENT_CERT";
  status: string;
  syndicateName?: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    phone: string;
    kycStatus: string;
    verified: boolean;
  };
  frontUrl: string;
  backUrl?: string | null;
  selfieUrl?: string | null;
}

const DOC_TYPE_LABELS: Record<PendingKycDoc["type"], string> = {
  ID_CARD: "Niveau 1 : CNI (Recto / Verso / Selfie)",
  SYNDICATE_CARD: "Niveau 2 : Carte de syndicat",
  ENROLLMENT_CERT: "Niveau 3 : Attestation d'enrôlement CUD/Yaoundé",
};

export default function AdminKycPage() {
  const [docs, setDocs] = useState<PendingKycDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/kyc/pending");
      const data = await res.json();
      setDocs(data.documents || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleValidate = async (docId: string) => {
    setProcessingId(docId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/kyc/${docId}/validate`, {
        method: "PATCH",
      });
      if (res.ok) {
        setFeedback("Dossier validé ! Statut VERIFIED + AuditLog + Push envoyés.");
        setDocs((prev) => prev.filter((d) => d.id !== docId));
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (docId: string) => {
    if (rejectReason.trim().length < 3) return;
    setProcessingId(docId);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/kyc/${docId}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });

      if (res.ok) {
        setFeedback("Dossier rejeté avec motif enregistré dans AuditLog.");
        setRejectingId(null);
        setRejectReason("");
        setDocs((prev) => prev.filter((d) => d.id !== docId));
      }
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-6 text-slate-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold">
                Administration KYC • MotoLink
              </h1>
              <p className="text-xs text-slate-400">
                URLs signées temporaires (expiration 1h) • Chiffrement AES-256-GCM au repos
              </p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-300"
          >
            Tableau de bord
          </Link>
        </header>

        {feedback && (
          <div className="rounded-2xl border border-success/40 bg-success/10 p-4 text-sm font-semibold text-success">
            {feedback}
          </div>
        )}

        {loading ? (
          <div className="flex py-16 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-2xl bg-slate-900 p-8 text-center border border-slate-800 space-y-2">
            <Clock className="mx-auto h-8 w-8 text-slate-500" />
            <p className="text-base font-medium text-slate-300">
              Aucun dossier KYC en attente de vérification.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="rounded-2xl bg-slate-900 p-5 border border-slate-800 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {DOC_TYPE_LABELS[doc.type]}
                      {doc.syndicateName ? ` • ${doc.syndicateName}` : ""}
                    </span>
                    <h2 className="text-base font-bold text-slate-50">
                      Livreur : {doc.user.name || "Sans nom"} ({doc.user.phone})
                    </h2>
                    <p className="text-xs text-slate-400">
                      Soumis le {formatDoualaDateTime(doc.createdAt)}
                    </p>
                  </div>

                  <Link
                    href={`/drivers/${doc.user.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-primary"
                  >
                    <span>Profil public</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {/* Aperçu des documents via URLs signées 1h */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-400">
                      {doc.type === "ID_CARD" ? "CNI Recto" : "Document Recto"}
                    </p>
                    <a
                      href={doc.frontUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={doc.frontUrl}
                        alt="Recto"
                        className="h-40 w-full object-cover"
                      />
                    </a>
                  </div>

                  {doc.backUrl && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-400">
                        CNI Verso
                      </p>
                      <a
                        href={doc.backUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={doc.backUrl}
                          alt="Verso"
                          className="h-40 w-full object-cover"
                        />
                      </a>
                    </div>
                  )}

                  {doc.selfieUrl && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-400">
                        Selfie avec CNI
                      </p>
                      <a
                        href={doc.selfieUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={doc.selfieUrl}
                          alt="Selfie"
                          className="h-40 w-full object-cover"
                        />
                      </a>
                    </div>
                  )}
                </div>

                {/* Zone de motif de rejet obligatoire */}
                {rejectingId === doc.id && (
                  <div className="space-y-3 rounded-xl border border-danger/40 bg-slate-950 p-4">
                    <label className="block text-sm font-semibold text-danger">
                      Motif du rejet (obligatoire) *
                    </label>
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Ex: Photo floue, CNI expirée, visage non visible..."
                      className="h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-50 focus:border-danger focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        className="h-11 flex-1 rounded-xl border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-300"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        disabled={
                          rejectReason.trim().length < 3 ||
                          processingId === doc.id
                        }
                        onClick={() => handleReject(doc.id)}
                        className="h-11 flex-1 rounded-xl bg-danger text-xs font-semibold text-white disabled:opacity-40"
                      >
                        Confirmer le rejet
                      </button>
                    </div>
                  </div>
                )}

                {/* Boutons Valider / Rejeter */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    disabled={processingId === doc.id}
                    onClick={() => handleValidate(doc.id)}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
                  >
                    {processingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span>Valider</span>
                  </button>

                  <button
                    type="button"
                    disabled={processingId === doc.id}
                    onClick={() => setRejectingId(doc.id)}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-danger/40 bg-danger/15 px-4 text-sm font-semibold text-danger transition active:scale-95 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Rejeter</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
          <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
          <span>
            Les documents originaux ne sont jamais exposés publiquement. Seuls les badges validés sont visibles par les vendeurs et clients.
          </span>
        </div>
      </div>
    </main>
  );
}

