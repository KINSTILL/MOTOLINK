import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatDoualaDateTime } from "@/lib/utils";
import ProofSuccessActions from "@/components/ProofSuccessActions";
import { ArrowLeft, CheckCircle2, FileText, ShieldCheck } from "lucide-react";

const CONFETTI_PIECES = [
  { left: "8%", delay: "0s", color: "bg-primary" },
  { left: "20%", delay: "0.2s", color: "bg-secondary" },
  { left: "34%", delay: "0.4s", color: "bg-success" },
  { left: "48%", delay: "0.1s", color: "bg-primary" },
  { left: "62%", delay: "0.3s", color: "bg-secondary" },
  { left: "76%", delay: "0.5s", color: "bg-success" },
  { left: "88%", delay: "0.15s", color: "bg-primary" },
];

export default async function ProofSuccessPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const mission = await prisma.mission.findUnique({
    where: { id: params.id },
    include: {
      proof: {
        select: {
          id: true,
          pdfUrl: true,
          proofHash: true,
          capturedAt: true,
          tsaVerified: true,
          tsaTimestamp: true,
          tsaUrl: true,
        },
      },
    },
  });

  if (!mission || !mission.proof) {
    notFound();
  }

  const { proof } = mission;

  return (
    <div className="relative space-y-6 overflow-hidden">
      {/* Confettis subtils */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 flex h-24 justify-around overflow-hidden opacity-75"
      >
        {CONFETTI_PIECES.map((piece, idx) => (
          <span
            key={idx}
            style={{
              left: piece.left,
              animationDelay: piece.delay,
            }}
            className={`h-2.5 w-2.5 rounded-full ${piece.color} animate-bounce`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Link
          href={`/missions/${mission.id}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300 transition active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Mission</span>
        </Link>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/15 px-3 py-1 text-xs font-bold text-success">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Certifié SHA-256</span>
        </span>
      </div>

      {/* Bannière principale */}
      <section className="rounded-2xl border border-success/40 bg-slate-900 p-5 text-center space-y-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/15 text-success">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-extrabold text-slate-50">
          Preuve scellée avec succès
        </h1>
        <p className="text-xs text-slate-400">
          Horodatée le {formatDoualaDateTime(proof.capturedAt)} (Africa/Douala)
        </p>
        {proof.tsaVerified && (
          <div className="pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">
              <span>🔒 Horodaté par FreeTSA</span>
            </span>
          </div>
        )}
      </section>

      {/* Hash SHA-256 en police monospace */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Empreinte cryptographique SHA-256
        </span>
        <p className="break-all rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-primary">
          {proof.proofHash}
        </p>
      </section>

      {/* Aperçu PDF */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-slate-50">
            Aperçu du certificat PDF
          </h2>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <iframe
            src={proof.pdfUrl}
            title="Certificat PDF Preuve de livraison MotoLink"
            className="h-96 w-full bg-slate-950"
          />
        </div>
      </section>

      {/* Actions : Télécharger PDF, Partager WhatsApp, Copier lien vérification */}
      <ProofSuccessActions
        missionId={mission.id}
        pdfUrl={proof.pdfUrl}
        proofHash={proof.proofHash}
        buyerPhone={mission.buyerPhone}
      />
    </div>
  );
}

