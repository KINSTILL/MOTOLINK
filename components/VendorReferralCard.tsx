"use client";

import React, { useState } from "react";
import { Gift, UserPlus, Sparkles, Trophy } from "lucide-react";
import InviteDriverModal from "@/components/InviteDriverModal";
import { useRouter } from "next/navigation";

interface VendorReferralCardProps {
  activeCount: number;
  discountPercent: number;
  nextTarget: number;
  nextDiscount: number;
}

export default function VendorReferralCard({
  activeCount,
  discountPercent,
  nextTarget,
  nextDiscount,
}: VendorReferralCardProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  const neededMore = nextTarget - activeCount;

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-50">Parrainage</h2>
              <p className="text-xs text-slate-400">
                {activeCount} {activeCount <= 1 ? "livreur parrainé actif" : "livreurs parrainés actifs"}
              </p>
            </div>
          </div>

          {discountPercent > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
              <Sparkles className="h-3 w-3" />
              -{discountPercent}% actif
            </span>
          )}
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-xs leading-relaxed text-slate-300">
          {activeCount >= 10 ? (
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <Trophy className="h-4 w-4 shrink-0" />
              <span>Réduction maximale atteinte : -50% sur votre abonnement !</span>
            </div>
          ) : (
            <p>
              Parrainez{" "}
              <strong className="text-white">
                {neededMore} {neededMore <= 1 ? "livreur de plus" : "livreurs de plus"}
              </strong>{" "}
              pour obtenir <strong className="text-emerald-400">-{nextDiscount}%</strong> sur votre abonnement.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition active:scale-[0.98]"
        >
          <UserPlus className="h-4 w-4 text-primary" />
          <span>Inviter un livreur</span>
        </button>
      </section>

      <InviteDriverModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </>
  );
}

