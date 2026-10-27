"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhotoCapture from "@/components/PhotoCapture";
import SignaturePad from "@/components/SignaturePad";
import DeliveryCodeInput from "@/components/DeliveryCodeInput";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { uploadMissionProof } from "@/lib/offline-actions";

interface ProofStepperClientProps {
  missionId: string;
  missionDescription: string;
  buyerName: string;
  deliveryCodeVerified: boolean;
}

function getHighAccuracyGps(): Promise<{
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
}> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      resolve({ lat: null, lng: null, gpsAccuracy: null });
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ lat: null, lng: null, gpsAccuracy: null });
      }
    }, 10000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            gpsAccuracy: pos.coords.accuracy ?? null,
          });
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ lat: null, lng: null, gpsAccuracy: null });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

function buildDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server";
  const ua = navigator.userAgent || "unknown-ua";
  const lang = navigator.language || "fr-CM";
  const screenRes = `${window.screen?.width || 0}x${
    window.screen?.height || 0
  }`;
  const tz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Douala";
  return `${ua} | ${screenRes} | ${lang} | ${tz}`.slice(0, 480);
}

export default function ProofStepperClient({
  missionId,
  missionDescription,
  buyerName,
  deliveryCodeVerified,
}: ProofStepperClientProps) {
  const router = useRouter();

  const [codeVerified, setCodeVerified] = useState(deliveryCodeVerified);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  const handleValidateDelivery = async () => {
    if (!photoBase64 || !signatureBase64 || sealing) return;

    setSealing(true);
    setError(null);
    setOfflineNotice(null);

    try {
      // 1. GPS haute précision (timeout 10s)
      const gps = await getHighAccuracyGps();

      // 2. Device fingerprint
      const deviceFingerprint = buildDeviceFingerprint();

      // 3. Appel unifié avec gestion hors ligne et compression photo < 1 Mo
      const result = await uploadMissionProof({
        missionId,
        photoBase64,
        signatureBase64,
        lat: gps.lat,
        lng: gps.lng,
        gpsAccuracy: gps.gpsAccuracy,
        deviceFingerprint,
      });

      if (result.offline) {
        setOfflineNotice(
          result.notice ||
            "Preuve enregistrée localement. Elle sera scellée au retour du réseau."
        );
        setSealing(false);
        return;
      }

      router.push(`/missions/${missionId}/proof/success`);
      router.refresh();
    } catch (err: any) {
      setError(
        err?.message || "Impossible d'enregistrer la preuve de livraison."
      );
      setSealing(false);
    }
  };

  if (offlineNotice) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-2xl border border-warning/40 bg-slate-900 p-8 text-center animate-in fade-in-50 duration-200">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/15 text-warning">
          <WifiOff className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-50">
          Enregistré hors ligne
        </h2>
        <p className="max-w-xs text-sm text-slate-300">
          {offlineNotice}
        </p>
        <button
          onClick={() => {
            router.push(`/missions/${missionId}`);
            router.refresh();
          }}
          className="mt-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-primary/90"
        >
          Retour à la mission
        </button>
      </div>
    );
  }

  if (sealing) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-2xl border border-primary/40 bg-slate-900 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Loader2 className="h-9 w-9 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-slate-50">
          Scellement en cours...
        </h2>
        <p className="max-w-xs text-sm text-slate-400">
          Capture GPS haute précision, calcul de l&apos;empreinte SHA-256 et génération du certificat PDF opposable MotoLink.
        </p>
      </div>
    );
  }

  // Écran préalable : saisie du code de remise avant toute signature
  if (!codeVerified) {
    return (
      <DeliveryCodeInput
        missionId={missionId}
        onVerified={() => setCodeVerified(true)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Indicateur Stepper 1 / 2 / 3 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { num: 1, label: "1. Photo colis" },
          { num: 2, label: "2. Signature" },
          { num: 3, label: "3. Scellement" },
        ].map((item) => {
          const isCurrent = step === item.num;
          const isDone = step > item.num;
          return (
            <div
              key={item.num}
              className={`flex h-10 items-center justify-center rounded-xl border text-xs font-bold ${
                isCurrent
                  ? "border-primary bg-primary/20 text-primary"
                  : isDone
                  ? "border-success/40 bg-success/15 text-success"
                  : "border-slate-800 bg-slate-900 text-slate-500"
              }`}
            >
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-danger/50 bg-danger/10 p-4 text-sm font-semibold text-danger">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ÉTAPE 1 — Photo du colis */}
      {step === 1 && (
        <PhotoCapture
          initialPhotoBase64={photoBase64}
          onConfirm={(base64) => {
            setPhotoBase64(base64);
            setStep(2);
          }}
        />
      )}

      {/* ÉTAPE 2 — Signature acheteur */}
      {step === 2 && (
        <SignaturePad
          onBack={() => setStep(1)}
          onConfirm={(sigBase64) => {
            setSignatureBase64(sigBase64);
            setStep(3);
          }}
        />
      )}

      {/* ÉTAPE 3 — Scellement */}
      {step === 3 && photoBase64 && signatureBase64 && (
        <div className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-50">
              Étape 3/3 — Scellement de la preuve
            </h2>
            <p className="text-sm text-slate-400">
              Vérifiez la photo et la signature de{" "}
              <span className="font-semibold text-slate-200">{buyerName}</span>{" "}
              pour <span className="font-semibold text-slate-200">{missionDescription}</span>.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-400">
                Photo du colis
              </span>
              <div className="aspect-square overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoBase64}
                  alt="Colis"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-400">
                Signature client
              </span>
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signatureBase64}
                  alt="Signature"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <Lock className="h-4 w-4" />
              <span>Scellement cryptographique SHA-256</span>
            </div>
            <p className="text-slate-400">
              En appuyant sur « Valider la livraison », votre position GPS haute précision, l&apos;empreinte de votre appareil et l&apos;horodatage serveur seront scellés dans un PDF infalsifiable avec QR Code.
            </p>
          </div>

          <button
            type="button"
            onClick={handleValidateDelivery}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-success px-4 text-base font-bold text-white shadow-lg shadow-success/25 transition active:scale-[0.98]"
          >
            <ShieldCheck className="h-5 w-5" />
            <span>Valider la livraison</span>
          </button>

          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full py-2 text-center text-xs font-medium text-slate-400 underline"
          >
            Modifier la signature ou la photo
          </button>
        </div>
      )}
    </div>
  );
}

