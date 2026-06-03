import test from "node:test";
import assert from "node:assert/strict";
import { parseClientMessage } from "@/lib/agents/onboarding_protocol";

test("parseClientMessage accepts onboarding user_turn payloads", () => {
  const msg = parseClientMessage(
    JSON.stringify({
      type: "user_turn",
      agent: "onboarding",
      message: "Help me onboard my bakery",
      lat: 37.7,
      lng: -122.4,
      history: [{ role: "user", content: "hi" }],
    }),
  );
  assert.deepEqual(msg, {
    type: "user_turn",
    agent: "onboarding",
    message: "Help me onboard my bakery",
    lat: 37.7,
    lng: -122.4,
    history: [{ role: "user", content: "hi" }],
  });
});

test("parseClientMessage rejects malformed payloads", () => {
  const msg = parseClientMessage(
    JSON.stringify({
      type: "user_turn",
      agent: "concierge",
      message: "wrong agent",
    }),
  );
  assert.equal(msg, null);
});
