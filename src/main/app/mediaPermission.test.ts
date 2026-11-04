import assert from "node:assert/strict";
import { test } from "node:test";
import { permissionAllowed, permissionCheckAllowed } from "./mediaPermission.js";

const appUrl = "http://127.0.0.1:4318";

test("マイクの許可: アプリ自身の画面からの音声だけ許し、カメラ・ほかの出どころは断る", () => {
  assert.equal(permissionAllowed({ permission: "media", requestingUrl: "http://127.0.0.1:4318/#/projects/1", appUrl, mediaTypes: ["audio"] }), true);
  assert.equal(permissionAllowed({ permission: "media", requestingUrl: "http://127.0.0.1:4318/", appUrl, mediaTypes: ["audio", "video"] }), false);
  assert.equal(permissionAllowed({ permission: "media", requestingUrl: "http://127.0.0.1:4318/", appUrl, mediaTypes: [] }), false);
  assert.equal(permissionAllowed({ permission: "media", requestingUrl: "https://example.com/", appUrl, mediaTypes: ["audio"] }), false);
  assert.equal(permissionAllowed({ permission: "media", requestingUrl: "http://127.0.0.1:4317/", appUrl, mediaTypes: ["audio"] }), false);
  assert.equal(permissionAllowed({ permission: "media", requestingUrl: "", appUrl, mediaTypes: ["audio"] }), false);
});

test("マイクの許可: media 以外（通知など）はこれまでどおり許す", () => {
  assert.equal(permissionAllowed({ permission: "notifications", requestingUrl: appUrl, appUrl }), true);
  assert.equal(permissionCheckAllowed({ permission: "clipboard-sanitized-write", requestingOrigin: appUrl, appUrl }), true);
});

test("許可の確かめ: アプリ自身の画面からのマイクは許し、カメラ・ほかの出どころは断る", () => {
  assert.equal(permissionCheckAllowed({ permission: "media", requestingOrigin: "http://127.0.0.1:4318", appUrl, mediaType: "audio" }), true);
  assert.equal(permissionCheckAllowed({ permission: "media", requestingOrigin: "http://127.0.0.1:4318", appUrl, mediaType: "video" }), false);
  assert.equal(permissionCheckAllowed({ permission: "media", requestingOrigin: "http://localhost:5173", appUrl, mediaType: "audio" }), false);
});
