import React from "react";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import SafeArea from "@/components/SafeArea";
import OfflineBanner from "@/components/OfflineBanner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      shopName: true,
      phone: true,
      role: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const displayName = user.shopName || user.name || user.phone;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-50">
      <OfflineBanner />
      <TopBar name={displayName} phone={user.phone} role={user.role} />

      <SafeArea className="flex-1 pb-24">
        <main className="mx-auto w-full max-w-md p-4">{children}</main>
      </SafeArea>

      <BottomNav role={user.role} />
    </div>
  );
}

