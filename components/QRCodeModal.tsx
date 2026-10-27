"use client";

import React, { useState } from "react";
import {
  X,
  Download,
  Share2,
  Copy,
  Check,
  QrCode,
  ExternalLink,
} from "lucide-react";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  shopName: string;
  url: string;
  qrCodeUrl?: string;
}

export default function QRCodeModal({
  isOpen,
  onClose,
  slug,
  shopName,
  url,
  qrCodeUrl,
}: QRCodeModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Lien de livraison ${shopName}`,
          text: `Bonjour ! Voici mon lien de livraison personnel MotoLink pour enregistrer votre adresse : ${url}`,
          url,
        });
      } catch {
        // Ignorer l'annulation de partage
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl text-center">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-left">
            <QrCode className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-slate-50">
                QR Code de livraison
              </h2>
              <p className="text-xs text-slate-400">{shopName}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cadre du QR Code */}
        <div className="mx-auto flex aspect-square w-64 items-center justify-center rounded-2xl bg-white p-3 shadow-inner">
          {qrCodeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrCodeUrl}
              alt={`QR Code pour ${url}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
              <QrCode className="h-12 w-12 text-slate-300" />
              <span>Chargement du QR Code...</span>
            </div>
          )}
        </div>

        {/* Lien texte */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300 break-all font-mono">
          {url}
        </div>

        {/* Boutons d'action */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {qrCodeUrl && (
            <a
              href={qrCodeUrl}
              download={`motolink-qr-${slug}.png`}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 active:scale-95"
            >
              <Download className="h-4 w-4" />
              <span>Télécharger</span>
            </a>
          )}

          <button
            type="button"
            onClick={handleShare}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-bold text-white transition hover:bg-primary/90 active:scale-95"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-300" />
                <span>Copié !</span>
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" />
                <span>Partager</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

