"use client";

import { useState, useEffect } from "react";

interface CarnetUserShape {
  carnetVisible?: boolean;
  driverSlug?: string | null;
  carnetZones?: string | null;
}

export function CarnetSettingsBlock() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [zones, setZones] = useState("");

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => {
        // /api/users/me renvoie { user: {...} } ; on tolère aussi la forme racine.
        const src: CarnetUserShape = d?.user ?? d ?? {};
        setVisible(src.carnetVisible ?? false);
        setSlug(src.driverSlug ?? null);
        setZones(src.carnetZones ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/users/me/carnet-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.carnet) {
        setVisible(data.carnet.carnetVisible);
        setSlug(data.carnet.driverSlug);
        setZones(data.carnet.carnetZones ?? "");
      }
    } finally {
      setSaving(false);
    }
  };

  const shareUrl = slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/d/${slug}`
    : "";

  if (loading) return <div className="p-4 text-slate-400">Chargement...</div>;

  return (
    <div className="bg-slate-900 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Carnet de bord public</div>
          <div className="text-sm text-slate-400">
            Un profil partageable pour rassurer les vendeurs.
          </div>
        </div>
        <button
          type="button"
          onClick={() => save({ carnetVisible: !visible })}
          disabled={saving}
          aria-label="Activer le carnet de bord"
          className={`w-12 h-6 rounded-full transition ${
            visible ? "bg-blue-600" : "bg-slate-700"
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full transition transform ${
              visible ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {visible && slug && (
        <div className="space-y-2">
          <div className="text-sm text-slate-400">Votre lien :</div>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-slate-800 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="px-3 py-2 bg-slate-800 rounded-lg text-sm"
            >
              Copier
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              window.open(
                `https://wa.me/?text=${encodeURIComponent(
                  "Voici mon carnet de bord MotoLink : " + shareUrl
                )}`
              )
            }
            className="w-full py-2 bg-green-700 rounded-lg text-sm font-medium"
          >
            Partager sur WhatsApp
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-blue-400 underline"
          >
            Voir mon carnet
          </a>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm text-slate-400">
          Zones de travail (optionnel)
        </label>
        <input
          value={zones}
          onChange={(e) => setZones(e.target.value)}
          onBlur={() => save({ carnetZones: zones })}
          placeholder="Ex : Akwa, Bonapriso, Deido"
          className="w-full bg-slate-800 rounded-lg px-3 py-2 text-sm"
          maxLength={200}
        />
      </div>
    </div>
  );
}
