"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CopyHashButtonProps {
  hash: string;
}

export default function CopyHashButton({ hash }: CopyHashButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silencieux
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-bold text-slate-100 transition hover:bg-slate-700 active:scale-95"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-emerald-300">Copié !</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5 text-primary" />
          <span>Copier</span>
        </>
      )}
    </button>
  );
}

