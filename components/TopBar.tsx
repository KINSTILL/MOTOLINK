import Link from "next/link";
import { Bike, LogOut } from "lucide-react";
import { UserRole } from "@/lib/utils";
import SyncButton from "@/components/SyncButton";

interface TopBarProps {
  name?: string | null;
  phone: string;
  role: UserRole;
}

const ROLE_LABELS: Record<UserRole, string> = {
  VENDOR: "Vendeur",
  DRIVER: "Livreur",
  BUYER: "Acheteur",
};

export default function TopBar({ name, phone, role }: TopBarProps) {
  const displayName = name || phone;

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 backdrop-blur">
      {/* Logo MotoLink à gauche */}
      <Link
        href={`/dashboard/${role.toLowerCase()}`}
        className="flex items-center gap-2"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/30">
          <Bike className="h-5 w-5" />
        </div>
        <span className="text-base font-extrabold tracking-tight text-slate-50">
          Moto<span className="text-secondary">Link</span>
        </span>
      </Link>

      {/* Nom de l'utilisateur + rôle + bouton déconnexion discret à droite */}
      <div className="flex items-center gap-2">
        <SyncButton />

        <div className="flex flex-col items-end leading-tight">
          <span className="max-w-[130px] truncate text-xs font-semibold text-slate-50">
            {displayName}
          </span>
          <span className="text-[11px] font-medium text-primary">
            {ROLE_LABELS[role]}
          </span>
        </div>

        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            title="Se déconnecter"
            aria-label="Se déconnecter"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 transition hover:text-slate-100 active:scale-95"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}

