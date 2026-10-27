import {
  isValidJevCategory,
  JEV_CATEGORY_META,
} from "@/lib/jev-constants";

interface MissionCategoryBadgeProps {
  category?: string | null;
}

export default function MissionCategoryBadge({
  category,
}: MissionCategoryBadgeProps) {
  if (!isValidJevCategory(category)) {
    return null;
  }

  const meta = JEV_CATEGORY_META[category];

  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-bold ${meta.badgeClass}`}
    >
      {meta.badgeText}
    </span>
  );
}

