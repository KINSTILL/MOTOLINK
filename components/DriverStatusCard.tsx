"use client";

import DriverStatusToggle, { DriverStatus } from "@/components/DriverStatusToggle";

interface DriverStatusCardProps {
  initialStatus?: DriverStatus;
  initialCanChange?: boolean;
  initialReason?: string | null;
  className?: string;
}

export default function DriverStatusCard({
  initialStatus = "OFFLINE",
  initialCanChange = true,
  initialReason = null,
  className = "",
}: DriverStatusCardProps) {
  return (
    <DriverStatusToggle
      initialStatus={initialStatus}
      initialCanChange={initialCanChange}
      initialReason={initialReason}
      className={className}
    />
  );
}
