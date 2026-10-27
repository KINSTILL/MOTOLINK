"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Star } from "lucide-react";
import RatingModal from "@/components/RatingModal";

interface RateMissionButtonProps {
  missionId: string;
  targetName: string;
  alreadyRated: boolean;
}

/** Bouton « Noter » affiché sur une mission livrée tant que l'utilisateur n'a pas noté. */
export default function RateMissionButton({
  missionId,
  targetName,
  alreadyRated,
}: RateMissionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rated, setRated] = useState(alreadyRated);

  if (rated) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/10 p-3 text-sm font-semibold text-success">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <span>Merci, votre note a bien été enregistrée.</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-base font-bold text-slate-950 shadow-lg shadow-secondary/20 transition active:scale-[0.98]"
      >
        <Star className="h-5 w-5" />
        <span>Noter {targetName}</span>
      </button>

      {open && (
        <RatingModal
          missionId={missionId}
          targetName={targetName}
          onClose={() => setOpen(false)}
          onRated={() => {
            setRated(true);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

