"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Package,
  MapPin,
  Phone,
  User,
  DollarSign,
  FileText,
  Flame,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import ArticlePhotoCapture from "@/components/ArticlePhotoCapture";
import {
  MISSION_TYPE_OPTIONS,
  MissionTypeValue,
} from "@/lib/validations/mission";

export interface DraftItem {
  id: string;
  buyerName?: string | null;
  buyerPhone: string;
  address: string;
  description?: string | null;
  price: number;
  type?: string;
  source?: string | null;
  createdAt: string | Date;
}

interface DraftFinalizeModalProps {
  draft: DraftItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (missionId: string) => void;
}

export default function DraftFinalizeModal({
  draft,
  isOpen,
  onClose,
  onSuccess,
}: DraftFinalizeModalProps) {
  const router = useRouter();

  const [buyerName, setBuyerName] = useState(draft?.buyerName || "");
  const [buyerPhone, setBuyerPhone] = useState(draft?.buyerPhone || "");
  const [address, setAddress] = useState(draft?.address || "");
  const [description, setDescription] = useState(draft?.description || "");
  const [price, setPrice] = useState(
    draft?.price && Number(draft.price) > 0 ? String(draft.price) : ""
  );
  const [missionType, setMissionType] = useState<MissionTypeValue>(
    (draft?.type as MissionTypeValue) || "PARCEL"
  );
  const [gasCertified, setGasCertified] = useState(false);
  const [articlePhotoUrls, setArticlePhotoUrls] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronisation lors de l'ouverture
  React.useEffect(() => {
    if (draft) {
      setBuyerName(draft.buyerName || "");
      setBuyerPhone(draft.buyerPhone || "");
      setAddress(draft.address || "");
      setDescription(draft.description || "");
      setPrice(
        draft.price && Number(draft.price) > 0 ? String(draft.price) : ""
      );
      setMissionType((draft.type as MissionTypeValue) || "PARCEL");
      setArticlePhotoUrls([]);
      setError(null);
    }
  }, [draft]);

  if (!isOpen || !draft) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (articlePhotoUrls.length === 0) {
      setError("Au moins 1 photo de l'article est obligatoire pour finaliser la mission.");
      return;
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      setError("Veuillez indiquer un prix de livraison valide supérieur à 0 FCFA.");
      return;
    }

    if (missionType === "GAS" && !gasCertified) {
      setError("Veuillez certifier la bonbonne de gaz pour le transport.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/missions/${draft.id}/finalize-draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: buyerName.trim() || undefined,
          buyerPhone: buyerPhone.trim(),
          address: address.trim(),
          description: description.trim() || undefined,
          price: numPrice,
          type: missionType,
          gasCertified: missionType === "GAS" ? gasCertified : false,
          articlePhotoUrls,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de finaliser la mission.");
        setSubmitting(false);
        return;
      }

      if (onSuccess) {
        onSuccess(draft.id);
      } else {
        router.push(`/missions/${draft.id}?created=1`);
      }
      onClose();
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-50">
                Finaliser la mission de livraison
              </h2>
              <p className="text-xs text-slate-400">
                Ajoutez les photos et confirmez le tarif
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

        {error && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-danger/40 bg-danger/10 p-3.5 text-xs font-semibold text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Photos obligatoires de l'article */}
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">
                Photos de l&apos;article (1 à 2 photos){" "}
                <span className="text-danger">*</span>
              </label>
              <span className="text-[11px] text-primary font-semibold">Obligatoire</span>
            </div>
            <ArticlePhotoCapture
              photos={articlePhotoUrls}
              onChange={setArticlePhotoUrls}
            />
          </div>

          {/* Type de course */}
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-slate-300">
              Type de marchandise <span className="text-danger">*</span>
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {MISSION_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-xs font-semibold transition ${
                    missionType === opt.value
                      ? "border-primary bg-primary/15 text-slate-50"
                      : "border-slate-800 bg-slate-950 text-slate-300"
                  }`}
                >
                  <span>{opt.label}</span>
                  <input
                    type="radio"
                    name="modalMissionType"
                    value={opt.value}
                    checked={missionType === opt.value}
                    onChange={() => {
                      setMissionType(opt.value);
                      if (opt.value !== "GAS") setGasCertified(false);
                    }}
                    className="accent-primary"
                  />
                </label>
              ))}
            </div>
          </fieldset>

          {/* Certification gaz */}
          {missionType === "GAS" && (
            <div className="rounded-xl border border-secondary/40 bg-secondary/10 p-3 space-y-1 text-xs">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gasCertified}
                  onChange={(e) => setGasCertified(e.target.checked)}
                  className="mt-0.5 accent-secondary"
                />
                <span className="text-slate-200 font-medium leading-relaxed">
                  <Flame className="inline h-3.5 w-3.5 text-secondary mr-1" />
                  Je certifie que la bonbonne est en bon état et sécurisée pour le transport
                </span>
              </label>
            </div>
          )}

          {/* Prix FCFA */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-primary" />
              <span>Prix de livraison proposé (FCFA) <span className="text-danger">*</span></span>
            </label>
            <input
              type="number"
              min={1}
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Ex: 1500"
              className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Nom du client */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-primary" />
              <span>Nom du destinataire</span>
            </label>
            <input
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Ex: Paul"
              className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Téléphone */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-primary" />
              <span>Téléphone du destinataire <span className="text-danger">*</span></span>
            </label>
            <input
              type="tel"
              required
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Adresse */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span>Adresse & Quartier de livraison <span className="text-danger">*</span></span>
            </label>
            <textarea
              rows={2}
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <span>Description du colis</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Sac d'habits"
              className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Boutons */}
          <div className="flex gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-12 flex-1 rounded-xl border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-12 flex-1 rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary/90 flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Créer la mission</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

