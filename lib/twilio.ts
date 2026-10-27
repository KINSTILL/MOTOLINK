import { normalizePhone } from "@/lib/utils";

export interface SmsResult {
  success: boolean;
  error?: string;
}

const E164_CAMEROON_REGEX = /^\+237\d{9}$/;

/**
 * Envoie un SMS au format E.164 (+237XXXXXXXXX) via Twilio, passerelle locale ou mode mock.
 * Ne lève jamais d'exception.
 */
export async function sendSms(to: string, message: string): Promise<SmsResult> {
  try {
    const formattedTo = normalizePhone(to);

    if (!E164_CAMEROON_REGEX.test(formattedTo)) {
      return {
        success: false,
        error: `Numéro invalide au format E.164 Cameroun (+237XXXXXXXXX) : ${to}`,
      };
    }

    const smsProvider = (process.env.SMS_PROVIDER || "mock").toLowerCase();
    const isMock =
      process.env.SMS_MOCK === "true" || smsProvider === "mock";

    if (
      smsProvider === "disabled" ||
      smsProvider === "off" ||
      process.env.SMS_MOCK_FAIL === "true"
    ) {
      console.warn(
        `[SMS] Envoi désactivé ou échec simulé vers ${formattedTo}`
      );
      return {
        success: false,
        error: "Échec d'envoi SMS",
      };
    }

    if (isMock || smsProvider === "local") {
      console.log("\n==========================================");
      console.log(
        `🔵 [SMS ${isMock ? "MOCK" : "LOCAL"} - E.164]`
      );
      console.log(`📞 To      : ${formattedTo}`);
      console.log(`💬 Message : ${message}`);
      console.log("==========================================\n");

      return { success: true };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (
      !accountSid ||
      !authToken ||
      !from ||
      accountSid.includes("00000000") ||
      authToken.includes("placeholder")
    ) {
      return {
        success: false,
        error: "Identifiants Twilio (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER) non configurés",
      };
    }

    const twilioModule = await import("twilio");
    const twilioFactory = twilioModule.default || twilioModule;
    const client = twilioFactory(accountSid, authToken);

    await client.messages.create({
      body: message,
      from,
      to: formattedTo,
    });

    return { success: true };
  } catch (error) {
    const errMessage =
      error instanceof Error ? error.message : "Erreur inconnue SMS Twilio";
    console.error("[sendSms] Exception interceptée :", errMessage);
    return {
      success: false,
      error: errMessage,
    };
  }
}

