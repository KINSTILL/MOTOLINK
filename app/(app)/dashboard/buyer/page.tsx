"use client";

import { useState } from "react";
import { PackageSearch, Search } from "lucide-react";

export default function BuyerDashboardPage() {
  const [showSearch, setShowSearch] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");

  return (
    <div className="space-y-6">
      {/* Titre */}
      <div>
        <h1 className="text-lg font-bold text-slate-50">
          Suivi de mes livraisons
        </h1>
        <p className="text-base text-slate-400">
          Visualisez l&apos;avancement de vos colis en temps réel.
        </p>
      </div>

      {/* Carte d'état vide */}
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-slate-900 p-6 text-center border border-slate-800">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
          <PackageSearch className="h-6 w-6" />
        </div>
        <p className="text-base text-slate-400">
          Vous n&apos;avez aucune livraison en cours
        </p>
      </div>

      {/* Recherche optionnelle par numéro */}
      {showSearch && (
        <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-3">
          <label
            htmlFor="tracking-search"
            className="block text-base font-medium text-slate-50"
          >
            Numéro de mission ou téléphone
          </label>
          <input
            id="tracking-search"
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="Ex: UUID de mission..."
            className="h-14 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-base text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
          />
        </div>
      )}

      {/* Bouton Rechercher un colis par numéro */}
      <button
        type="button"
        onClick={() => setShowSearch((prev) => !prev)}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98]"
      >
        <Search className="h-5 w-5" />
        <span>Rechercher un colis par numéro</span>
      </button>
    </div>
  );
}

