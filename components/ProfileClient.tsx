"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Edit3,
  Gift,
  Heart,
  Loader2,
  LogOut,
  MessageCircle,
  MessageSquare,
  Phone,
  Shield,
  Trash2,
} from "lucide-react";
import { UserRole } from "@/lib/utils";
import LegalLinks from "@/components/LegalLinks";
import DriverProfileBadges from "@/components/DriverProfileBadges";
import DirectoryVisibilityToggle from "@/components/DirectoryVisibilityToggle";

type NotificationChannel = "WHATSAPP" | "SMS";

interface ProfileClientProps {
  user: {
    id: string;
    name: string | null;
    shopName: string | null;
    phone: string;
    role: UserRole;
    preferredChannel?: string | null;
    notificationChannel?: string | null;
    sponsorDriverId?: string | null;
    referrerBadge?: string | null;
    city?: string | null;
    workZones?: string[];
    directoryVisible?: boolean;
  };
}

const ROLE_LABELS: Record<UserRole, string> = {
  VENDOR: "Vendeur",
  DRIVER: "Livreur",
  BUYER: "Acheteur",
};

function getInitials(name?: string | null, phone?: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return phone ? phone.slice(-2) : "ML";
}

export default function ProfileClient({ user }: ProfileClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(user.name || "");
  const [shopName, setShopName] = useState(user.shopName || "");
  const [city, setCity] = useState(user.city || "");
  const [workZones, setWorkZones] = useState((user.workZones || []).join(", "));
  const [channel, setChannel] = useState<NotificationChannel>(
    user.preferredChannel?.toLowerCase() === "sms" ||
      user.notificationChannel?.toUpperCase() === "SMS"
      ? "SMS"
      : "WHATSAPP"
  );
  const [saving, setSaving] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Parrainage livreur
  const [hasSponsor, setHasSponsor] = useState(Boolean(user.sponsorDriverId));
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [referralFeedback, setReferralFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleApplyReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralCodeInput.trim()) return;
    setApplyingReferral(true);
    setReferralFeedback(null);
    try {
      const res = await fetch("/api/referrals/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: referralCodeInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'appliquer le code.");
      }
      setReferralFeedback({
        type: "success",
        text: "Code appliqué. Vous avez 3 missions prioritaires.",
      });
      setHasSponsor(true);
      router.refresh();
    } catch (err: unknown) {
      setReferralFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erreur inattendue.",
      });
    } finally {
      setApplyingReferral(false);
    }
  };

  const displayName = user.shopName || user.name || "Utilisateur MotoLink";
  const initials = getInitials(user.shopName || user.name, user.phone);

  const handleChannelChange = async (nextChannel: NotificationChannel) => {
    setChannel(nextChannel);
    setSavingChannel(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationChannel: nextChannel }),
      });

      if (res.ok) {
        setMessage(
          `Canal de notification mis à jour : ${
            nextChannel === "WHATSAPP" ? "WhatsApp" : "SMS"
          }`
        );
        router.refresh();
      }
    } finally {
      setSavingChannel(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          shopName:
            user.role === "VENDOR" ? shopName.trim() || null : undefined,
          city: user.role === "DRIVER" ? city.trim() || null : undefined,
          workZones:
            user.role === "DRIVER"
              ? workZones
                  .split(",")
                  .map((z) => z.trim())
                  .filter(Boolean)
                  .slice(0, 10)
              : undefined,
          notificationChannel: channel,
        }),
      });

      if (res.ok) {
        setEditing(false);
        setMessage("Informations mises à jour.");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/login");
      } else {
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-slate-50">Mon profil</h1>

      {/* Carte Avatar (initiales), Nom, Téléphone, Rôle */}
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-slate-900 p-4 text-center border border-slate-800">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-extrabold text-white shadow-lg shadow-primary/25">
          {initials}
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-50">{displayName}</h2>
          <p className="flex items-center justify-center gap-1.5 text-base text-slate-400">
            <Phone className="h-4 w-4 text-primary" />
            <span>{user.phone}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3.5 py-1 text-sm font-semibold text-primary">
            <Shield className="h-4 w-4" />
            <span>Rôle : {ROLE_LABELS[user.role]}</span>
          </span>

          {user.referrerBadge && (
            <DriverProfileBadges referrerBadge={user.referrerBadge} />
          )}
        </div>
      </div>

      {/* Sélecteur "Canal de notification préféré" (WhatsApp / SMS) */}
      <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <span className="text-base font-semibold text-slate-50">
              Canal de notification préféré
            </span>
          </div>
          {savingChannel && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleChannelChange("WHATSAPP")}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-xl border text-base font-semibold transition active:scale-[0.98] ${
              channel === "WHATSAPP"
                ? "border-success bg-success/15 text-success"
                : "border-slate-700 bg-slate-950 text-slate-400"
            }`}
          >
            <MessageCircle className="h-5 w-5" />
            <span>WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => handleChannelChange("SMS")}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-xl border text-base font-semibold transition active:scale-[0.98] ${
              channel === "SMS"
                ? "border-primary bg-primary/15 text-primary"
                : "border-slate-700 bg-slate-950 text-slate-400"
            }`}
          >
            <MessageSquare className="h-5 w-5" />
            <span>SMS</span>
          </button>
        </div>

        <p className="text-xs leading-relaxed text-slate-400 pt-1">
          Le vendeur consent à l&apos;envoi d&apos;une notification à l&apos;acheteur via le canal choisi. MotoLink agit pour le compte du vendeur. Uniquement transactionnel, jamais marketing.
        </p>
      </div>

      {/* Annuaire volontaire des livreurs (consentement explicite) */}
      {user.role === "DRIVER" && (
        <DirectoryVisibilityToggle
          initialVisible={Boolean(user.directoryVisible)}
        />
      )}

      {/* Code de parrainage (si livreur et pas encore parrainé) */}
      {user.role === "DRIVER" && !hasSponsor && (
        <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-secondary" />
            <span className="text-base font-semibold text-slate-50">
              Code de parrainage
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Entrez le code d&apos;un confrère livreur pour bénéficier de 3 missions prioritaires.
          </p>

          {referralFeedback && (
            <div
              className={`rounded-xl border p-3 text-xs font-semibold ${
                referralFeedback.type === "success"
                  ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-300"
                  : "border-danger/40 bg-danger/10 text-danger"
              }`}
            >
              {referralFeedback.text}
            </div>
          )}

          <form onSubmit={handleApplyReferral} className="flex gap-2">
            <input
              type="text"
              value={referralCodeInput}
              onChange={(e) => setReferralCodeInput(e.target.value)}
              placeholder="Ex: MOTO-JEAN-2026"
              className="h-12 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-primary focus:outline-none uppercase"
            />
            <button
              type="submit"
              disabled={applyingReferral || !referralCodeInput.trim()}
              className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-white transition active:scale-95 disabled:opacity-50"
            >
              {applyingReferral ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span>Appliquer</span>
              )}
            </button>
          </form>
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-success/40 bg-success/10 p-3 text-center text-base font-medium text-success">
          {message}
        </div>
      )}

      {/* Formulaire d'édition pliable */}
      {editing && (
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-2xl bg-slate-900 p-4 border border-slate-800"
        >
          <div className="space-y-2">
            <label
              htmlFor="profile-name"
              className="block text-base font-medium text-slate-50"
            >
              Nom complet
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Votre nom"
              className="h-14 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-base text-slate-50 focus:border-primary focus:outline-none"
            />
          </div>

          {user.role === "VENDOR" && (
            <div className="space-y-2">
              <label
                htmlFor="profile-shop"
                className="block text-base font-medium text-slate-50"
              >
                Nom de la boutique
              </label>
              <input
                id="profile-shop"
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Ex: Ma Boutique Douala"
                className="h-14 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-base text-slate-50 focus:border-primary focus:outline-none"
              />
            </div>
          )}

          {user.role === "DRIVER" && (
            <div className="space-y-2">
              <label
                htmlFor="profile-city"
                className="block text-base font-medium text-slate-50"
              >
                Ville d&apos;activité
              </label>
              <input
                id="profile-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: Douala"
                maxLength={60}
                className="h-14 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-base text-slate-50 focus:border-primary focus:outline-none"
              />
              <p className="text-xs text-slate-400">
                Utilisée pour le tableau d&apos;honneur mensuel par ville.
              </p>
            </div>
          )}

          {user.role === "DRIVER" && (
            <div className="space-y-2">
              <label
                htmlFor="profile-zones"
                className="block text-base font-medium text-slate-50"
              >
                Zones de travail
              </label>
              <input
                id="profile-zones"
                type="text"
                value={workZones}
                onChange={(e) => setWorkZones(e.target.value)}
                placeholder="Ex: Akwa, Bonapriso, Bonamoussadi"
                className="h-14 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-base text-slate-50 focus:border-primary focus:outline-none"
              />
              <p className="text-xs text-slate-400">
                Quartiers séparés par des virgules (10 maximum). Affichés dans l&apos;annuaire si vous y apparaissez.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <span>Enregistrer</span>
            )}
          </button>
        </form>
      )}

      {/* Boutons d'actions du profil */}
      <div className="space-y-3">
        {/* Lien Mes livreurs préférés (Vendeur & Acheteur) */}
        {(user.role === "VENDOR" || user.role === "BUYER") && (
          <Link
            href="/profile/favorite-drivers"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/15 px-4 text-base font-semibold text-primary transition active:scale-[0.98]"
          >
            <Heart className="h-5 w-5" />
            <span>Mes livreurs préférés</span>
          </Link>
        )}

        {/* Bouton Modifier mes informations */}
        <button
          type="button"
          onClick={() => setEditing((prev) => !prev)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-base font-semibold text-slate-50 transition active:scale-[0.98]"
        >
          <Edit3 className="h-5 w-5 text-primary" />
          <span>Modifier mes informations</span>
        </button>

        {/* Bouton Se déconnecter */}
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-base font-semibold text-slate-50 transition active:scale-[0.98]"
          >
            <LogOut className="h-5 w-5 text-secondary" />
            <span>Se déconnecter</span>
          </button>
        </form>

        {/* Bouton Supprimer mon compte (rouge, avec confirmation) */}
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-danger/15 border border-danger/40 px-4 text-base font-semibold text-danger transition active:scale-[0.98]"
          >
            <Trash2 className="h-5 w-5" />
            <span>Supprimer mon compte</span>
          </button>
        ) : (
          <div className="space-y-3 rounded-2xl border border-danger/50 bg-slate-900 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-danger" />
              <p className="text-base text-slate-50">
                Êtes-vous sûr de vouloir supprimer définitivement votre compte ?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex h-14 w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-base font-semibold text-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteAccount}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-danger text-base font-semibold text-white"
              >
                {deleting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <span>Confirmer</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Liens légaux CGU, Confidentialité, Mentions */}
      <div className="pt-2">
        <LegalLinks />
      </div>
    </div>
  );
}
