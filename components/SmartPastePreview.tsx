"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  User,
  Phone,
  MapPin,
  FileText,
  DollarSign,
  ArrowRight,
  Loader2,
} from "lucide-react";

export interface SmartPasteExtractedData {
  draftId?: string;
  buyerName?: string | null;
  buyerPhone?: string | null;
  address?: string | null;
  description?: string | null;
  price?: number | null;
  confidence?: number;
  status?: "success" | "partial" | "failed";
}

interface SmartPastePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  data: SmartPasteExtractedData;
  onSuccess?: (draftId: string) => void;
}

export default function SmartPastePreview({
  isOpen,
  onClose,
  data,
  onSuccess,
}: SmartPastePreviewProps) {
  const router = useRouter();

  const [buyerName, setBuyerName] = useState(data.buyerName || "");
  const [buyerPhone, setBuyerPhone] = useState(data.buyerPhone || "");
  const [address, setAddress] = useState(data.address || "");
  const [description, setDescription] = useState(data.description || "");
  const [price, setPrice] = useState(data.price ? String(data.price) : "");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBuyerName(data.buyerName || "");
    setBuyerPhone(data.buyerPhone || "");
    setAddress(data.address || "");
    setDescription(data.description || "");
    setPrice(data.price ? String(data.price) : "");
  }, [data]);

  if (!isOpen) return null;

  const confidence = data.confidence ?? 0;
  let confidenceBadge = {
    label: "❌ Non extrait",
    bg: "bg-danger/15 text-danger border-danger/30",
    icon: XCircle,
  };

  if (confidence >= 0.7) {
    confidenceBadge = {
      label: "✅ Confiance élevée",
      bg: "bg-success/15 text-success border-success/30",
      icon: CheckCircle2,
    };
  } else if (confidence >= 0.4) {
    confidenceBadge = {
      label: "⚠️ À vérifier",
      bg: "bg-warning/15 text-warning border-warning/30",
      icon: AlertTriangle,
    };
  }

  const handleProceed = async () => {
    setSaving(true);
    try {
      // Si nous avons un draftId, nous redirigeons vers la page de finalisation du brouillon
      if (data.draftId) {
        if (onSuccess) onSuccess(data.draftId);
        router.push(`/missions/drafts`);
      } else {
        router.push("/missions/drafts");
      }
    } finally {
      setSaving(false);
      onClose();
    }
  };

  const BadgeIcon = confidenceBadge.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-50">
                Informations extraites par Jev
              </h2>
              <p className="text-xs text-slate-400">
                Vérifiez ou complétez avant de finaliser
              </p>
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

        {/* Badge d'indice de confiance */}
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
          <span className="text-xs text-slate-400">Indice de confiance IA :</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-bold ${confidenceBadge.bg}`}
          >
            <BadgeIcon className="h-3.5 w-3.5" />
            <span>{confidenceBadge.label} ({Math.round(confidence * 100)}%)</span>
          </span>
        </div>

        {/* Champs pré-remplis éditables */}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {/* Nom */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-primary" />
              <span>Nom du client</span>
            </label>
            <input
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Nom ou prénom"
              className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Téléphone */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-primary" />
              <span>Téléphone du destinataire</span>
            </label>
            <input
              type="tel"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="+237..."
              className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Adresse */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span>Quartier & Adresse de livraison</span>
            </label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Quartier, repère..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Prix & Description */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-primary" />
                <span>Prix (FCFA)</span>
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ex: 2000"
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>Description</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Colis..."
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-xl border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleProceed}
            disabled={saving}
            className="h-12 flex-1 rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary/90 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span>Créer le brouillon</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

