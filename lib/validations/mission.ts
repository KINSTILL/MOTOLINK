import { z } from "zod";
import { normalizePhone } from "@/lib/utils";

export const MISSION_TYPES = [
  "PARCEL",
  "GAS",
  "GROCERIES",
  "OTHER",
] as const;

export type MissionTypeValue = (typeof MISSION_TYPES)[number];

export const MISSION_TYPE_OPTIONS: Array<{
  value: MissionTypeValue;
  label: string;
  shortBadge: string;
  emoji: string;
}> = [
  {
    value: "PARCEL",
    label: "📦 Colis standard",
    shortBadge: "📦 Colis",
    emoji: "📦",
  },
  {
    value: "GAS",
    label: "🔥 Bonbonne de gaz",
    shortBadge: "🔥 Gaz",
    emoji: "🔥",
  },
  {
    value: "GROCERIES",
    label: "🛒 Courses",
    shortBadge: "🛒 Courses",
    emoji: "🛒",
  },
  {
    value: "OTHER",
    label: "📋 Autre marchandise",
    shortBadge: "📋 Autre",
    emoji: "📋",
  },
];

export function getMissionTypeBadge(type?: string | null): string {
  const found = MISSION_TYPE_OPTIONS.find((o) => o.value === type);
  return found ? found.shortBadge : "📦 Colis";
}

export function getMissionTypeFullLabel(type?: string | null): string {
  const found = MISSION_TYPE_OPTIONS.find((o) => o.value === type);
  return found ? found.label : "📦 Colis standard";
}

export const createMissionSchema = z
  .object({
    buyerName: z
      .string()
      .trim()
      .max(100, "Nom trop long")
      .optional()
      .or(z.literal("")),
    buyerPhone: z
      .string()
      .transform((val) => normalizePhone(val))
      .refine((val) => /^\+237\d{9}$/.test(val), {
        message: "Le numéro doit être au format +237XXXXXXXXX (9 chiffres)",
      }),
    address: z
      .string()
      .trim()
      .min(10, "L'adresse doit contenir au moins 10 caractères"),
    articlePhotoUrls: z
      .array(z.string().min(1))
      .min(1, "Ajoutez au moins 1 photo de l'article")
      .max(2, "Maximum 2 photos autorisées"),
    description: z
      .string()
      .trim()
      .max(200, "La description ne peut pas dépasser 200 caractères")
      .optional()
      .or(z.literal("")),
    price: z.coerce
      .number({
        invalid_type_error: "Veuillez saisir un montant valide",
      })
      .gt(0, "Le prix proposé doit être supérieur à 0 FCFA"),
    type: z.enum(MISSION_TYPES).default("PARCEL"),
    gasCertified: z.boolean().optional().default(false),
    preferredDriverId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .or(z.literal("")),
    scheduledAt: z
      .string()
      .trim()
      .optional()
      .nullable()
      .or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.type === "GAS" && !data.gasCertified) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gasCertified"],
        message: "Certification gaz obligatoire",
      });
    }
  });

export type CreateMissionInput = z.infer<typeof createMissionSchema>;
