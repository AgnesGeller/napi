import assert from "node:assert/strict";
import { pendingSubscriptions, pushFailureType } from "../supabase/functions/napi-send-reminders/delivery-state.mjs";

const phones = [
  { id: "phone-a", endpoint: "a" },
  { id: "phone-b", endpoint: "b" }
];

// Az első kör részleges sikere után kizárólag a sikertelen telefon próbálkozhat újra.
const firstAttempt = pendingSubscriptions(phones, []);
assert.deepEqual(firstAttempt.map(phone => phone.id), ["phone-a", "phone-b"]);
const secondAttempt = pendingSubscriptions(phones, ["phone-a"]);
assert.deepEqual(secondAttempt.map(phone => phone.id), ["phone-b"]);

assert.equal(pushFailureType(410), "permanent");
assert.equal(pushFailureType(404), "permanent");
assert.equal(pushFailureType(429), "retry");
assert.equal(pushFailureType(503), "retry");
assert.equal(pushFailureType(0), "retry");

// A kézbesített azonosítólista hiánya se okozzon ismételt küldést ugyanarra az eszközre.
assert.deepEqual(pendingSubscriptions(phones, ["phone-a", "phone-b"]), []);

console.log("Részleges értesítéskézbesítés viselkedési regressziós teszt: OK");
