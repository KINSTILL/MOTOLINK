# MotoLink — La preuve de livraison opposable 🛵📦

**MotoLink** est une application web progressive (PWA) mobile-first conçue pour certifier et sécuriser les livraisons du dernier kilomètre. Elle intègre un horodatage certifié, une capture de signature numérique, une géolocalisation haute précision et des paiements locaux en Francs CFA (FCFA) via NotchPay.

---

## 🛠 Stack Technique

- **Framework :** Next.js 14+ (App Router) avec TypeScript strict
- **Design & Styles :** Tailwind CSS + composables shadcn/ui
- **Thème :** Mode sombre natif par défaut (`<html class="dark">`), palette personnalisée
- **PWA & Offline :** Serwist (`@serwist/next`) + Service Worker + Web App Manifest
- **ORM :** Prisma ORM avec PostgreSQL
- **Signature électronique :** `react-signature-canvas`
- **Cartographie :** `leaflet` & `react-leaflet`
- **Temps Réel :** `socket.io-client`
- **Validation de schémas :** `zod`
- **SDK IA :** `@typesafe-ai/sdk` (pour les fonctionnalités futures de vision et validation de preuve)

---

## ⚙️ Configuration Régionale & Ergonomie Mobile

- **Langue :** Français (`fr`)
- **Fuseau horaire :** `Africa/Douala` (WAT / GMT+1)
- **Devise :** Franc CFA (`FCFA` / `XAF`)
- **Police d'écriture :** `Inter` (Google Fonts optimisée)
- **Hauteur d'écran :** `100dvh` (Dynamic Viewport Height) pour éviter les sauts de barre de navigation mobile
- **Safe Areas :** Prise en compte native des encoches iOS (notch) et barres gestuelles Android (`env(safe-area-inset-*)`)

---

## 🎨 Palette de Couleurs

- **Primary :** Bleu `#2563eb` (Boutons principaux, actions clés)
- **Secondary :** Orange `#f97316` (Accents, livraisons urgentes, alertes de suivi)
- **Success :** Vert `#16a34a` (Preuves validées, statuts en ligne)
- **Warning :** Jaune `#eab308` (En attente, vérifications)
- **Danger :** Rouge `#dc2626` (Litiges, erreurs, annulations)
- **Fond sombre :** Ardoise `#0f172a`

---

## 📂 Structure du Projet

```text
motolink/
├── app/
│   ├── globals.css         # Thème sombre, variables HSL, safe-areas
│   ├── layout.tsx          # Layout racine (Inter, lang="fr", viewport mobile)
│   ├── page.tsx            # Accueil mobile-first MotoLink
│   └── sw.ts               # Service Worker Serwist (cache & offline)
├── components/             # Composants réutilisables (shadcn/ui)
│   └── ui/
├── lib/
│   ├── prisma.ts           # Client Prisma singleton
│   └── utils.ts            # Fonctions utilitaires (cn, formatFCFA, dates Douala)
├── prisma/
│   └── schema.prisma       # Schéma de base de données (User, DeliveryProof)
├── public/
│   ├── icons/              # Icônes PWA (192x192, 512x512)
│   └── manifest.json       # Manifeste PWA standalone
├── .env.example            # Exemple des variables d'environnement
├── next.config.js          # Configuration Next.js + plugin Serwist
├── package.json            # Dépendances du projet
├── postcss.config.js       # Configuration PostCSS pour Tailwind
├── tailwind.config.ts      # Configuration Tailwind CSS & tokens
└── tsconfig.json           # Configuration TypeScript stricte
```

---

## 🚀 Installation & Démarrage

### 1. Cloner ou ouvrir le projet

```bash
cd motolink
```

### 2. Configurer les variables d'environnement

Copiez le fichier `.env.example` vers `.env` :

```bash
cp .env.example .env
```

Renseignez les variables selon votre environnement (PostgreSQL, NotchPay, Cloudflare R2, FCM).

### 3. Installer les dépendances

```bash
npm install
```

> La commande `prisma generate` est exécutée automatiquement après l'installation pour générer le client TypeScript.

### 4. Lancer le serveur de développement

```bash
npm run dev
```

L'application est disponible sur :
👉 **http://localhost:3000**

Pour tester en conditions réelles mobiles :
- Activez la vue mobile (Device Toolbar) dans l'inspecteur Chrome/Edge (`Ctrl+Shift+M` ou `Cmd+Shift+M`).
- Ou accédez à l'adresse IP locale de votre machine depuis un smartphone connecté sur le même réseau WiFi.

---

## 📋 Variables d'Environnement

| Variable | Description |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL pour Prisma |
| `NEXTAUTH_SECRET` | Clé secrète de chiffrement des sessions NextAuth |
| `NEXTAUTH_URL` | URL de base de l'application (`http://localhost:3000`) |
| `NOTCHPAY_PUBLIC_KEY` | Clé publique NotchPay (Orange Money & MTN MoMo) |
| `NOTCHPAY_SECRET_KEY` | Clé privée NotchPay |
| `NOTCHPAY_WEBHOOK_SECRET` | Secret de signature des webhooks NotchPay |
| `FCM_SERVER_KEY` | Clé serveur Firebase Cloud Messaging pour les push PWA |
| `R2_ACCESS_KEY` | Clé d'accès Cloudflare R2 (stockage S3 compatible) |
| `R2_SECRET_KEY` | Clé secrète Cloudflare R2 |
| `R2_BUCKET` | Nom du bucket Cloudflare R2 pour les signatures et photos |

---

## 📜 Scripts Disponibles

- `npm run dev` : Démarre le serveur Next.js en mode développement
- `npm run build` : Compile le projet et génère le Service Worker PWA de production
- `npm run start` : Lance le serveur en mode production
- `npm run lint` : Vérifie le code avec ESLint

