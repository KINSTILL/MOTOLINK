import LegalLinks from "@/components/LegalLinks";

interface FooterProps {
  className?: string;
}

export default function Footer({ className = "" }: FooterProps) {
  return (
    <footer
      className={`border-t border-slate-800/80 py-6 text-center space-y-2.5 ${className}`}
    >
      <LegalLinks />
      <p className="text-xs text-slate-400">
        MotoLink est un constat de fait, pas une garantie de paiement ou de
        qualité.
      </p>
      <p className="text-xs font-semibold text-slate-500">
        Propulsé par MotoLink
      </p>
    </footer>
  );
}

