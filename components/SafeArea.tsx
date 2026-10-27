import React from "react";
import { cn } from "@/lib/utils";

interface SafeAreaProps {
  children: React.ReactNode;
  className?: string;
}

export default function SafeArea({ children, className }: SafeAreaProps) {
  return (
    <div
      className={cn(
        "w-full pt-safe pb-safe pl-safe pr-safe",
        className
      )}
    >
      {children}
    </div>
  );
}

