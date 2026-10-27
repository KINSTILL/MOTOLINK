import { APITimeoutError, choice, TypeSafeClient } from "@typesafe-ai/sdk";
import prisma from "@/lib/prisma";
import {
  isValidJevCategory,
  JevCategory,
  JevDecisionStatus,
} from "@/lib/jev-constants";

export interface ClassifyMissionResult {
  category: JevCategory | null;
  confidence: number | null;
  status: Exclude<JevDecisionStatus, "pending">;
  latencyMs: number;
  rawResponse: unknown;
  errorMsg?: string;
}

function inferMockChoice(
  description?: string | null,
  price?: number
): {
  selected: JevCategory;
  confidence: number;
  probabilities: Record<JevCategory, number>;
} {
  const text = (description || "").toLowerCase();

  if (
    process.env.JEV_MOCK_MODE === "low_confidence" ||
    text.includes("incertain") ||
    text.includes("ambigu")
  ) {
    return {
      selected: "standard",
      confidence: 0.62,
      probabilities: {
        fragile: 0.15,
        standard: 0.62,
        volumineux: 0.13,
        urgent: 0.1,
      },
    };
  }

  if (
    /fragile|verre|gâteau|gateau|écran|ecran|bouteille|miroir|télé|tele|oeuf|assiette|parfum/.test(
      text
    )
  ) {
    return {
      selected: "fragile",
      confidence: 0.94,
      probabilities: {
        fragile: 0.94,
        standard: 0.03,
        volumineux: 0.02,
        urgent: 0.01,
      },
    };
  }

  if (
    /urgent|express|médicament|medicament|pharmacie|repas|chaud|immédiat|immediat| Sang/.test(
      text
    )
  ) {
    return {
      selected: "urgent",
      confidence: 0.95,
      probabilities: {
        fragile: 0.02,
        standard: 0.02,
        volumineux: 0.01,
        urgent: 0.95,
      },
    };
  }

  if (
    /volumineux|lourd|gaz|bonbonne|sac de riz|carton|frigo|matelas|ciment|meuble/.test(
      text
    ) ||
    (typeof price === "number" && price >= 5000)
  ) {
    return {
      selected: "volumineux",
      confidence: 0.92,
      probabilities: {
        fragile: 0.02,
        standard: 0.04,
        volumineux: 0.92,
        urgent: 0.02,
      },
    };
  }

  return {
    selected: "standard",
    confidence: 0.91,
    probabilities: {
      fragile: 0.03,
      standard: 0.91,
      volumineux: 0.04,
      urgent: 0.02,
    },
  };
}

/**
 * Classifie un colis via Jev (TypeSafe AI) en utilisant strictement `choice`.
 * Aucune modération, aucune validation, aucun blocage. Ne lève jamais d'exception.
 */
export async function classifyMission(
  description?: string | null,
  price?: number,
  photoUrls?: string[]
): Promise<ClassifyMissionResult> {
  const start = Date.now();

  try {
    const enabledRaw = (process.env.JEV_ENABLED ?? "true")
      .trim()
      .toLowerCase();
    if (enabledRaw === "false" || enabledRaw === "0" || enabledRaw === "off") {
      return {
        category: null,
        confidence: null,
        status: "disabled",
        latencyMs: 0,
        rawResponse: null,
      };
    }

    const timeoutMs = Number(process.env.JEV_TIMEOUT_MS || 2000);
    const confidenceThreshold = Number(
      process.env.JEV_CONFIDENCE_THRESHOLD || 0.85
    );
    const apiKey = process.env.JEV_API_KEY || "jev-mock-api-key";
    const baseURL = process.env.JEV_API_URL || "https://api.typesafe.ai";

    const isMockKey =
      apiKey.includes("mock") ||
      apiKey.includes("placeholder") ||
      apiKey.includes("your-") ||
      Boolean(process.env.JEV_MOCK_MODE);

    const customFetch = isMockKey
      ? async (_input: string, init?: RequestInit): Promise<Response> => {
          const mockMode = process.env.JEV_MOCK_MODE;

          if (mockMode === "timeout") {
            await new Promise((resolve, reject) => {
              const t = setTimeout(resolve, timeoutMs + 500);
              init?.signal?.addEventListener("abort", () => {
                clearTimeout(t);
                reject(new Error("AbortError"));
              });
            });
          }

          if (mockMode === "error") {
            return new Response(
              JSON.stringify({ error: { message: "Jev internal server error" } }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          const simulatedDelayMs = Number(process.env.JEV_MOCK_DELAY_MS || 180);
          await new Promise((r) => setTimeout(r, simulatedDelayMs));

          const inferred = inferMockChoice(description, price);

          return new Response(
            JSON.stringify({
              model: "jev-latest",
              answers: {
                category: {
                  type: "choice",
                  choice: inferred.selected,
                  confidence: inferred.confidence,
                  probabilities: inferred.probabilities,
                },
              },
              usage: {
                input_tokens: 48,
                output_tokens: 4,
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "x-typesafe-request-id": `req_jev_${Date.now()}`,
              },
            }
          );
        }
      : undefined;

    const client = new TypeSafeClient({
      apiKey,
      baseURL,
      timeout: timeoutMs,
      retry: { maxRetries: 0 },
      compression: false,
      logLevel: "off",
      ...(customFetch ? { fetch: customFetch } : {}),
    });

    // Appel strictement limité à Choice (aucun noul, score, ni box)
    const callPromise = client.systemOne(
      {
        state: {
          description: description || "Colis MotoLink",
          priceFCFA: price ?? 0,
          photoCount: photoUrls?.length ?? 0,
        },
        questions: {
          category: choice(
            "Classifie ce colis à livrer en moto-taxi selon sa nature logistique.",
            {
              fragile:
                "Article fragile nécessitant une manipulation délicate (verre, gâteau, électronique, écran, bouteille)",
              standard:
                "Colis courant de taille et poids standards (vêtements, chaussures, petits accessoires)",
              volumineux:
                "Colis encombrant ou lourd (carton, bonbonne, sac de riz, gros équipement)",
              urgent:
                "Course urgente ou périssable immédiate (médicaments, repas chaud, pli express)",
            }
          ),
        },
      },
      { timeout: timeoutMs, retry: { maxRetries: 0 } }
    );

    const timeoutGuard = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("__JEV_TIMEOUT__"));
      }, timeoutMs + 50);
    });

    const response = await Promise.race([callPromise, timeoutGuard]);
    const latencyMs = Date.now() - start;

    const answer = response.answers.category;
    const rawChoice = answer?.choice;
    const confidence =
      typeof answer?.confidence === "number" ? answer.confidence : 0;

    if (
      isValidJevCategory(rawChoice) &&
      confidence >= confidenceThreshold
    ) {
      return {
        category: rawChoice,
        confidence,
        status: "success",
        latencyMs,
        rawResponse: response,
      };
    }

    return {
      category: null,
      confidence,
      status: "low_confidence",
      latencyMs,
      rawResponse: response,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);

    if (
      error instanceof APITimeoutError ||
      msg.includes("__JEV_TIMEOUT__") ||
      msg.toLowerCase().includes("timeout") ||
      msg.toLowerCase().includes("abort")
    ) {
      return {
        category: null,
        confidence: null,
        status: "timeout",
        latencyMs,
        rawResponse: null,
        errorMsg: `Timeout Jev dépassé (${latencyMs}ms)`,
      };
    }

    return {
      category: null,
      confidence: null,
      status: "error",
      latencyMs,
      rawResponse: null,
      errorMsg: msg,
    };
  }
}

/**
 * Lance la classification Jev en arrière-plan (fire-and-forget) après la création d'une mission.
 * Ne bloque jamais la réponse HTTP et ne remonte jamais d'erreur.
 */
export function triggerAsyncMissionClassification(params: {
  missionId: string;
  description?: string | null;
  price: number;
  photoUrls: string[];
}): void {
  const { missionId, description, price, photoUrls } = params;

  const enabledRaw = (process.env.JEV_ENABLED ?? "true")
    .trim()
    .toLowerCase();
  const isEnabled =
    enabledRaw !== "false" && enabledRaw !== "0" && enabledRaw !== "off";

  setTimeout(async () => {
    try {
      if (!isEnabled) {
        await prisma.jevDecision.create({
          data: {
            missionId,
            category: null,
            confidence: null,
            status: "disabled",
            latencyMs: 0,
          },
        });
        return;
      }

      // Crée l'entrée JevDecision en statut "pending" pendant le traitement
      const pendingDecision = await prisma.jevDecision.create({
        data: {
          missionId,
          status: "pending",
        },
      });

      const result = await classifyMission(description, price, photoUrls);

      await prisma.jevDecision.update({
        where: { id: pendingDecision.id },
        data: {
          category: result.category,
          confidence: result.confidence,
          status: result.status,
          latencyMs: result.latencyMs,
          rawResponse: result.rawResponse
            ? JSON.parse(JSON.stringify(result.rawResponse))
            : undefined,
          errorMsg: result.errorMsg || null,
        },
      });

      if (result.status === "success" && result.category) {
        // Ne remplace pas si le vendeur a déjà modifié manuellement entre-temps
        const currentMission = await prisma.mission.findUnique({
          where: { id: missionId },
          select: { categorySource: true },
        });

        if (currentMission && currentMission.categorySource !== "manual") {
          await prisma.mission.update({
            where: { id: missionId },
            data: {
              category: result.category,
              categorySource: "jev",
            },
          });
        }
      }
    } catch (err) {
      console.error("[triggerAsyncMissionClassification] Erreur ignorée :", err);
    }
  }, 10);
}

