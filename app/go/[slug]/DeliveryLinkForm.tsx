"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Package,
  Phone,
  MapPin,
  User,
  FileText,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { normalizePhone } from "@/lib/utils";

interface DeliveryLinkFormProps {
  slug: string;
  shopName: string;
}

export default function DeliveryLinkForm({ slug, shopName }: DeliveryLinkFormProps) {
  const [buyerName, setBuyerName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = normalizePhone(phoneRaw);
    if (!/^\+237\d{9}$/.test(cleanPhone)) {
      setError("Veuillez saisir un numéro de téléphone camerounais valide (ex: 699112233).");
      return;
    }

    if (address.trim().length < 10) {
      setError("Veuillez préciser votre quartier et repère (au moins 10 caractères).");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/public/missions/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          buyerName: buyerName.trim() || undefined,
          buyerPhone: cleanPhone,
          address: address.trim(),
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Une erreur est survenue lors de l'enregistrement.");
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Erreur réseau. Veuillez vérifier votre connexion et réessayer.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-3xl border border-success/30 bg-slate-900/90 p-8 text-center space-y-4 shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success/15 text-success">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-50">
            Informations enregistrées !
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Merci ! Votre commande a été transmise à <strong>{shopName}</strong>. Le vendeur va préparer votre colis et assigner un livreur de confiance.
          </p>
        </div>
        <div className="pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>Livraison sécurisée avec traçabilité MotoLink</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4 shadow-xl backdrop-blur-sm">
      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-danger/40 bg-danger/10 p-3.5 text-xs font-semibold text-danger">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Nom */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-primary" />
          <span>Votre nom <span className="text-slate-500 font-normal">(optionnel)</span></span>
        </label>
        <input
          type="text"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          placeholder="Ex: Jean-Paul M."
          className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
        />
      </div>

      {/* 2. Téléphone */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-primary" />
          <span>Votre numéro WhatsApp / Téléphone <span className="text-danger">*</span></span>
        </label>
        <input
          type="tel"
          required
          value={phoneRaw}
          onChange={(e) => setPhoneRaw(e.target.value)}
          placeholder="Ex: 699 11 22 33 ou +237..."
          className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
        />
        <p className="text-[11px] text-slate-400">
          Le livreur utilisera ce numéro pour vous coordonner à l&apos;arrivée.
        </p>
      </div>

      {/* 3. Quartier / Adresse */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span>Quartier & Précisions d&apos;adresse <span className="text-danger">*</span></span>
        </label>
        <textarea
          rows={3}
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ex: Douala, Bonamoussadi, Carrefour du Marché, face pharmacie..."
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
        />
      </div>

      {/* 4. Description rapide */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <span>Description de la commande <span className="text-slate-500 font-normal">(optionnel)</span></span>
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Robe en pagne bleue taille L"
          className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Enregistrement...</span>
          </>
        ) : (
          <span>Confirmer mes informations</span>
        )}
      </button>

      <div className="pt-2 text-center text-xs text-slate-500">
        Vos données restent confidentielles et ne sont transmises qu&apos;au livreur assigné.
      </div>
    </form>
  );
}

