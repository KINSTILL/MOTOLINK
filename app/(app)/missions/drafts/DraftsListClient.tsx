"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  MapPin,
  Phone,
  User,
  Calendar,
  Sparkles,
  Link as LinkIcon,
  PlusCircle,
  ArrowRight,
  Clock,
} from "lucide-react";
import DraftFinalizeModal, { DraftItem } from "@/components/DraftFinalizeModal";
import { formatDoualaDateTime } from "@/lib/utils";

interface DraftsListClientProps {
  initialDrafts: DraftItem[];
}

export default function DraftsListClient({ initialDrafts }: DraftsListClientProps) {
  const [drafts, setDrafts] = useState<DraftItem[]>(initialDrafts);
  const [selectedDraft, setSelectedDraft] = useState<DraftItem | null>(null);

  const handleFinalized = (missionId: string) => {
    // Retirer le brouillon de la liste
    setDrafts((prev) => prev.filter((d) => d.id !== missionId));
  };

  const getSourceBadge = (source?: string | null) => {
    if (source === "link") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
          <LinkIcon className="h-3 w-3" />
          <span>Via lien de livraison</span>
        </span>
      );
    }
    if (source === "smart_paste") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2.5 py-0.5 text-xs font-semibold text-purple-400">
          <Sparkles className="h-3 w-3" />
          <span>Via copier-coller</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
        <span>Manuel</span>
      </span>
    );
  };

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
          <FileText className="h-8 w-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-100">
            Aucun brouillon en attente
          </h2>
          <p className="text-xs text-slate-400 max-w-sm">
            Partagez votre lien de livraison personnel ou collez un message WhatsApp pour recevoir des brouillons pré-remplis.
          </p>
        </div>
        <Link
          href="/missions/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition active:scale-95"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Créer une mission</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.map((draft) => (
        <div
          key={draft.id}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-4 transition hover:border-slate-700 space-y-3"
        >
          {/* Ligne 1 : Source badge + Date */}
          <div className="flex items-center justify-between gap-2">
            {getSourceBadge(draft.source)}
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="h-3 w-3" />
              <span>{formatDoualaDateTime(draft.createdAt)}</span>
            </span>
          </div>

          {/* Ligne 2 : Destinataire & Coordonnées */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-bold text-slate-100">
                {draft.buyerName || "Destinataire à préciser"}
              </span>
              <span className="text-xs text-slate-400">({draft.buyerPhone})</span>
            </div>

            <div className="flex items-start gap-2 text-xs text-slate-300">
              <MapPin className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
              <span className="line-clamp-2">{draft.address}</span>
            </div>

            {draft.description && (
              <p className="text-xs text-slate-400 italic pt-0.5 pl-6">
                &ldquo;{draft.description}&rdquo;
              </p>
            )}
          </div>

          {/* Ligne 3 : Bouton d'action */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              Expire après 7 jours
            </span>

            <button
              type="button"
              onClick={() => setSelectedDraft(draft)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-white transition active:scale-95 hover:bg-primary/90"
            >
              <span>Finaliser</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}

      {/* Modale de finalisation */}
      {selectedDraft && (
        <DraftFinalizeModal
          draft={selectedDraft}
          isOpen={Boolean(selectedDraft)}
          onClose={() => setSelectedDraft(null)}
          onSuccess={handleFinalized}
        />
      )}
    </div>
  );
}

