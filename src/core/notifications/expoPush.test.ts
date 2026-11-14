import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPO_PUSH_URL, expoPushBody, expoPushResult, expoPushSender } from "./expoPush.js";

const MESSAGE = { title: "調査", body: "終わりました", host_id: "host-1", target: { kind: "chat" as const, project_id: 1, chat_id: 2 } };

test("expoPushBody: 宛先・短い文・本体の ID と開くもの（会話の中身は載せない）・Android のチャンネル", () => {
  assert.deepEqual(expoPushBody("ExponentPushToken[a]", MESSAGE), {
    to: "ExponentPushToken[a]",
    title: "調査",
    body: "終わりました",
    data: { host_id: "host-1", target: { kind: "chat", project_id: 1, chat_id: 2 } },
    sound: "default",
    priority: "high",
    channelId: "chats",
  });
});

test("expoPushResult: ok は送った、DeviceNotRegistered は宛先がもう使えない、ほかの失敗は例外", () => {
  assert.equal(expoPushResult({ data: [{ status: "ok", id: "x" }] }), "sent");
  assert.equal(expoPushResult({ data: { status: "ok", id: "x" } }), "sent");
  assert.equal(expoPushResult({ data: [{ status: "error", message: "…", details: { error: "DeviceNotRegistered" } }] }), "gone");
  assert.throws(() => expoPushResult({ data: [{ status: "error", message: "MessageRateExceeded", details: { error: "MessageRateExceeded" } }] }), /MessageRateExceeded/);
  assert.throws(() => expoPushResult(null));
});

test("expoPushSender: Expo の口へ JSON で送る（アクセストークンは付けない）。Web Push の宛先はまだ送らない", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: [{ status: "ok", id: "t" }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const sender = expoPushSender(fakeFetch);
  assert.equal(await sender.send({ kind: "expo", token: "ExponentPushToken[a]" }, MESSAGE), "sent");
  assert.equal(calls[0].url, EXPO_PUSH_URL);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.authorization, undefined);
  assert.equal(JSON.parse(String(calls[0].init.body)).to, "ExponentPushToken[a]");
  assert.equal(await sender.send({ kind: "web", endpoint: "https://push.example/x", keys: { p256dh: "p", auth: "a" } }, MESSAGE), "skipped");
  assert.equal(calls.length, 1);
});
