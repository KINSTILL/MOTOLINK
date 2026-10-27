"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Award, CheckCircle2, Loader2, Upload } from "lucide-react";

const SYNDICATES = ["SYNPROCOMON", "SYPROCOMON", "Autre"] as const;

export default function KycSyndicatePage() {
  const router = useRouter();
  const [syndicateName, setSyndicateName] =
    useState<(typeof SYNDICATES)[number]>("SYNPROCOMON");
  const [frontKey, setFrontKey] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("slot", "syndicate-card");

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

      setFrontKey(data.key);
      setFileName(file.name);
    } catch {
      setError("Erreur réseau lors du téléversement.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!frontKey || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/kyc/syndicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontKey,
          syndicateName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error || "Impossible d'envoyer votre carte de syndicat."
        );
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
      <Link
        href="/kyc/start"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Retour</span>
      </Link>

      <div>
        <h1 className="text-lg font-bold text-slate-50">
          Niveau 2 : Carte de syndicat
        </h1>
        <p className="text-base text-slate-400">
          Accessible après validation du Niveau 1 (CNI). Obtenez le badge{" "}
          <strong className="text-slate-200">🤝 Membre de syndicat</strong>.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="syndicate-select"
            className="block text-base font-medium text-slate-50"
          >
            Votre syndicat
          </label>
          <select
            id="syndicate-select"
            value={syndicateName}
            onChange={(e) =>
              setSyndicateName(e.target.value as (typeof SYNDICATES)[number])
            }
            className="h-14 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-base text-slate-50 focus:border-primary focus:outline-none"
          >
            {SYNDICATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl bg-slate-900 p-6 border border-slate-800 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
            {frontKey ? (
              <CheckCircle2 className="h-8 w-8 text-success" />
            ) : (
              <Award className="h-8 w-8" />
            )}
          </div>

          {frontKey && (
            <p className="text-sm font-semibold text-success">
              Carte téléversée ({fileName})
            </p>
          )}

          <label className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 text-base font-semibold text-slate-50">
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span>Téléversement...</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 text-primary" />
                <span>
                  {frontKey
                    ? "Changer la photo"
                    : "Téléverser la carte de syndicat"}
                </span>
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
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

        <button
          type="submit"
          disabled={!frontKey || uploading || submitting}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <span>Envoyer ma carte de syndicat</span>
          )}
        </button>
      </form>
    </div>
  );
}

