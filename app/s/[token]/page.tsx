import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";

export default async function ShortTrackingRedirectPage({
  params,
}: {
  params: { token: string };
}) {
  const mission = await prisma.mission.findFirst({
    where: {
      OR: [{ publicToken: params.token }, { id: params.token }],
    },
    select: { id: true },
  });

  if (!mission) {
    notFound();
  }

  redirect(`/suivi/${mission.id}`);
}
