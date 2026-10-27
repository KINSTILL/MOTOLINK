import Link from "next/link";
import Footer from "@/components/Footer";
import {
  Bike,
  CheckCircle2,
  Clock,
  Coins,
  FileCheck2,
  Globe2,
  MapPin,
  PenTool,
  Radio,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col justify-between px-4 pb-8 pt-4">
      {/* En-tête mobile */}
      <header className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
            <Bike className="h-6 w-6" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-white">
              Moto<span className="text-secondary">Link</span>
            </span>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse" />
              <span>En ligne • Douala (WAT)</span>
            </div>
          </div>
        </div>

        <Link
          href="/login"
          className="rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary transition active:scale-95"
        >
          Connexion
        </Link>
      </header>

      {/* Contenu principal Hero Mobile */}
      <section className="my-auto flex flex-col gap-6 py-6">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Certificat & Traçabilité Temps Réel
          </div>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white">
            MotoLink — <br />
            <span className="bg-gradient-to-r from-primary via-blue-400 to-secondary bg-clip-text text-transparent">
              La preuve de livraison opposable
            </span>
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Sécurisez chaque course avec horodatage certifié, géolocalisation
            précise, signature client et encaissement instantané en Francs CFA.
          </p>
        </div>

        {/* Configuration active */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe2 className="h-3.5 w-3.5 text-primary" />
              <span>Fuseau horaire</span>
            </div>
            <p className="text-sm font-semibold text-white">Africa/Douala</p>
          </div>

          <div className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Coins className="h-3.5 w-3.5 text-secondary" />
              <span>Devise locale</span>
            </div>
            <p className="text-sm font-semibold text-white">FCFA (XAF)</p>
          </div>
        </div>

        {/* Piliers fonctionnels */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Preuves opposables intégrées
          </h2>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <PenTool className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Signature tactile sur écran</p>
                <p className="text-xs text-muted-foreground">react-signature-canvas prêt</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Cartographie & Coordonnées GPS</p>
                <p className="text-xs text-muted-foreground">Leaflet & React-Leaflet configurés</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
                <Radio className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Télémétrie en temps réel</p>
                <p className="text-xs text-muted-foreground">Socket.io-client opérationnel</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
                <Smartphone className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Mode Hors-ligne & PWA</p>
                <p className="text-xs text-muted-foreground">Serwist (@serwist/next) & Manifest</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
          </div>
        </div>

        {/* Boutons d'action mobile */}
        <div className="flex flex-col gap-2.5 pt-2">
          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98]"
          >
            <FileCheck2 className="h-5 w-5" />
            Commencer / Se connecter
          </Link>
          <Link
            href="/dashboard"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 font-semibold text-white transition active:scale-[0.98]"
          >
            <Clock className="h-5 w-5 text-secondary" />
            Accéder à mon tableau de bord
          </Link>
        </div>
      </section>

      {/* Pied de page safe-area */}
      <Footer />
    </main>
  );
}

