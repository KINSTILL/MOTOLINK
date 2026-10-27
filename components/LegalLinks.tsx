import Link from "next/link";

interface LegalLinksProps {
  className?: string;
}

export default function LegalLinks({ className = "" }: LegalLinksProps) {
  return (
    <nav
      aria-label="Liens juridiques MotoLink"
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-slate-400 ${className}`}
    >
      <Link
        href="/legal/cgu"
        className="underline underline-offset-4 transition hover:text-slate-100"
      >
        CGU
      </Link>
      <span aria-hidden="true" className="text-slate-700">
        •
      </span>
      <Link
        href="/legal/privacy"
        className="underline underline-offset-4 transition hover:text-slate-100"
      >
        Politique de confidentialité
      </Link>
      <span aria-hidden="true" className="text-slate-700">
        •
      </span>
      <Link
        href="/legal/mentions"
        className="underline underline-offset-4 transition hover:text-slate-100"
      >
        Mentions légales
      </Link>
    </nav>
  );
}

