import { sendWhatsApp } from "@/lib/whatsapp";
import { sendSms } from "@/lib/twilio";

export type Channel = "whatsapp" | "sms";

export type NotificationTemplate =
  | "mission_created"
  | "driver_assigned"
  | "delivered";

export interface SendNotificationResult {
  success: boolean;
  channel: Channel;
  error?: string;
}

export const NOTIF_CGU_TEXT =
  "Le vendeur consent à l'envoi d'une notification à l'acheteur via le canal choisi. MotoLink agit pour le compte du vendeur. Uniquement transactionnel, jamais marketing.";

const TEMPLATES: Record<string, string> = {
  mission_created:
    "Bonjour {buyerName}, {shopName} vous envoie un colis. Suivez-le : {link}",
  driver_assigned:
    "Bonjour {buyerName}, un livreur ({driverName}) a pris en charge votre colis {shopName}. Suivez-le : {link}",
  delivered:
    "Bonjour {buyerName}, votre colis {shopName} a été livré avec preuve certifiée MotoLink : {link}",
  subscription_reminder:
    "Votre abonnement expire dans 2 jours. Renouvelez pour continuer : {link}",
  subscription_expired:
    "Votre abonnement a expiré. Renouvelez pour accéder aux missions : {link}",
  offline_reminder:
    "Bonjour {driverName}, {shopName} a une livraison pour vous. Êtes-vous disponible ? Ouvrez MotoLink pour passer en Disponible : {link}",
  vendor_invite:
    "Bonjour {driverName}, {shopName} vous invite à rejoindre MotoLink. Votre abonnement est offert par {shopName}.\n\n⚠️ Important : {shopName} n'est pas votre employeur. Vous restez un livreur indépendant, libre d'accepter ou de refuser toute mission, et de travailler pour d'autres vendeurs.\n\nCliquez pour activer : {link}",
  driver_referral_used:
    "Bonjour {driverName}, {refereeName} a utilisé votre code. Vous recevrez un badge quand il aura complété 5 livraisons.",
  driver_referral_milestone_5:
    "Bonjour {driverName}, {refereeName} a complété 5 livraisons. Vous avez le badge Parrain.",
  driver_referral_milestone_20:
    "Bonjour {driverName}, {refereeName} a complété 20 livraisons. Vous avez le badge Parrain confirmé.",
  directory_contact_request:
    "{shopName} souhaite vous confier une mission. Ouvrez MotoLink pour accepter ou refuser. {link}",
  directory_contact_accepted:
    "{driverName} a accepté votre demande de contact. Il a rejoint votre flotte, son numéro est maintenant visible dans MotoLink : {link}",
  directory_contact_refused:
    "{driverName} ne peut pas donner suite à votre demande de contact pour le moment. D'autres livreurs sont disponibles dans l'annuaire MotoLink : {link}",
  scheduled_mission_reminder_day_before:
    "Rappel MotoLink : Vous avez une mission programmée demain à {scheduledTime} pour {shopName} : {link}",
  scheduled_mission_reminder_one_hour:
    "Rappel MotoLink : Votre mission pour {shopName} commence dans 1 heure ({scheduledTime}) : {link}",
  scheduled_mission_reminder_due:
    "MotoLink : C'est l'heure ! Votre livraison programmée pour {shopName} doit démarrer : {link}",
  scheduled_mission_rescheduled:
    "MotoLink : Votre mission pour {shopName} a été reprogrammée au {scheduledDate} à {scheduledTime} : {link}",
  scheduled_mission_cancelled:
    "MotoLink : La mission programmée pour {shopName} prévue le {scheduledDate} à {scheduledTime} a été annulée.",
  draft_received:
    "MotoLink : Nouveau brouillon de livraison reçu de {buyerName}. Rendez-vous dans votre espace pour le finaliser : {link}",
  buyer_confirm_request:
    "Bonjour {buyerName}, {shopName} prépare votre commande. Confirmez-vous votre adresse et votre disponibilité ? {link}",
  delivery_code:
    "Bonjour {buyerName}, votre livreur arrive bient\u00f4t. Votre code de remise est : {code}. Ne le donnez qu'apr\u00e8s avoir re\u00e7u votre colis.",
  delivery_code_resend:
    "Bonjour {buyerName}, voici votre nouveau code de remise : {code}. Ne le donnez qu'apr\u00e8s avoir re\u00e7u votre colis.",
  delivery_code_request:
    "MotoLink : Le livreur {driverName} attend le code de remise pour la livraison de {buyerName}. Renvoyez un nouveau code depuis votre espace mission.",
  buyer_unreachable:
    "Bonjour {buyerName}, votre livreur {driverName} est arrivé ({shopName}) mais n'a pas pu vous joindre. Contactez-le au plus vite pour récupérer votre colis : {link}",
};

/**
 * Construit le message texte final à partir du nom de template et des paramètres.
 */
export function renderNotificationTemplate(
  template: string,
  params: Record<string, string>
): string {
  const raw =
    TEMPLATES[template] ||
    TEMPLATES.mission_created;

  return raw.replace(/\{(\w+)\}/g, (_match, key: string) => {
    return params[key] ?? "";
  });
}

/**
 * Normalise le canal préféré ("whatsapp" | "sms")
 */
export function normalizeChannel(input?: string | null): Channel {
  const raw = (
    input ||
    process.env.NOTIF_CHANNEL_DEFAULT ||
    "whatsapp"
  )
    .trim()
    .toLowerCase();

  return raw === "sms" ? "sms" : "whatsapp";
}

/**
 * Construit le lien court de suivi public : https://motolink.cm/s/{publicToken}
 */
export function buildShortTrackingLink(publicToken: string): string {
  return `https://motolink.cm/s/${publicToken}`;
}

/**
 * Construit le lien de confirmation acheteur : https://motolink.cm/confirm/{missionId}/{token}
 */
export function buildBuyerConfirmLink(missionId: string, token: string): string {
  return `https://motolink.cm/confirm/${missionId}/${token}`;
}

/**
 * Envoie une notification multicanale (WhatsApp par défaut, fallback SMS automatique si WhatsApp échoue).
 * Ne lève jamais d'exception.
 */
export async function sendNotification(
  to: string,
  template: NotificationTemplate | string,
  params: Record<string, string | null | undefined>,
  preferredChannel?: Channel | string | null
): Promise<SendNotificationResult> {
  const targetChannel = normalizeChannel(preferredChannel);

  try {
    const cleanParams: Record<string, string> = {
      buyerName: (params.buyerName && params.buyerName.trim()) || "Client",
      shopName:
        (params.shopName && params.shopName.trim()) || "votre vendeur MotoLink",
      driverName:
        (params.driverName && params.driverName.trim()) || "Livreur MotoLink",
      link: (params.link && params.link.trim()) || "",
    };

    for (const [k, v] of Object.entries(params)) {
      if (!(k in cleanParams) && v !== undefined && v !== null) {
        cleanParams[k] = String(v);
      }
    }

    const messageText = renderNotificationTemplate(template, cleanParams);

    if (targetChannel === "whatsapp") {
      const waResult = await sendWhatsApp(to, template, cleanParams);
      if (waResult.success) {
        return {
          success: true,
          channel: "whatsapp",
        };
      }

      console.warn(
        `[sendNotification] WhatsApp a échoué (${waResult.error || "erreur"}) → Fallback automatique vers SMS pour ${to}`
      );

      const smsFallback = await sendSms(to, messageText);
      if (smsFallback.success) {
        return {
          success: true,
          channel: "sms",
        };
      }

      return {
        success: false,
        channel: "sms",
        error:
          smsFallback.error ||
          waResult.error ||
          "Échec WhatsApp et fallback SMS",
      };
    }

    // Canal SMS direct
    const smsResult = await sendSms(to, messageText);
    if (smsResult.success) {
      return {
        success: true,
        channel: "sms",
      };
    }

    return {
      success: false,
      channel: "sms",
      error: smsResult.error || "Échec d'envoi SMS",
    };
  } catch (error) {
    const errMessage =
      error instanceof Error
        ? error.message
        : "Erreur interne sendNotification";
    console.error("[sendNotification] Exception interceptée :", errMessage);
    return {
      success: false,
      channel: targetChannel,
      error: errMessage,
    };
  }
}
