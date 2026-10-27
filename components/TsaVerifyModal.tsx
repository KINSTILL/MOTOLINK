"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  Lock,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

interface TsaVerifyModalProps {
  proofHash: string;
  initialOpen?: boolean;
  tsaUrl?: string | null;
  tsaTimestampIso?: string | null;
}

interface TsaApiResult {
  valid: boolean;
  tsaTimestamp: string | null;
  tsaUrl: string | null;
  tsaToken?: string | null;
}

export default function TsaVerifyModal({
  proofHash,
  initialOpen = false,
  tsaUrl,
  tsaTimestampIso,
}: TsaVerifyModalProps) {
  const [open, setOpen] = useState(initialOpen);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TsaApiResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runVerification = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/proofs/${proofHash}/tsa`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Impossible de vérifier le token TSA.");
      } else {
        setResult(data);
      }
    } catch {
      setErrorMsg("Erreur réseau lors de la vérification du token TSA.");
    } finally {
      setLoading(false);
    }
  }, [proofHash]);

  useEffect(() => {
    if (open && !result && !loading) {
      void runVerification();
    }
  }, [open, result, loading, runVerification]);

  const handleCopyToken = async () => {
    if (!result?.tsaToken) return;
    try {
      await navigator.clipboard.writeText(result.tsaToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silencieux
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-emerald-300">
          <span>🔒 Horodaté par FreeTSA</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary underline underline-offset-4 hover:text-blue-400"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Vérifier le token TSA</span>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tsa-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-50 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Lock className="h-4 w-4" />
                </div>
                <div>
                  <h2
                    id="tsa-modal-title"
                    className="text-sm font-extrabold text-slate-50"
                  >
                    Vérification RFC 3161 (TSA)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Autorité de certification temporelle externe
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-slate-100"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs font-semibold text-slate-300">
                  Décodage ASN.1 et vérification cryptographique du token TSA...
                </p>
              </div>
            ) : errorMsg ? (
              <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-xs text-danger space-y-2">
                <p className="font-bold">Erreur de vérification</p>
                <p>{errorMsg}</p>
              </div>
            ) : result ? (
              <div className="space-y-4">
                {result.valid ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3.5">
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
                    <div>
                      <p className="text-xs font-extrabold text-emerald-300">
                        Signature TSA & Empreinte SHA-256 valides
                      </p>
                      <p className="text-[11px] text-slate-300">
                        Le jeton RFC 3161 correspond exactement au hash de la
                        preuve scellée.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger/15 p-3.5">
                    <XCircle className="h-6 w-6 shrink-0 text-danger" />
                    <div>
                      <p className="text-xs font-extrabold text-danger">
                        Token TSA invalide ou non vérifiable
                      </p>
                      <p className="text-[11px] text-slate-300">
                        La signature ou l&apos;empreinte ne correspond pas.
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Autorité TSA</span>
                    <span className="inline-flex items-center gap-1 font-mono text-slate-200">
                      {result.tsaUrl || tsaUrl || "https://freetsa.org/tsr"}
                      <ExternalLink className="h-3 w-3 text-slate-500" />
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Horodatage certifié</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                      <Clock className="h-3.5 w-3.5" />
                      {result.tsaTimestamp || tsaTimestampIso
                        ? new Date(
                            (result.tsaTimestamp || tsaTimestampIso) as string
                          ).toLocaleString("fr-FR", {
                            timeZone: "Africa/Douala",
                          })
                        : "N/A"}
                    </span>
                  </div>

                  <div className="pt-1 border-t border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400">
                      Empreinte SHA-256 ancrée :
                    </span>
                    <p className="break-all font-mono text-[11px] text-slate-300">
                      {proofHash}
                    </p>
                  </div>
                </div>

                {result.tsaToken && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-400">
                        Token ASN.1 TimeStampToken (Base64)
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyToken}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span>Copié</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-mono text-[10px] text-slate-400">
                      {result.tsaToken}
                    </pre>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-slate-800 px-4 text-xs font-bold text-slate-100 hover:bg-slate-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

