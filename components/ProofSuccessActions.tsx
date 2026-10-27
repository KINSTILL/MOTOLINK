"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, ExternalLink, Share2 } from "lucide-react";

interface ProofSuccessActionsProps {
  missionId: string;
  pdfUrl: string;
  proofHash: string;
  buyerPhone: string;
}

export default function ProofSuccessActions({
  missionId,
  pdfUrl,
  proofHash,
  buyerPhone,
}: ProofSuccessActionsProps) {
  const [copied, setCopied] = useState(false);

  const getVerifyUrl = () => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/verify/${proofHash}`;
    }
    return `/verify/${proofHash}`;
  };

  const handleCopyVerifyLink = async () => {
    try {
      await navigator.clipboard.writeText(getVerifyUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignoré
    }
  };

  const handleShareWhatsApp = () => {
    const verifyUrl = getVerifyUrl();
    const text = `✅ Livraison MotoLink scellée avec preuve certifiée SHA-256.\nVérifiez l'authenticité du certificat : ${verifyUrl}`;
    const phoneDigits = buyerPhone.replace(/\D/g, "");
    const waUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-3">
      {/* Bouton Télécharger PDF */}
      <a
        href={pdfUrl}
        download={`preuve-motolink-${missionId.slice(0, 8)}.pdf`}
        target="_blank"
        rel="noreferrer"
        onClick={() => {
          void fetch(`/api/proofs/${proofHash}/export`, {
            method: "POST",
          }).catch(() => {});
        }}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98]"
      >
        <Download className="h-5 w-5" />
        <span>Télécharger PDF</span>
      </a>

      {/* Bouton Partager WhatsApp */}
      <button
        type="button"
        onClick={handleShareWhatsApp}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-success px-4 text-base font-semibold text-white shadow-lg shadow-success/25 transition active:scale-[0.98]"
      >
        <Share2 className="h-5 w-5" />
        <span>Partager WhatsApp</span>
      </button>

      {/* Bouton Copier lien vérification */}
      <button
        type="button"
        onClick={handleCopyVerifyLink}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-base font-semibold text-slate-50 transition active:scale-[0.98]"
      >
        {copied ? (
          <>
            <Check className="h-5 w-5 text-success" />
            <span className="text-success">Lien de vérification copié !</span>
          </>
        ) : (
          <>
            <Copy className="h-5 w-5 text-primary" />
            <span>Copier lien vérification</span>
          </>
        )}
      </button>

      {/* Lien direct vers la page publique /verify/[hash] */}
      <Link
        href={`/verify/${proofHash}`}
        className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm font-medium text-slate-300 transition active:scale-[0.98]"
      >
        <span>Ouvrir la page de vérification publique</span>
        <ExternalLink className="h-4 w-4 text-primary" />
      </Link>
    </div>
  );
}

