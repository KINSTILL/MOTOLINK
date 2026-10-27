"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  Compass,
  Heart,
  Navigation,
  Package,
  PlusCircle,
  Ticket,
  User,
  Users,
} from "lucide-react";
import { UserRole } from "@/lib/utils";

interface BottomNavProps {
  role: UserRole;
}

interface NavItem {
  label: string;
  href: string;
  icon: typeof Package;
}

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  VENDOR: [
    { label: "Missions", href: "/dashboard/vendor", icon: Package },
    { label: "Flotte", href: "/dashboard/vendor/fleet", icon: Users },
    { label: "Créer", href: "/missions/new", icon: PlusCircle },
    { label: "Abonnement", href: "/subscription", icon: Ticket },
    { label: "Profil", href: "/profile", icon: User },
  ],
  DRIVER: [
    { label: "Missions", href: "/missions", icon: Compass },
    { label: "En cours", href: "/missions/active", icon: Navigation },
    { label: "Historique", href: "/missions/history", icon: Clock },
    { label: "Profil", href: "/profile", icon: User },
  ],
  BUYER: [
    { label: "Mes livreurs", href: "/profile/favorite-drivers", icon: Heart },
    { label: "Profil", href: "/profile", icon: User },
  ],
};

export default function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[role] || NAV_BY_ROLE.BUYER;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 pb-safe backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/profile" && pathname.startsWith(item.href + "/"));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 text-xs font-medium transition active:scale-95 ${
                isActive ? "text-primary" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${
                  isActive ? "text-primary stroke-[2.5]" : "text-slate-400"
                }`}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

