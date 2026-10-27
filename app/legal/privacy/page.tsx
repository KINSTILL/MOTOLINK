import Link from "next/link";
import Footer from "@/components/Footer";
import { ArrowLeft, Bike, Shield } from "lucide-react";

const SECTIONS = [
  {
    title: "1. Données collectées",
    body: "Nous collectons uniquement les données nécessaires au constat de livraison : numéro de téléphone, nom, position GPS lors des jalons et de la remise, photo de l'article, photo du colis remis, signature manuscrite de l'acheteur, empreinte technique de l'appareil (device fingerprint) et documents KYC des livreurs (CNI, carte de syndicat, attestation d'enrôlement CUD).",
  },
  {
    title: "2. Finalités du traitement",
    body: "Vos données sont utilisées exclusivement pour : générer le constat de livraison scellé, permettre la vérification publique d'authenticité (/verify/{hash}), tenir le journal d'audit immuable et gérer l'abonnement logiciel hebdomadaire ou mensuel.",
  },
  {
    title: "3. Durée de conservation",
    body: "Les preuves de livraison scellées sont conservées pendant 5 ans. Les journaux techniques et d'audit sont conservés pendant 1 an. Les documents KYC des livreurs sont conservés pendant 2 ans.",
  },
  {
    title: "4. Vos droits",
    body: "Conformément à la loi camerounaise n°2024/017 sur la protection des données à caractère personnel, vous disposez d'un droit d'accès, de rectification, de suppression et de portabilité de vos données depuis votre profil ou sur simple demande.",
  },
  {
    title: "5. Sécurité des données",
    body: "Les données sont protégées par chiffrement en transit et au repos, journal d'audit chaîné en SHA-256 (append-only), ancrage temporel externe RFC 3161 (FreeTSA) et stockage privé sécurisé sur Cloudflare R2 / S3.",
  },
  {
    title: "6. Contact DPO (Délégué à la Protection des Données)",
    body: "Pour toute question ou demande relative à vos données personnelles, vous pouvez contacter notre DPO à l'adresse : dpo@motolink.cm.",
  },
  {
    title: "7. Base légale",
    body: "Le traitement de vos données repose sur votre consentement explicite lors de l'inscription et sur l'exécution du contrat d'utilisation de l'outil technique MotoLink.",
  },
];

export default function LegalPrivacyPage() {
  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-6 text-slate-50">
      <div className="mx-auto max-w-md space-y-6">
        <header className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <Bike className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-extrabold">
                Moto<span className="text-secondary">Link</span>
              </span>
              <p className="text-xs font-semibold text-slate-400">
                Politique de confidentialité
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-300 transition active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Accueil</span>
          </Link>
        </header>

        <section className="rounded-2xl border border-primary/40 bg-primary/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-base font-bold text-primary">
            <Shield className="h-5 w-5" />
            <h1>Politique de Confidentialité</h1>
          </div>
          <p className="text-base leading-relaxed text-slate-200">
            Protection des données personnelles conforme à la loi camerounaise
            n°2024/017. MotoLink est un constat de fait, pas une garantie de
            paiement ou de qualité.
          </p>
        </section>

        <div className="space-y-4">
          {SECTIONS.map((sec) => (
            <article
              key={sec.title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2"
            >
              <h2 className="text-base font-extrabold text-primary">
                {sec.title}
              </h2>
              <p className="text-base leading-relaxed text-slate-100">
                {sec.body}
              </p>
            </article>
          ))}
        </div>

        <Footer />
      </div>
    </main>
  );
}

