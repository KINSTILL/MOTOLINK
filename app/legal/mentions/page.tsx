import Link from "next/link";
import Footer from "@/components/Footer";
import { ArrowLeft, Bike, Building2 } from "lucide-react";

const MENTIONS = [
  {
    title: "1. Éditeur de la plateforme",
    body: "MotoLink Cameroun (outil technique de constat numérique de livraison). Siège : Akwa, Douala, Cameroun. Contact : contact@motolink.cm — DPO : dpo@motolink.cm.",
  },
  {
    title: "2. Directeur de publication",
    body: "Direction Générale MotoLink Cameroun (Douala).",
  },
  {
    title: "3. Hébergeur technique",
    body: "Application hébergée par Vercel Inc. (440 N Barranca Ave #4133, Covina, CA 91723) et stockage sécurisé opéré via Cloudflare Inc. (Cloudflare R2).",
  },
  {
    title: "4. Autorité de protection des données",
    body: "Agence Nationale des Technologies de l'Information et de la Communication (ANTIC) — République du Cameroun (www.antic.cm).",
  },
  {
    title: "5. Nature du service",
    body: "MotoLink est un hébergeur et outil technique au sens de la loi camerounaise n°2010/012. MotoLink est un constat de fait, pas une garantie de paiement ou de qualité.",
  },
];

export default function LegalMentionsPage() {
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
                Mentions légales
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
            <Building2 className="h-5 w-5" />
            <h1>Mentions Légales</h1>
          </div>
          <p className="text-base leading-relaxed text-slate-200">
            Informations légales et réglementaires relatives à l&apos;outil
            technique MotoLink.
          </p>
        </section>

        <div className="space-y-4">
          {MENTIONS.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2"
            >
              <h2 className="text-base font-extrabold text-primary">
                {item.title}
              </h2>
              <p className="text-base leading-relaxed text-slate-100">
                {item.body}
              </p>
            </article>
          ))}
        </div>

        <Footer />
      </div>
    </main>
  );
}

