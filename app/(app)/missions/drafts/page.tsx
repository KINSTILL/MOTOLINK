import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import DraftsListClient from "./DraftsListClient";
import { ArrowLeft, FileText, PlusCircle } from "lucide-react";

export default async function VendorDraftsPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "VENDOR") {
    redirect(`/dashboard/${session.role.toLowerCase()}`);
  }

  const drafts = await prisma.mission.findMany({
    where: {
      vendorId: session.userId,
      status: "DRAFT",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      buyerName: true,
      buyerPhone: true,
      address: true,
      description: true,
      price: true,
      type: true,
      source: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/vendor"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-50">
              Brouillons en attente
            </h1>
            <p className="text-xs text-slate-400">
              {drafts.length} mission{drafts.length > 1 ? "s" : ""} à finaliser
            </p>
          </div>
        </div>

        <Link
          href="/missions/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition active:scale-95"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Nouvelle</span>
        </Link>
      </div>

      <DraftsListClient
        initialDrafts={drafts.map((d) => ({
          ...d,
          price: Number(d.price),
          createdAt: d.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}

