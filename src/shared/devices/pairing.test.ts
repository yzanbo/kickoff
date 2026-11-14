import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPairingCode, pairingLink } from "./pairing";

test("pairingLink: つなぐ先の後ろに /pair と番号・本体の ID。つなぐ先がなければ null", () => {
  assert.equal(pairingLink("https://mac.example.ts.net/", "123456", "abc"), "https://mac.example.ts.net/pair?code=123456&host=abc");
  assert.equal(pairingLink("http://192.168.1.2:4317", "000001", "id"), "http://192.168.1.2:4317/pair?code=000001&host=id");
  assert.equal(pairingLink(null, "123456", "abc"), null);
  assert.equal(formatPairingCode("123456"), "123-456");
});
