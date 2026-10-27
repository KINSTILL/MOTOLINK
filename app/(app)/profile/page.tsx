import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import ProfileClient from "@/components/ProfileClient";
import { CarnetSettingsBlock } from "@/components/CarnetSettingsBlock";

export default async function ProfilePage() {
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
      preferredChannel: true,
      notificationChannel: true,
      sponsorDriverId: true,
      referrerBadge: true,
      city: true,
      workZones: true,
      directoryVisible: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-4">
      <ProfileClient user={user} />
      {user.role === "DRIVER" && <CarnetSettingsBlock />}
    </div>
  );
}

