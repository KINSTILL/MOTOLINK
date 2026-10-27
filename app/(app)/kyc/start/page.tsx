import Link from "next/link";
import { KycCguNotice } from "@/components/KycBadges";
import { ArrowLeft, Award, CreditCard, Landmark, ShieldCheck } from "lucide-react";

export default function KycStartPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/driver"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Retour</span>
        </Link>

        <Link
          href="/kyc/status"
          className="text-sm font-semibold text-primary"
        >
          Voir mon statut KYC
        </Link>
      </div>

      <div className="space-y-2">
        <h1 className="text-lg font-bold text-slate-50">
          Vérification de votre profil livreur
        </h1>
        <p className="text-base text-slate-400">
          Chez MotoLink, le permis n&apos;est pas exigé : votre CNI suffit pour démarrer. Ajoutez votre carte de syndicat et votre enrôlement pour rassurer les vendeurs.
        </p>
      </div>

      {/* Les 3 niveaux expliqués */}
      <div className="space-y-3">
        {/* Niveau 1 */}
        <div className="rounded-2xl bg-slate-900 p-4 border border-primary/40 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CreditCard className="h-5 w-5 text-primary" />
              <span className="text-base font-bold text-slate-50">
                Niveau 1 : CNI + Selfie
              </span>
            </div>
            <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Obligatoire
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Photo recto et verso de votre CNI + un selfie en tenant votre CNI. Débloque l&apos;acceptation des courses et le badge{" "}
            <strong className="text-slate-200">✅ Identité vérifiée</strong>.
          </p>
        </div>

        {/* Niveau 2 */}
        <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Award className="h-5 w-5 text-secondary" />
              <span className="text-base font-bold text-slate-50">
                Niveau 2 : Carte de syndicat
              </span>
            </div>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">
              Optionnel
            </span>
          </div>
          <p className="text-sm text-slate-400">
            SYNPROCOMON, SYPROCOMON ou autre syndicat reconnu. Débloque le badge{" "}
            <strong className="text-slate-200">🤝 Membre de syndicat</strong>.
          </p>
        </div>

        {/* Niveau 3 */}
        <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Landmark className="h-5 w-5 text-success" />
              <span className="text-base font-bold text-slate-50">
                Niveau 3 : Enrôlement CUD / Yaoundé
              </span>
            </div>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">
              Optionnel
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Attestation municipale d&apos;enrôlement. Débloque le badge{" "}
            <strong className="text-slate-200">🏛️ Enrôlé</strong>.
          </p>
        </div>
      </div>

      {/* Article CGU KYC */}
      <KycCguNotice />

      {/* Bouton principal Niveau 1 + liens Niveaux 2 et 3 */}
      <div className="space-y-3 pt-2">
        <Link
          href="/kyc/id-card"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98]"
        >
          <ShieldCheck className="h-5 w-5" />
          <span>Téléverser ma CNI</span>
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/kyc/syndicate"
            className="flex h-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm font-semibold text-slate-200"
          >
            Niveau 2 : Syndicat
          </Link>
          <Link
            href="/kyc/enrollment"
            className="flex h-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm font-semibold text-slate-200"
          >
            Niveau 3 : Enrôlement
          </Link>
        </div>
      </div>
    </div>
  );
}

