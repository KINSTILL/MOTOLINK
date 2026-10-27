import Link from "next/link";
import Footer from "@/components/Footer";
import { ArrowLeft, Bike, Scale } from "lucide-react";

const ARTICLES = [
  {
    title: "PRÉAMBULE",
    body: "MotoLink est un outil technique de constat de livraison de marchandises. La plateforme n'est ni vendeur, ni transporteur, ni intermédiaire financier. Les contrats de vente et de livraison sont conclus exclusivement entre les utilisateurs.",
  },
  {
    title: "ARTICLE 1 — OBJET",
    body: "MotoLink fournit un outil numérique permettant aux vendeurs, livreurs et acheteurs de constater la remise d'un colis, avec horodatage, photographie, signature et ancrage temporel externe.",
  },
  {
    title: "ARTICLE 2 — RÔLE DE LA PLATEFORME",
    body: "MotoLink est un hébergeur technique au sens de la loi camerounaise n°2010/012. La plateforme ne modère pas les contenus, ne lit pas les messages, ne valide pas les preuves, ne sélectionne pas les livreurs, et ne touche jamais aux fonds.",
  },
  {
    title: "ARTICLE 3 — PREUVE DE LIVRAISON",
    body: "La preuve de livraison est un constat de fait généré automatiquement à partir des données fournies par les utilisateurs (photo, signature, position GPS). Elle est horodatée par le serveur MotoLink et, lorsque disponible, ancrée chez une autorité de datation externe (FreeTSA). Le hash SHA-256 affiché permet à toute partie de vérifier l'intégrité de la preuve via /verify/{hash}.",
  },
  {
    title: "ARTICLE 3bis — CE QUE MOTOLINK NE GARANTIT PAS",
    body: "MotoLink ne garantit pas la livraison elle-même. Il constate et horodate les étapes. Le livreur peut rencontrer un accident, une route bloquée, ou tout autre incident. MotoLink ne peut être tenu responsable de la non-livraison, du retard, ou de la détérioration du colis.",
  },
  {
    title: "ARTICLE 4 — ANCRAGE TEMPOREL EXTERNE (TSA)",
    body: "MotoLink utilise le protocole RFC 3161 pour ancrer l'horodatage des preuves auprès de l'autorité FreeTSA. Cet ancrage garantit que la preuve existait bien à l'instant indiqué, indépendamment de MotoLink. En cas d'indisponibilité de la TSA, la preuve reste valide localement, mais l'ancrage externe n'est pas garanti.",
  },
  {
    title: "ARTICLE 4bis — CLASSIFICATION AUTOMATIQUE (JEV)",
    body: "La plateforme peut proposer une classification automatique du colis (fragile, standard, volumineux, urgent) à partir de la description et des photos fournies par le vendeur. Cette classification est générée par un modèle de décision automatisé (Jev, TypeSafe AI). Elle est fournie à titre indicatif uniquement. Elle ne constitue ni une validation, ni une garantie, ni une décision de la plateforme. Le vendeur peut à tout moment modifier ou retirer cette catégorie.",
  },
  {
    title: "ARTICLE 5 — JOURNAL D'AUDIT",
    body: "Chaque action sur une preuve (création, consultation, export, vérification) est enregistrée dans un journal immuable (append-only). Ce journal permet à tout utilisateur de vérifier que sa preuve n'a pas été altérée. Aucune donnée sensible n'y est stockée.",
  },
  {
    title: "ARTICLE 6 — VÉRIFICATION PUBLIQUE",
    body: "Toute personne disposant du hash d'une preuve peut vérifier son authenticité sur /verify/{hash}, sans authentification. Aucune donnée sensible (téléphone, adresse complète) n'est exposée.",
  },
  {
    title: "ARTICLE 7 — KYC ET BADGES",
    body: "Le badge 'Identité vérifiée' confirme que MotoLink a contrôlé la carte nationale d'identité du livreur. Il ne constitue pas une vérification du permis de conduire ni une autorisation d'exercer. Le badge 'Membre de syndicat' confirme la fourniture d'une carte de membre, sans garantie de conformité légale. Le badge 'Enrôlé CUD' confirme la fourniture d'une attestation, sans garantie d'authenticité. Le vendeur reste libre de demander des documents supplémentaires. MotoLink ne peut être tenu responsable de l'usage de documents falsifiés.",
  },
  {
    title: "ARTICLE 8 — TRANSPORT DE MARCHANDISES ET INTERDICTIONS",
    body: "MotoLink est un outil de traçabilité de transport de marchandises. Le transport de personnes (y compris enfants) est strictement interdit sur la plateforme. Le transport de matières dangereuses (gaz, carburant) est autorisé sous la responsabilité exclusive du vendeur et du livreur. Le vendeur certifie, en cochant la case dédiée, que la bonbonne de gaz est en bon état et sécurisée. MotoLink ne peut être tenu responsable d'un incident lié à ces transports.",
  },
  {
    title: "ARTICLE 9 — LIVREURS PRÉFÉRÉS",
    body: "L'acheteur ou le vendeur peut enregistrer des livreurs préférés et leur proposer directement des courses. Cette fonctionnalité est un annuaire de confiance. MotoLink ne garantit pas la disponibilité ni la qualité du livreur. Le livreur reste libre d'accepter ou de refuser. En cas de refus, la mission peut être publiée sur le marché ouvert.",
  },
  {
    title: "ARTICLE 10 — ABONNEMENT",
    body: "MotoLink est un service logiciel par abonnement. L'abonnement donne accès à la plateforme (création de missions pour le vendeur, accès aux missions pour le livreur). Il ne garantit pas la disponibilité des missions ni la qualité des livraisons. Le fair use de 50 livraisons/semaine peut être ajusté. L'abonnement est hebdomadaire (1 000 FCFA vendeur, 250 FCFA livreur) ou mensuel (3 500 FCFA vendeur, 800 FCFA livreur).",
  },
  {
    title: "ARTICLE 11 — RESPONSABILITÉ",
    body: "La plateforme ne peut être tenue responsable des vols, arnaques, colis non livrés, paiements non effectués, ou tout autre litige. Chaque utilisateur est seul responsable pénalement et civilement de ses actes. La preuve de livraison est un constat de fait, pas une garantie de paiement ou de qualité. MotoLink est un constat de fait, pas une garantie de paiement ou de qualité.",
  },
  {
    title: "ARTICLE 12 — PROTECTION DES DONNÉES",
    body: "Conformément à la loi camerounaise n°2024/017, les données personnelles sont collectées avec consentement, sécurisées, et peuvent être supprimées sur demande. Le DPO est joignable à dpo@motolink.cm. Les violations de données sont notifiées à l'autorité compétente sous 72h.",
  },
  {
    title: "ARTICLE 13 — MODIFICATION DES CGU",
    body: "MotoLink peut modifier les présentes CGU. Les utilisateurs seront notifiés 30 jours avant l'entrée en vigueur.",
  },
  {
    title: "ARTICLE 14 — COORDINATION LIVREUR / ACHETEUR",
    body: "Lorsque le livreur récupère le colis, il prend une photo pour confirmer la prise en charge. Cette photo est stockée comme preuve. Lorsque le livreur arrive dans la zone de livraison, MotoLink lui affiche le numéro de téléphone de l'acheteur, fourni par le vendeur. Le livreur peut appeler ou envoyer un message à l'acheteur pour coordonner la remise. L'acheteur peut confirmer sa présence via la page de suivi. MotoLink affiche le numéro fourni par le vendeur sans garantie de disponibilité ni d'exactitude. Le livreur s'engage à ne pas réutiliser le numéro de l'acheteur en dehors de la mission. MotoLink ne peut être tenu responsable de l'usage du numéro par le livreur. La confirmation de présence par l'acheteur ne constitue pas une validation de livraison : la réception est validée par la signature et la preuve scellée.",
  },
  {
    title: "ARTICLE 15 — STATUT DU LIVREUR",
    body: "Le livreur gère librement sa disponibilité sur la plateforme selon trois états techniques : Disponible (en ligne et éligible aux propositions directes), En mission (temporairement assigné à une course active), et Hors ligne (indisponible pour de nouvelles attributions). Le statut passe automatiquement à 'En mission' lors de l'acceptation d'une course et reprend son état d'origine une fois la livraison scellée ou annulée. Le passage en ligne est conditionné par la vérification d'identité (KYC) et un abonnement actif en cours de validité. MotoLink ne garantit pas l'attribution continue de missions lors des périodes de disponibilité.",
  },
  {
    title: "ARTICLE 16 — FLOTTE DE LIVREURS",
    body: "Le vendeur peut constituer une flotte de livreurs de confiance. Chaque livreur de la flotte est un travailleur indépendant. Le vendeur voit le nom, la photo, le numéro de téléphone (si le livreur y consent), la note et les badges de vérification. Le vendeur peut proposer des missions directement aux livreurs de sa flotte, sans obligation pour eux d'accepter. Le vendeur peut retirer un livreur de sa flotte à tout moment, sans justification. Ce retrait ne crée aucun préjudice pour le livreur, qui reste libre de travailler avec d'autres vendeurs. MotoLink n'est pas partie à la relation entre le vendeur et le livreur.",
  },
  {
    title: "ARTICLE 17 — NOTIFICATION AUX LIVREURS HORS LIGNE",
    body: "Le vendeur peut envoyer une notification à un livreur hors ligne pour lui demander s'il est disponible. Cette notification est limitée à une par 24h par livreur. Le livreur reste libre de répondre ou non, sans aucune obligation ni pénalité. Le vendeur ne peut pas utiliser cette fonctionnalité pour harceler un livreur. MotoLink se réserve le droit de suspendre l'accès à cette fonctionnalité en cas d'abus.",
  },
  {
    title: "ARTICLE 18 — PARRAINAGE VENDEUR → LIVREUR",
    body: "18.1 OBJET DU PARRAINAGE : Un vendeur abonné peut inviter un livreur à rejoindre sa flotte. Le vendeur prend en charge le premier abonnement hebdomadaire du livreur (250 FCFA) et lui accorde une priorité sur 3 missions.\n\n18.2 ABSENCE DE LIEN DE SUBORDINATION : Le parrainage ne constitue en aucun cas un contrat de travail, un contrat d'exclusivité ou un lien de subordination entre le vendeur et le livreur. Le livreur reste totalement indépendant et libre de fixer ses horaires, peut accepter ou refuser toute mission (y compris celles du vendeur parrain), peut accepter des missions d'autres vendeurs et du marché ouvert, n'a aucune obligation de présence, de résultat ou de disponibilité, et peut rompre le lien de parrainage à tout moment en souscrivant son propre abonnement. Le vendeur ne peut en aucun cas exiger une exclusivité, imposer des horaires, sanctionner un refus de mission, ou exercer un pouvoir disciplinaire.\n\n18.3 LIMITATION DE RESPONSABILITÉ : MotoLink ne peut être tenu responsable des relations, accords ou litiges entre un vendeur et un livreur parrainé. Le constat de livraison reste le seul service fourni par la plateforme.",
  },
  {
    title: "ARTICLE 19 — PARRAINAGE LIVREUR → LIVREUR",
    body: "Chaque livreur dispose d'un code de parrainage unique. Un nouveau livreur peut utiliser ce code lors de son inscription ou dans son profil pour recevoir 3 missions prioritaires.\n\nLe parrain reçoit un badge selon le nombre de filleuls ayant complété 20 livraisons : 1 → Parrain, 3 → Parrain confirmé, 5 → Parrain Or, 10 → Parrain Platine. Ce badge est visible sur son profil. Il n'ouvre droit à aucune réduction monétaire.\n\nLe parrainage est interdit en cas d'auto-parrainage (même téléphone, même appareil, même IP, ou trop de parrainages en peu de temps). MotoLink se réserve le droit d'annuler un parrainage frauduleux et de suspendre le compte concerné.\n\nLe parrainage ne crée aucun lien de subordination entre le parrain et le filleul. Le filleul reste un travailleur indépendant, libre d'accepter ou de refuser toute mission.",
  },
  {
    title: "ARTICLE 20 — NOTATION MUTUELLE",
    body: "Après chaque livraison, le vendeur et le livreur peuvent se noter mutuellement (1 à 5 étoiles). Les notes sont utilisées pour calculer un score de confiance sur 100, basé sur les 50 dernières notes. Les notes ne sont jamais supprimées. Le score est visible sur le profil public. Il ne constitue pas une certification mais un indicateur de fiabilité.",
  },
  {
    title: "ARTICLE 21 — ANNUAIRE VOLONTAIRE",
    body: "Le livreur peut choisir d'apparaître dans un annuaire visible par les vendeurs abonnés. Cette visibilité est volontaire et peut être désactivée à tout moment. Le numéro de téléphone n'est jamais affiché directement. Le vendeur doit envoyer une demande de contact, que le livreur peut accepter ou refuser. En cas d'acceptation, le numéro est révélé au vendeur. Le livreur reste responsable de l'usage de son numéro après révélation.",
  },
  {
    title: "ARTICLE 22 — PROGRAMMATION DE MISSIONS",
    body: "22.1 Les vendeurs abonnés peuvent programmer des livraisons jusqu'à 7 jours à l'avance, avec un préavis minimum de 2 heures.\n\n22.2 La modification ou l'annulation d'une mission programmée est possible sans frais jusqu'à 2 heures avant l'heure prévue.\n\n22.3 À moins de 2 heures de l'échéance, la mission est verrouillée. L'annulation n'est plus possible via l'application.\n\n22.4 MotoLink envoie des rappels automatiques (J-1, H-1, H) aux parties concernées. Ces rappels sont fournis à titre indicatif et n'engagent pas la responsabilité de MotoLink en cas de défaillance réseau.\n\n22.5 L'acceptation d'une mission programmée par un livreur constitue un engagement moral de ponctualité. Les retards ou absences répétés peuvent impacter le score de fiabilité du livreur.",
  },
  {
    title: "ARTICLE 23 — LIEN DE LIVRAISON PERSONNEL ET SMART PASTE",
    body: "Le vendeur dispose d'un lien personnel qu'il peut partager à ses acheteurs. L'acheteur qui clique confirme ses informations, créant un brouillon que le vendeur valide en ajoutant les photos du colis.\n\nLe vendeur peut coller un message texte dans MotoLink. Un modèle de décision automatisé (Jev) extrait les informations utiles (téléphone, adresse, description, prix). Le vendeur doit vérifier et valider ces informations avant de créer la mission.\n\nMotoLink ne garantit pas l'exactitude des informations extraites automatiquement. Le vendeur reste responsable de la vérification. Les brouillons non finalisés après 7 jours sont automatiquement supprimés.",
  },
  {
    title: "ARTICLE 24 — CONFIRMATION DE COMMANDE",
    body: "MotoLink recommande au vendeur de confirmer la commande avec l'acheteur (par appel ou message) avant de créer une mission. MotoLink enregistre l'horodatage du clic sur les boutons d'appel ou de message, mais ne vérifie pas que l'appel a effectivement abouti. Le vendeur reste seul responsable de la confirmation. MotoLink ne peut être tenu responsable des conséquences d'une commande non confirmée (client absent, refus, etc.).",
  },
  {
    title: "ARTICLE 25 — CODE DE REMISE",
    body: "À la création de chaque mission, un code à 4 chiffres est généré et envoyé à l'acheteur. Le livreur doit saisir ce code avant de valider la livraison. Cela garantit que le livreur a bien vu l'acheteur et que l'acheteur a bien reçu le colis. Le code est confidentiel et ne doit être partagé qu'avec le livreur au moment de la remise. MotoLink ne peut être tenu responsable de la divulgation du code par l'acheteur.",
  },
  {
    title: "ARTICLE 26 — APPELS DU LIVREUR ET CLIENT ABSENT",
    body: "MotoLink encourage le livreur à appeler l'acheteur à deux moments critiques : après la prise en charge du colis (avant le départ) et à son arrivée chez l'acheteur. MotoLink enregistre l'horodatage du clic sur les boutons d'appel ou de message, mais ne vérifie pas que l'appel a effectivement abouti. Le livreur reste entièrement libre de poursuivre la livraison sans appeler : aucun blocage n'est imposé. Si l'acheteur ne répond pas, le livreur peut prendre une photo « client absent » prouvant sa présence à l'adresse et l'acheteur en est notifié. Cette photo est un constat de fait et ne vaut pas preuve de livraison. MotoLink ne peut être tenu responsable de l'indisponibilité de l'acheteur ni des conséquences d'une non-remise.",
  },
  {
    title: "ARTICLE 27 — SIGNALEMENT, LITIGES ET DROIT APPLICABLE",


    body: "27.1 SIGNALEMENT : Tout utilisateur peut signaler un comportement abusif (fraude, harcèlement, fausse preuve, non-respect des présentes CGU) via le support MotoLink. MotoLink peut suspendre ou résilier un compte en cas de violation grave ou répétée des CGU,

export default function LegalCguPage() {
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
                Conditions Générales d&apos;Utilisation
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
            <Scale className="h-5 w-5" />
            <h1>Conditions Générales d&apos;Utilisation (CGU)</h1>
          </div>
          <p className="text-base leading-relaxed text-slate-200">
            MotoLink est un constat de fait, pas une garantie de paiement ou de
            qualité.
          </p>
        </section>

        <div className="space-y-4">
          {ARTICLES.map((article) => (
            <article
              key={article.title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2"
            >
              <h2 className="text-base font-extrabold text-primary">
                {article.title}
              </h2>
              <p className="text-base leading-relaxed text-slate-100">
                {article.body}
              </p>
            </article>
          ))}
        </div>

        <Footer />
      </div>
    </main>
  );
}

