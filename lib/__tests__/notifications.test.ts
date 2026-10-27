import assert from "node:assert/strict";
import { sendNotification } from "@/lib/notifications";

async function runNotificationTests() {
  console.log("🚀 Exécution des tests du système de notification multicanal...\n");

  const params = {
    buyerName: "Jean-Marc",
    shopName: "Boutique Akwa",
    link: "https://motolink.cm/s/test-token-123",
  };

  // TEST 1 : Mock WhatsApp succès → retourne channel = "whatsapp"
  process.env.WHATSAPP_PROVIDER = "mock";
  delete process.env.WHATSAPP_MOCK_FAIL;
  process.env.SMS_PROVIDER = "mock";
  process.env.SMS_MOCK = "true";
  delete process.env.SMS_MOCK_FAIL;

  const res1 = await sendNotification(
    "+237690112233",
    "mission_created",
    params,
    "whatsapp"
  );
  assert.equal(res1.success, true, "Test 1: success doit être true");
  assert.equal(res1.channel, "whatsapp", "Test 1: channel doit être 'whatsapp'");
  console.log("✅ TEST 1 PASSÉ : Mock WhatsApp succès → channel = 'whatsapp'");

  // TEST 2 : Mock WhatsApp échec → Fallback automatique vers SMS → retourne channel = "sms"
  process.env.WHATSAPP_PROVIDER = "mock";
  process.env.WHATSAPP_MOCK_FAIL = "true";
  process.env.SMS_PROVIDER = "mock";
  process.env.SMS_MOCK = "true";
  delete process.env.SMS_MOCK_FAIL;

  const res2 = await sendNotification(
    "+237690112233",
    "mission_created",
    params,
    "whatsapp"
  );
  assert.equal(res2.success, true, "Test 2: success doit être true après fallback SMS");
  assert.equal(res2.channel, "sms", "Test 2: channel doit être 'sms' (fallback)");
  console.log("✅ TEST 2 PASSÉ : Mock WhatsApp échec → fallback SMS (channel = 'sms')");

  // TEST 3 : Mock SMS échec → retourne { success: false } sans lever d'exception
  process.env.WHATSAPP_PROVIDER = "mock";
  process.env.WHATSAPP_MOCK_FAIL = "true";
  process.env.SMS_PROVIDER = "mock";
  process.env.SMS_MOCK = "true";
  process.env.SMS_MOCK_FAIL = "true";

  const res3 = await sendNotification(
    "+237690112233",
    "mission_created",
    params,
    "sms"
  );
  assert.equal(res3.success, false, "Test 3: success doit être false quand SMS échoue");
  assert.equal(res3.channel, "sms", "Test 3: channel doit être 'sms'");
  console.log("✅ TEST 3 PASSÉ : Mock SMS échec → { success: false } sans exception\n");

  console.log("🎉 Tous les tests multicanaux (WhatsApp + Fallback SMS) sont passés avec succès !");
}

runNotificationTests().catch((err) => {
  console.error("❌ Échec des tests :", err);
  process.exit(1);
});

