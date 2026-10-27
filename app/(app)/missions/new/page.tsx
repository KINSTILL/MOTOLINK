"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Flame,
  Heart,
  Link as LinkIcon,
  Loader2,
  PlusCircle,
  QrCode,
  Share2,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  createMissionSchema,
  MISSION_TYPE_OPTIONS,
  MissionTypeValue,
} from "@/lib/validations/mission";
import ArticlePhotoCapture from "@/components/ArticlePhotoCapture";
import ScheduleMissionToggle from "@/components/ScheduleMissionToggle";
import QRCodeModal from "@/components/QRCodeModal";
import OrderConfirmationBlock, {
  CallMethodValue,
} from "@/components/OrderConfirmationBlock";
import OrderConfirmationReminder from "@/components/OrderConfirmationReminder";
import SmartPastePreview, {
  SmartPasteExtractedData,
} from "@/components/SmartPastePreview";
import BuyerReliabilityBadge from "@/components/BuyerReliabilityBadge";

interface FavoriteDriverOption {
  id: string;
  driverId: string;
  note: string | null;
  driver: {
    id: string;
    name: string;
    phone: string;
    averageRating: number | null;
    ratingsCount: number;
  };
}

/**
 * Formate dynamiquement la saisie téléphone en "+237 6XX XXX XXX"
 */
function formatPhoneDisplay(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("237")) {
    digits = digits.slice(3);
  }
  const local = digits.slice(0, 9);
  if (local.length === 0) return "";

  const p1 = local.slice(0, 3);
  const p2 = local.slice(3, 6);
  const p3 = local.slice(6, 9);

  let out = `+237 ${p1}`;
  if (p2) out += ` ${p2}`;
  if (p3) out += ` ${p3}`;
  return out;
}

export default function NewMissionPage() {
  const router = useRouter();

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhoneDisplay, setBuyerPhoneDisplay] = useState("");
  const [address, setAddress] = useState("");
  const [articlePhotoUrls, setArticlePhotoUrls] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  const [missionType, setMissionType] = useState<MissionTypeValue>("PARCEL");
  const [gasCertified, setGasCertified] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);

  // Social Commerce - Lien de livraison personnel
  const [slugData, setSlugData] = useState<{
    slug: string;
    url: string;
    qrCodeUrl?: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Social Commerce - Smart Paste
  const [smartPasteText, setSmartPasteText] = useState("");
  const [analyzingPaste, setAnalyzingPaste] = useState(false);
  const [smartPasteError, setSmartPasteError] = useState<string | null>(null);
  const [smartPasteModalData, setSmartPasteModalData] =
    useState<SmartPasteExtractedData | null>(null);

  // Accordéon Formulaire manuel
  const [showManualForm, setShowManualForm] = useState(false);

  // Livreurs préférés
  const [favoriteDrivers, setFavoriteDrivers] = useState<
    FavoriteDriverOption[]
  >([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [selectedDriver, setSelectedDriver] =
    useState<FavoriteDriverOption | null>(null);

  const searchParams = useSearchParams();
  const preselectedDriverId = searchParams?.get("driverId");

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // N5 — Score de fiabilité client (opt-in via les réglages N4)
  const [showBuyerReliability, setShowBuyerReliability] = useState(false);

  // Confirmation de commande (appel / WhatsApp) avant création
  const [callInitiatedAt, setCallInitiatedAt] = useState<string | null>(null);
  const [callMethod, setCallMethod] = useState<CallMethodValue | null>(null);
  const [callTarget, setCallTarget] = useState<string | null>(null);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [showConfirmReminder, setShowConfirmReminder] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    if (preselectedDriverId) {
      setShowManualForm(true);
    }

    // Récupérer le lien de livraison personnel du vendeur
    fetch("/api/vendors/public-slug")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.slug) {
          setSlugData(data);
        }
      })
      .catch(() => {});

    // N5 — récupérer la préférence d'affichage du score de fiabilité client
    fetch("/api/users/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.user?.showBuyerReliability) {
          setShowBuyerReliability(true);
        }
      })
      .catch(() => {});

    setLoadingFavorites(true);
    fetch("/api/favorite-drivers")
      .then((res) => (res.ok ? res.json() : { favorites: [] }))
      .then((data) => {
        if (mounted) {
          const list = data.favorites || [];
          setFavoriteDrivers(list);
          if (preselectedDriverId) {
            const found = list.find(
              (f: FavoriteDriverOption) =>
                f.driverId === preselectedDriverId || f.id === preselectedDriverId
            );
            if (found) setSelectedDriver(found);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoadingFavorites(false);
      });
    return () => {
      mounted = false;
    };
  }, [preselectedDriverId]);

  const handleCopyLink = async () => {
    if (!slugData?.url) return;
    try {
      await navigator.clipboard.writeText(slugData.url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Ignorer fallback
    }
  };

  const handleShareWhatsApp = () => {
    if (!slugData?.url) return;
    const msg = encodeURIComponent(
      `Bonjour ! Veuillez confirmer votre adresse de livraison ici pour votre commande : ${slugData.url}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const handleSmartPasteSubmit = async () => {
    if (!smartPasteText.trim()) {
      setSmartPasteError("Veuillez coller le message de votre client.");
      return;
    }
    setAnalyzingPaste(true);
    setSmartPasteError(null);

    try {
      const res = await fetch("/api/vendors/smart-paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: smartPasteText }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSmartPasteError(data.error || "Impossible d'analyser ce message.");
        setAnalyzingPaste(false);
        return;
      }

      if (!data.success) {
        setSmartPasteError(
          data.message || "Impossible d'extraire les informations. Utilisez le formulaire manuel."
        );
        setAnalyzingPaste(false);
        return;
      }

      setSmartPasteModalData({
        draftId: data.draftId,
        buyerName: data.extracted?.buyerName,
        buyerPhone: data.extracted?.buyerPhone,
        address: data.extracted?.address,
        description: data.extracted?.description,
        price: data.extracted?.price,
        confidence: data.extracted?.confidence,
        status: data.status,
      });
    } catch {
      setSmartPasteError("Erreur réseau lors de l'analyse.");
    } finally {
      setAnalyzingPaste(false);
    }
  };

  // Validation temps réel avec Zod
  const validation = useMemo(() => {
    return createMissionSchema.safeParse({
      buyerName,
      buyerPhone: buyerPhoneDisplay,
      address,
      articlePhotoUrls,
      description,
      price: price === "" ? NaN : Number(price),
      type: missionType,
      gasCertified: missionType === "GAS" ? gasCertified : false,
      preferredDriverId: selectedDriver?.driverId || undefined,
      scheduledAt: scheduledAt || undefined,
    });
  }, [
    buyerName,
    buyerPhoneDisplay,
    address,
    articlePhotoUrls,
    description,
    price,
    missionType,
    gasCertified,
    selectedDriver,
    scheduledAt,
  ]);

  const fieldErrors = useMemo(() => {
    if (validation.success) return {};
    return validation.error.flatten().fieldErrors;
  }, [validation]);

  const isFormValid = validation.success;

  // Numéro complet au format international (+237XXXXXXXXX) ou null si incomplet
  const dialablePhone = useMemo(() => {
    let digits = buyerPhoneDisplay.replace(/\D/g, "");
    if (digits.startsWith("237")) digits = digits.slice(3);
    return digits.length === 9 ? `+237${digits}` : null;
  }, [buyerPhoneDisplay]);

  // Si le numéro change après le clic, l'appel initié ne concerne plus ce client :
  // on réinitialise la preuve et la case de confirmation.
  useEffect(() => {
    if (callTarget && callTarget !== dialablePhone) {
      setCallInitiatedAt(null);
      setCallMethod(null);
      setCallTarget(null);
      setOrderConfirmed(false);
    }
  }, [dialablePhone, callTarget]);

  const handleInitiateCall = (method: CallMethodValue) => {
    if (!dialablePhone) return;

    setCallInitiatedAt(new Date().toISOString());
    setCallMethod(method);
    setCallTarget(dialablePhone);

    if (method === "tel") {
      window.location.href = `tel:${dialablePhone}`;
    } else {
      const phoneClean = dialablePhone.replace(/\D/g, "");
      const greeting = buyerName.trim() ? `Bonjour ${buyerName.trim()}` : "Bonjour";
      const text = encodeURIComponent(
        `${greeting}, je prépare votre commande et je souhaite la confirmer avec vous. Pouvez-vous me confirmer votre adresse de livraison et votre disponibilité ?`
      );
      window.open(`https://wa.me/${phoneClean}?text=${text}`, "_blank", "noopener");
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (
      raw.trim() === "+237" ||
      raw.trim() === "+23" ||
      raw.trim() === "+2" ||
      raw.trim() === "+"
    ) {
      setBuyerPhoneDisplay("");
      return;
    }
    setBuyerPhoneDisplay(formatPhoneDisplay(raw));
  };

  const markTouched = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const submitMission = async () => {
    if (!validation.success || submitting) return;

    setSubmitting(true);
    setToast(null);

    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validation.data,
          orderConfirmed: true,
          callInitiatedAt,
          callMethod,
          callTarget,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setToast({
          type: "error",
          message: data.error || "Impossible de créer la mission.",
        });
        setSubmitting(false);
        return;
      }

      setToast({
        type: "success",
        message: "Mission créée",
      });

      router.push(`/missions/${data.mission.id}?created=1`);
    } catch {
      setToast({
        type: "error",
        message: "Erreur réseau. Vérifiez votre connexion.",
      });
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      buyerName: true,
      buyerPhone: true,
      address: true,
      articlePhotoUrls: true,
      description: true,
      price: true,
      gasCertified: true,
    });

    if (!validation.success || submitting) return;

    // Pas de confirmation cochée : on rappelle au vendeur de confirmer la commande
    if (!orderConfirmed) {
      setShowConfirmReminder(true);
      return;
    }

    await submitMission();
  };

  const handleReminderCallNow = () => {
    setShowConfirmReminder(false);
    handleInitiateCall("tel");
  };

  const handleReminderContinueWithoutCalling = async () => {
    setShowConfirmReminder(false);
    setOrderConfirmed(true);
    await submitMission();
  };

  return (
    <div className="relative space-y-6 p-4 pb-28">
      {/* Toast Flottant */}
      {toast && (
        <div
          role="alert"
          className={`fixed left-4 right-4 top-16 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border p-4 shadow-xl transition ${
            toast.type === "success"
              ? "border-success/50 bg-slate-900 text-success"
              : "border-danger/50 bg-slate-900 text-danger"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span className="text-base font-semibold">{toast.message}</span>
        </div>
      )}

      <div>
        <h1 className="text-lg font-bold text-slate-50">
          Nouvelle mission de livraison
        </h1>
        <p className="text-base text-slate-400">
          Choisissez l&apos;une des 3 options pour expédier votre colis : lien client, copier-coller ou saisie manuelle.
        </p>
      </div>

      {/* OPTION 1 : Lien de Livraison Personnel */}
      <section className="rounded-3xl border border-primary/30 bg-primary/5 p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
              <LinkIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-50">
                Lien de Livraison Personnel
              </h2>
              <span className="text-[11px] font-semibold text-primary">
                Option 1 • L&apos;acheteur remplit lui-même son adresse
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-slate-300">
          Envoyez ce lien unique à votre client. Dès qu&apos;il valide ses coordonnées, un brouillon de course apparaît immédiatement dans votre compte.
        </p>

        <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-xs font-mono text-slate-200 break-all">
          <span>{slugData ? slugData.url : "Génération de votre lien..."}</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            disabled={!slugData}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 active:scale-95 disabled:opacity-50"
          >
            {copiedLink ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span>Copié !</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Copier</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleShareWhatsApp}
            disabled={!slugData}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2 text-xs font-bold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50 shadow-md shadow-emerald-600/20"
          >
            <Share2 className="h-4 w-4" />
            <span>WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            disabled={!slugData}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 active:scale-95 disabled:opacity-50"
          >
            <QrCode className="h-4 w-4" />
            <span>QR Code</span>
          </button>
        </div>
      </section>

      {/* OPTION 2 : Coller le message du client (Smart Paste) */}
      <section className="rounded-3xl border border-purple-500/30 bg-purple-950/15 p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-50">
                Coller le message du client (Smart Paste)
              </h2>
              <span className="text-[11px] font-semibold text-purple-400">
                Option 2 • Extraction automatique par IA Jev
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-slate-300">
          Collez le texte brut de votre conversation WhatsApp. Jev extrait instantanément le numéro, le quartier, le prix et la description.
        </p>

        <textarea
          rows={6}
          value={smartPasteText}
          onChange={(e) => {
            setSmartPasteText(e.target.value);
            setSmartPasteError(null);
          }}
          placeholder="Collez ici le message WhatsApp de votre client. Ex : Bonjour, je confirme la commande de la robe pour 2500 FCFA. Livrer à Bonamoussadi carrefour marché face pharmacie, tel : 699112233..."
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-50 placeholder:text-slate-500 focus:border-purple-500 focus:outline-none"
        />

        {smartPasteError && (
          <div className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{smartPasteError}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleSmartPasteSubmit}
          disabled={analyzingPaste || !smartPasteText.trim()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 text-base font-bold text-white shadow-lg shadow-purple-600/25 transition active:scale-[0.98] disabled:opacity-40"
        >
          {analyzingPaste ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Analyse par Jev...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              <span>Analyser le message</span>
            </>
          )}
        </button>
      </section>

      {/* OPTION 3 : Accordéon Formulaire manuel */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowManualForm(!showManualForm)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-slate-700 active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5">
            <PlusCircle className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-sm font-bold text-slate-200">
                Ou remplir manuellement
              </p>
              <p className="text-xs text-slate-400">
                Formulaire classique complet (Option 3)
              </p>
            </div>
          </div>
          {showManualForm ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </button>
      </div>

      {showManualForm && (
        <form
          id="create-mission-form"
          onSubmit={handleSubmit}
          className="space-y-4 pt-2"
        >
        {/* 0. Sélecteur "Type de course" (radio buttons verticaux) */}
        <fieldset className="space-y-2">
          <legend className="block text-base font-medium text-slate-50">
            Type de course <span className="text-danger">*</span>
          </legend>
          <div className="space-y-2">
            {MISSION_TYPE_OPTIONS.map((option) => {
              const isSelected = missionType === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex h-14 w-full cursor-pointer items-center justify-between rounded-xl border px-4 text-base font-semibold transition ${
                    isSelected
                      ? "border-primary bg-primary/15 text-slate-50"
                      : "border-slate-700 bg-slate-900 text-slate-300"
                  }`}
                >
                  <span>{option.label}</span>
                  <input
                    type="radio"
                    name="missionType"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => {
                      setMissionType(option.value);
                      if (option.value !== "GAS") {
                        setGasCertified(false);
                      }
                    }}
                    className="h-5 w-5 accent-primary"
                  />
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Si GAS sélectionné : checkbox obligatoire de certification */}
        {missionType === "GAS" && (
          <div className="rounded-2xl border border-secondary/50 bg-secondary/10 p-4 space-y-2">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={gasCertified}
                onChange={(e) => {
                  setGasCertified(e.target.checked);
                  markTouched("gasCertified");
                }}
                className="mt-1 h-5 w-5 shrink-0 rounded accent-secondary"
              />
              <span className="text-sm font-medium leading-relaxed text-slate-100">
                <Flame className="mr-1 inline h-4 w-4 text-secondary" />
                Je certifie que la bonbonne est en bon état et sécurisée pour le transport{" "}
                <span className="text-danger">*</span>
              </span>
            </label>
            {touched.gasCertified && fieldErrors.gasCertified?.[0] && (
              <p className="text-sm font-medium text-danger">
                {fieldErrors.gasCertified[0]}
              </p>
            )}
          </div>
        )}

        {/* 1. Nom du client (text, optionnel) */}
        <div className="space-y-1.5">
          <label
            htmlFor="buyerName"
            className="block text-base font-medium text-slate-50"
          >
            Nom du client{" "}
            <span className="text-sm text-slate-400">(optionnel)</span>
          </label>
          <input
            id="buyerName"
            type="text"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            onBlur={() => markTouched("buyerName")}
            placeholder="Ex: Jean-Marc E."
            className="h-14 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-base text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
          />
          {touched.buyerName && fieldErrors.buyerName?.[0] && (
            <p className="text-sm font-medium text-danger">
              {fieldErrors.buyerName[0]}
            </p>
          )}
        </div>

        {/* 2. Téléphone du client (tel, obligatoire, +237) */}
        <div className="space-y-1.5">
          <label
            htmlFor="buyerPhone"
            className="block text-base font-medium text-slate-50"
          >
            Téléphone du client <span className="text-danger">*</span>
          </label>
          <input
            id="buyerPhone"
            type="tel"
            inputMode="tel"
            required
            value={buyerPhoneDisplay}
            onChange={handlePhoneChange}
            onBlur={() => markTouched("buyerPhone")}
            placeholder="+237 6XX XXX XXX"
            className="h-14 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-base text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
          />
          {touched.buyerPhone && fieldErrors.buyerPhone?.[0] && (
            <p className="text-sm font-medium text-danger">
              {fieldErrors.buyerPhone[0]}
            </p>
          )}
        </div>

        {/* 3. Adresse de livraison (textarea, obligatoire, min 10 car) */}
        <div className="space-y-1.5">
          <label
            htmlFor="address"
            className="block text-base font-medium text-slate-50"
          >
            Adresse de livraison <span className="text-danger">*</span>
          </label>
          <textarea
            id="address"
            rows={3}
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onBlur={() => markTouched("address")}
            placeholder="Ex: Carrefour Bonamoussadi, à côté de la pharmacie X"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4 text-base text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
          />
          {touched.address && fieldErrors.address?.[0] && (
            <p className="text-sm font-medium text-danger">
              {fieldErrors.address[0]}
            </p>
          )}
        </div>

        {/* 4. Photos de l'article (obligatoire, 1 à 2 photos) */}
        <div className="space-y-1.5">
          <label className="block text-base font-medium text-slate-50">
            Photos de l&apos;article (1 à 2 photos){" "}
            <span className="text-danger">*</span>
          </label>
          <ArticlePhotoCapture
            photos={articlePhotoUrls}
            onChange={setArticlePhotoUrls}
            onBlur={() => markTouched("articlePhotoUrls")}
          />
          {touched.articlePhotoUrls && fieldErrors.articlePhotoUrls?.[0] && (
            <p className="text-sm font-medium text-danger">
              {fieldErrors.articlePhotoUrls[0]}
            </p>
          )}
        </div>

        {/* 5. Description (textarea, optionnel, max 200 car) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="description"
              className="block text-base font-medium text-slate-50"
            >
              Description{" "}
              <span className="text-sm text-slate-400">(optionnel)</span>
            </label>
            <span className="text-xs text-slate-400">
              {description.length}/200
            </span>
          </div>
          <textarea
            id="description"
            rows={2}
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => markTouched("description")}
            placeholder="Précisions utiles pour le livreur"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4 text-base text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
          />
          {touched.description && fieldErrors.description?.[0] && (
            <p className="text-sm font-medium text-danger">
              {fieldErrors.description[0]}
            </p>
          )}
        </div>

        {/* 6. Prix FCFA (number, > 0) */}
        <div className="space-y-1.5">
          <label
            htmlFor="price"
            className="block text-base font-medium text-slate-50"
          >
            Prix proposé en FCFA <span className="text-danger">*</span>
          </label>
          <input
            id="price"
            type="number"
            inputMode="numeric"
            min={1}
            step="any"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => markTouched("price")}
            placeholder="Ex: 1500"
            className="h-14 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-base text-slate-50 placeholder:text-slate-500 focus:border-primary focus:outline-none"
          />
          {touched.price && fieldErrors.price?.[0] && (
            <p className="text-sm font-medium text-danger">
              {fieldErrors.price[0]}
            </p>
          )}
        </div>

        {/* Bloc "Proposer à un livreur préféré" (optionnel) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              <span className="text-base font-semibold text-slate-50">
                Proposer à un livreur préféré
              </span>
            </div>
            <span className="text-xs text-slate-400">Optionnel</span>
          </div>

          {selectedDriver ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
              <div>
                <p className="text-base font-bold text-slate-50">
                  {selectedDriver.driver.name}
                </p>
                <p className="text-xs text-slate-300">
                  {selectedDriver.driver.phone}
                </p>
                {selectedDriver.driver.averageRating !== null && (
                  <p className="flex items-center gap-1 pt-0.5 text-xs text-secondary">
                    <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
                    <span>{selectedDriver.driver.averageRating} / 5</span>
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedDriver(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-danger/40 bg-danger/15 px-3 py-2 text-xs font-semibold text-danger transition active:scale-95"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Retirer</span>
              </button>
            </div>
          ) : favoriteDrivers.length === 0 && !loadingFavorites ? (
            <div className="space-y-2">
              <Link
                href="/dashboard/vendor/fleet"
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 text-sm font-semibold text-primary transition active:scale-[0.98] hover:bg-primary/10"
              >
                <PlusCircle className="h-5 w-5" />
                <span>Ajouter un livreur à ma flotte</span>
              </Link>
              <p className="text-center text-xs text-slate-400">
                Vous n&apos;avez pas encore de livreur dans votre flotte.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowFavoritesModal(true)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 text-base font-semibold text-slate-200 transition active:scale-[0.98]"
            >
              <Heart className="h-5 w-5 text-primary" />
              <span>Choisir un livreur préféré</span>
            </button>
          )}
        </div>

        {/* Bloc "Programmer à l'avance" (réservé aux vendeurs abonnés) */}
        <ScheduleMissionToggle
          value={scheduledAt}
          onChange={(iso) => setScheduledAt(iso)}
        />

        {/* Mention CGU consentement notification & transport */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2 text-xs leading-relaxed text-slate-400">
          <p>
            Le vendeur consent à l&apos;envoi d&apos;une notification à l&apos;acheteur via le canal choisi. MotoLink agit pour le compte du vendeur. Uniquement transactionnel, jamais marketing.
          </p>
          <p>
            MotoLink est un outil de traçabilité de transport de marchandises. Le transport de personnes (y compris enfants) est strictement interdit sur la plateforme. Le transport de matières dangereuses (gaz, carburant) est autorisé sous la responsabilité exclusive du vendeur et du livreur. MotoLink ne peut être tenu responsable d&apos;un incident lié à ces transports.
          </p>
        </div>

        {/* Bloc "Confirmer la commande" (appel / WhatsApp + case obligatoire) */}
        <OrderConfirmationBlock
          phoneReady={Boolean(dialablePhone)}
          callInitiatedAt={callInitiatedAt}
          callMethod={callMethod}
          confirmed={orderConfirmed}
          onCall={handleInitiateCall}
          onConfirmedChange={setOrderConfirmed}
        />

        {/* 7. Bouton "Créer la mission" (h-14, w-full, primaire, sticky bottom).
            Tant que la commande n'est pas confirmée, le bouton reste grisé (aria-disabled)
            mais un tap ouvre la modale de rappel au lieu de ne rien faire. */}
        <div className="sticky bottom-20 z-30 pt-4">
          <button
            type="submit"
            data-testid="create-mission-button"
            disabled={!isFormValid || submitting}
            aria-disabled={!isFormValid || !orderConfirmed || submitting}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/30 transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${
              !orderConfirmed ? "opacity-40" : ""
            }`}
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Création en cours...</span>
              </>
            ) : (
              <>
                <PlusCircle className="h-5 w-5" />
                <span>Créer la mission</span>
              </>
            )}
          </button>
        </div>
      </form>
      )}

      {/* Modale de rappel : commande non confirmée */}
      <OrderConfirmationReminder
        isOpen={showConfirmReminder}
        canCall={Boolean(dialablePhone)}
        onClose={() => setShowConfirmReminder(false)}
        onCallNow={handleReminderCallNow}
        onContinueWithoutCalling={handleReminderContinueWithoutCalling}
      />


      {/* Modale QR Code */}
      {slugData && (
        <QRCodeModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          slug={slugData.slug}
          shopName="Votre boutique"
          url={slugData.url}
          qrCodeUrl={slugData.qrCodeUrl}
        />
      )}

      {/* Modale Prévisualisation Smart Paste */}
      {smartPasteModalData && (
        <SmartPastePreview
          isOpen={Boolean(smartPasteModalData)}
          onClose={() => setSmartPasteModalData(null)}
          data={smartPasteModalData}
          onSuccess={() => {
            setSmartPasteModalData(null);
            setSmartPasteText("");
          }}
        />
      )}

      {/* Modale de sélection d'un livreur préféré */}
      {showFavoritesModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-50">
                Choisir un livreur préféré
              </h2>
              <button
                type="button"
                onClick={() => setShowFavoritesModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingFavorites ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : favoriteDrivers.length === 0 ? (
              <div className="space-y-3 py-4 text-center">
                <p className="text-sm text-slate-300">
                  Vous n&apos;avez pas encore de livreur dans votre flotte.
                </p>
                <Link
                  href="/dashboard/vendor/fleet"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Ajouter un livreur à ma flotte</span>
                </Link>
              </div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {favoriteDrivers.map((fav) => (
                  <button
                    key={fav.id}
                    type="button"
                    onClick={() => {
                      setSelectedDriver(fav);
                      setShowFavoritesModal(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3 text-left transition hover:border-primary"
                  >
                    <div>
                      <p className="text-base font-bold text-slate-50">
                        {fav.driver.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {fav.driver.phone}
                      </p>
                    </div>
                    <span className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary">
                      Sélectionner
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
