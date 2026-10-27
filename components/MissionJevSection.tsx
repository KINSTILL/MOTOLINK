"use client";

import { useEffect, useState } from "react";
import { Edit3, Loader2 } from "lucide-react";
import {
  isValidJevCategory,
  JEV_CATEGORIES,
  JEV_CATEGORY_META,
  JEV_CGU_ARTICLE_4BIS,
  JevCategory,
} from "@/lib/jev-constants";
import MissionCategoryBadge from "@/components/MissionCategoryBadge";

interface MissionJevSectionProps {
  missionId: string;
  isVendorOwner: boolean;
  initialCategory: string | null;
  initialCategorySource: string | null;
  initialDecisionStatus: string | null;
  jevEnabled: boolean;
}

export default function MissionJevSection({
  missionId,
  isVendorOwner,
  initialCategory,
  initialCategorySource,
  initialDecisionStatus,
  jevEnabled: initialJevEnabled,
}: MissionJevSectionProps) {
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [categorySource, setCategorySource] = useState<string | null>(
    initialCategorySource
  );
  const [decisionStatus, setDecisionStatus] = useState<string | null>(
    initialDecisionStatus || (initialJevEnabled && !initialCategory ? "pending" : "disabled")
  );
  const [jevEnabled, setJevEnabled] = useState(initialJevEnabled);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Polling léger tant que la décision Jev asynchrone est en cours ("pending")
  useEffect(() => {
    if (category || !jevEnabled) return;
    if (
      decisionStatus &&
      decisionStatus !== "pending"
    ) {
      return;
    }

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/missions/${missionId}/jev`);
        if (res.ok) {
          const data = await res.json();
          setJevEnabled(Boolean(data.jevEnabled));
          if (data.category) {
            setCategory(data.category);
            setCategorySource(data.categorySource);
          }
          if (data.latestDecision?.status) {
            setDecisionStatus(data.latestDecision.status);
            if (data.latestDecision.status !== "pending") {
              clearInterval(interval);
            }
          }
        }
      } catch {
        // Ignoré
      }

      if (attempts >= 10) {
        clearInterval(interval);
      }
    }, 350);

    return () => clearInterval(interval);
  }, [missionId, category, decisionStatus, jevEnabled]);

  const handleSelectManualCategory = async (nextCategory: JevCategory) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/missions/${missionId}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: nextCategory }),
      });

      if (res.ok) {
        const data = await res.json();
        setCategory(data.mission.category);
        setCategorySource("manual");
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  // Si disabled et aucune catégorie manuelle : n'affiche aucun état Jev (mais permet la modification manuelle au vendeur)
  const isDisabledWithNoCategory =
    (!jevEnabled || decisionStatus === "disabled") && !category;

  return (
    <div className="space-y-3 border-t border-slate-800 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Catégorie définie (success ou manual) */}
          {isValidJevCategory(category) ? (
            <div className="flex items-center gap-2">
              <MissionCategoryBadge category={category} />
              <span className="text-[11px] text-slate-400">
                ({categorySource === "manual" ? "Modifiée manuellement" : "Indicatif Jev"})
              </span>
            </div>
          ) : isDisabledWithNoCategory ? null : decisionStatus === "pending" ? (
            /* 2. Pending -> Spinner "Classification en cours..." */
            <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Classification en cours...</span>
            </span>
          ) : decisionStatus === "low_confidence" ? (
            /* 3. Low confidence -> "Catégorie non déterminée" (gris) */
            <span className="inline-flex items-center rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-400">
              Catégorie non déterminée
            </span>
          ) : decisionStatus === "timeout" || decisionStatus === "error" ? (
            /* 4. Timeout / error -> "Classification indisponible" (gris très discret) */
            <span className="text-[11px] text-slate-500">
              Classification indisponible
            </span>
          ) : null}
        </div>

        {/* Bouton "Modifier la catégorie" */}
        {isVendorOwner && (
          <button
            type="button"
            onClick={() => setEditing((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 transition active:scale-95"
          >
            <Edit3 className="h-3.5 w-3.5 text-primary" />
            <span>Modifier la catégorie</span>
          </button>
        )}
      </div>

      {/* Sélecteur manuel de catégorie */}
      {editing && isVendorOwner && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-300">
            Choisir manuellement la catégorie du colis :
          </p>
          <div className="grid grid-cols-2 gap-2">
            {JEV_CATEGORIES.map((cat) => {
              const meta = JEV_CATEGORY_META[cat];
              const isSelected = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  disabled={saving}
                  onClick={() => handleSelectManualCategory(cat)}
                  className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition active:scale-95 ${
                    isSelected
                      ? meta.badgeClass
                      : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span>{meta.badgeText}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mention CGU Article 4bis */}
      {(category || editing || (!isDisabledWithNoCategory && decisionStatus)) && (
        <p className="text-[11px] leading-relaxed text-slate-500">
          {JEV_CGU_ARTICLE_4BIS}
        </p>
      )}
    </div>
  );
}

