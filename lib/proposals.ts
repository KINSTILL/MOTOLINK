import prisma from "@/lib/prisma";

const PROPOSAL_EXPIRATION_MS = 2 * 60 * 60 * 1000; // 2 heures

/**
 * Expire automatiquement les DirectProposal PENDING créées il y a plus de 2h
 */
export async function expireStaleDirectProposals() {
  const twoHoursAgo = new Date(Date.now() - PROPOSAL_EXPIRATION_MS);
  return prisma.directProposal.updateMany({
    where: {
      status: "PENDING",
      createdAt: { lt: twoHoursAgo },
    },
    data: {
      status: "EXPIRED",
      respondedAt: new Date(),
    },
  });
}

