import React from "react";

export const CGU_KYC_ARTICLE =
  "Le badge 'Identité vérifiée' confirme le contrôle de la CNI. Il ne constitue pas une vérification du permis ni une autorisation d'exercer. Le badge 'Membre de syndicat' confirme la fourniture d'une carte. Le vendeur reste libre de demander des documents supplémentaires. MotoLink ne peut être tenu responsable de l'usage de documents falsifiés.";

interface KycBadgesProps {
  idCardVerified: boolean;
  syndicateVerified?: boolean;
  syndicateName?: string | null;
  enrollmentVerified?: boolean;
  showEmpty?: boolean;
}

export function KycBadges({
  idCardVerified,
  syndicateVerified = false,
  syndicateName,
  enrollmentVerified = false,
  showEmpty = false,
}: KycBadgesProps) {
  const hasAny = idCardVerified || syndicateVerified || enrollmentVerified;

  if (!hasAny && !showEmpty) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {idCardVerified && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/15 px-3 py-1 text-xs font-semibold text-success">
          <span>✅ Identité vérifiée</span>
        </span>
      )}

      {syndicateVerified && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
          <span>
            🤝 Membre de syndicat
            {syndicateName ? ` (${syndicateName})` : ""}
          </span>
        </span>
      )}

      {enrollmentVerified && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary/15 px-3 py-1 text-xs font-semibold text-secondary">
          <span>🏛️ Enrôlé</span>
        </span>
      )}

      {!hasAny && showEmpty && (
        <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-400">
          Profil non vérifié
        </span>
      )}
    </div>
  );
}

export function KycCguNotice() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs leading-relaxed text-slate-400">
      <p className="mb-1 font-semibold text-slate-300">
        Article CGU — Vérification KYC :
      </p>
      <p>{CGU_KYC_ARTICLE}</p>
    </div>
  );
}

