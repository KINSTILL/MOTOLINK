export const JEV_CATEGORIES = [
  "fragile",
  "standard",
  "volumineux",
  "urgent",
] as const;

export type JevCategory = (typeof JEV_CATEGORIES)[number];

export type JevDecisionStatus =
  | "pending"
  | "success"
  | "low_confidence"
  | "timeout"
  | "error"
  | "disabled";

export const JEV_CGU_ARTICLE_4BIS =
  "La classification est fournie à titre indicatif. Ni validation, ni garantie, ni décision. Le vendeur peut la modifier. La plateforme ne peut être tenue responsable.";

export const JEV_CATEGORY_META: Record<
  JevCategory,
  {
    label: string;
    emoji: string;
    badgeText: string;
    badgeClass: string;
  }
> = {
  fragile: {
    label: "Fragile",
    emoji: "🟠",
    badgeText: "🟠 Fragile",
    badgeClass:
      "border-orange-500/40 bg-orange-500/15 text-orange-400",
  },
  standard: {
    label: "Standard",
    emoji: "🔵",
    badgeText: "🔵 Standard",
    badgeClass: "border-blue-500/40 bg-blue-500/15 text-blue-400",
  },
  volumineux: {
    label: "Volumineux",
    emoji: "🟣",
    badgeText: "🟣 Volumineux",
    badgeClass:
      "border-purple-500/40 bg-purple-500/15 text-purple-400",
  },
  urgent: {
    label: "Urgent",
    emoji: "🔴",
    badgeText: "🔴 Urgent",
    badgeClass: "border-red-500/40 bg-red-500/15 text-red-400",
  },
};

export function isValidJevCategory(value: unknown): value is JevCategory {
  return (
    typeof value === "string" &&
    (JEV_CATEGORIES as readonly string[]).includes(value)
  );
}

