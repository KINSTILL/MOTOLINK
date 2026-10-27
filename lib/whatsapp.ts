export interface WhatsAppResult {
  success: boolean;
  error?: string;
}

const TEMPLATE_PREVIEW: Record<string, (params: Record<string, string>) => string> = {
  mission_created: (p) =>
    `Bonjour ${p.buyerName || "Client"}, ${p.shopName || "votre vendeur"} vous envoie un colis. Suivez-le : ${p.link || ""}`,
  driver_assigned: (p) =>
    `Bonjour ${p.buyerName || "Client"}, un livreur (${p.driverName || "Livreur MotoLink"}) est en route avec votre colis ${p.shopName || ""}. Suivez-le : ${p.link || ""}`,
  delivered: (p) =>
    `Bonjour ${p.buyerName || "Client"}, votre colis ${p.shopName || ""} a été livré avec preuve certifiée MotoLink : ${p.link || ""}`,
  subscription_reminder: () =>
    "Votre abonnement expire dans 2 jours. Renouvelez pour continuer.",
  subscription_expired: () =>
    "Votre abonnement a expiré. Renouvelez pour accéder aux missions.",
  delivery_code: (p) =>
    `Bonjour ${p.buyerName || "Client"}, votre livreur arrive bientôt. Votre code de remise est : ${p.code || "----"}. Ne le donnez qu'après avoir reçu votre colis.`,
  delivery_code_resend: (p) =>
    `Bonjour ${p.buyerName || "Client"}, voici votre nouveau code de remise : ${p.code || "----"}. Ne le donnez qu'après avoir reçu votre colis.`,
  buyer_unreachable: (p) =>
    `Bonjour ${p.buyerName || "Client"}, votre livreur ${p.driverName || "Livreur MotoLink"} est arrivé (${p.shopName || "votre vendeur"}) mais n'a pas pu vous joindre. Contactez-le au plus vite pour récupérer votre colis : ${p.link || ""}`,
};

/**
 * Envoie un message WhatsApp via l'API Graph Meta (v18.0) ou en mode mock.
 * Ne lève jamais d'exception et n'expose jamais WHATSAPP_API_TOKEN côté client.
 */
export async function sendWhatsApp(
  to: string,
  template: string,
  params: Record<string, string>
): Promise<WhatsAppResult> {
  try {
    const provider = (process.env.WHATSAPP_PROVIDER || "mock").toLowerCase();

    if (
      provider === "disabled" ||
      provider === "off" ||
      process.env.WHATSAPP_ENABLED === "false" ||
      process.env.WHATSAPP_MOCK_FAIL === "true"
    ) {
      console.warn(
        `[WhatsApp] Envoi désactivé ou échec simulé vers ${to} (provider=${provider})`
      );
      return {
        success: false,
        error: "WhatsApp désactivé ou échec d'envoi",
      };
    }

    if (provider === "mock") {
      const previewFn = TEMPLATE_PREVIEW[template];
      const previewText = previewFn
        ? previewFn(params)
        : JSON.stringify(params);

      console.log("\n==========================================");
      console.log("🟢 [WHATSAPP MOCK - META BUSINESS API]");
      console.log(`📞 To       : ${to}`);
      console.log(`📋 Template : ${template}`);
      console.log(`💬 Message  : ${previewText}`);
      console.log("==========================================\n");

      return { success: true };
    }

    // Mode production : API Graph Meta POST /v18.0/{phoneNumberId}/messages
    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (
      !token ||
      !phoneNumberId ||
      token.includes("placeholder") ||
      phoneNumberId.includes("placeholder")
    ) {
      return {
        success: false,
        error: "Identifiants Meta WhatsApp (WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID) non configurés",
      };
    }

    const recipientDigits = to.replace(/\D/g, "");
    const bodyParameters = Object.values(params).map((value) => ({
      type: "text",
      text: String(value ?? ""),
    }));

    const endpoint = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientDigits,
        type: "template",
        template: {
          name: template,
          language: {
            code: "fr",
          },
          components: [
            {
              type: "body",
              parameters: bodyParameters,
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(
        `[WhatsApp Meta API] HTTP ${response.status} : ${errBody}`
      );
      return {
        success: false,
        error: `Meta WhatsApp API HTTP ${response.status}`,
      };
    }

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue WhatsApp";
    console.error("[sendWhatsApp] Exception interceptée :", message);
    return {
      success: false,
      error: message,
    };
  }
}
