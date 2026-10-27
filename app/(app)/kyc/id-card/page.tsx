"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Upload,
} from "lucide-react";

type StepIndex = 0 | 1 | 2;

const STEPS: Array<{
  slot: "front" | "back" | "selfie";
  title: string;
  subtitle: string;
}> = [
  {
    slot: "front",
    title: "Étape 1/3 : CNI Recto",
    subtitle: "Prenez en photo la face avant de votre Carte Nationale d'Identité.",
  },
  {
    slot: "back",
    title: "Étape 2/3 : CNI Verso",
    subtitle: "Prenez en photo la face arrière de votre CNI.",
  },
  {
    slot: "selfie",
    title: "Étape 3/3 : Selfie tenant la CNI",
    subtitle:
      "Prenez un selfie de votre visage en tenant votre CNI bien lisible à côté.",
  },
];

export default function KycIdCardPage() {
  const router = useRouter();
  const [step, setStep] = useState<StepIndex>(0);
  const [keys, setKeys] = useState<{
    front?: string;
    back?: string;
    selfie?: string;
  }>({});
  const [fileNames, setFileNames] = useState<{
    front?: string;
    back?: string;
    selfie?: string;
  }>({});
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = STEPS[step];
  const currentKey = keys[currentStep.slot];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("slot", `id-${currentStep.slot}`);

      const res = await fetch("/api/kyc/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec du téléversement.");
        setUploading(false);
        return;
      }

      setKeys((prev) => ({ ...prev, [currentStep.slot]: data.key }));
      setFileNames((prev) => ({ ...prev, [currentStep.slot]: file.name }));
    } catch {
      setError("Erreur réseau lors de l'envoi du fichier.");
    } finally {
      setUploading(false);
    }
  };

  const handleNextOrSubmit = async () => {
    if (!currentKey) return;

    if (step < 2) {
      setStep((prev) => (prev + 1) as StepIndex);
      return;
    }

    if (!keys.front || !keys.back || !keys.selfie) {
      setError("Les 3 photos sont obligatoires.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/kyc/id-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontKey: keys.front,
          backKey: keys.back,
          selfieKey: keys.selfie,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible d'enregistrer votre dossier CNI.");
        setSubmitting(false);
        return;
      }

      router.push("/kyc/status");
    } catch {
      setError("Erreur réseau.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/kyc/start"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Retour</span>
        </Link>

        {/* Indicateur d'étape */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((idx) => (
            <span
              key={idx}
              className={`h-2.5 w-8 rounded-full transition ${
                idx <= step ? "bg-primary" : "bg-slate-800"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Titre de l'étape */}
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-slate-50">{currentStep.title}</h1>
        <p className="text-base text-slate-400">{currentStep.subtitle}</p>
      </div>

      {/* Zone de téléversement */}
      <div className="rounded-2xl bg-slate-900 p-6 border border-slate-800 text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          {currentKey ? (
            <CheckCircle2 className="h-9 w-9 text-success" />
          ) : (
            <Camera className="h-9 w-9" />
          )}
        </div>

        {currentKey ? (
          <div className="space-y-1">
            <p className="text-base font-semibold text-success">
              Photo chiffrée et enregistrée
            </p>
            <p className="text-xs text-slate-400">
              {fileNames[currentStep.slot]}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Formats acceptés : JPG, PNG ou WebP (chiffré de bout en bout)
          </p>
        )}

        <label className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 text-base font-semibold text-slate-50 transition active:scale-[0.98]">
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Chiffrement & envoi...</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-primary" />
              <span>
                {currentKey ? "Remplacer la photo" : "Choisir / Prendre une photo"}
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={uploading || submitting}
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      {/* Navigation entre les 3 étapes */}
      <div className="flex gap-3 pt-2">
        {step > 0 && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => setStep((prev) => (prev - 1) as StepIndex)}
            className="flex h-14 flex-1 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-base font-semibold text-slate-200"
          >
            Précédent
          </button>
        )}

        <button
          type="button"
          disabled={!currentKey || uploading || submitting}
          onClick={handleNextOrSubmit}
          className="flex h-14 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Soumission...</span>
            </>
          ) : step < 2 ? (
            <span>Étape suivante</span>
          ) : (
            <>
              <ShieldCheck className="h-5 w-5" />
              <span>Envoyer mon dossier CNI</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

