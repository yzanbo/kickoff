import { test } from "vitest";
import assert from "node:assert/strict";
import type { ProviderStatus } from "@shared/types";
import { canBrowserLogin } from "./ProviderLoginButton";

const codex = (extra: Partial<ProviderStatus>): ProviderStatus => ({ id: "codex", label: "Codex", implemented: true, installed: true, logged_in: false, detail: "", features: ["login"], ...extra });

test("canBrowserLogin: ブラウザでログインできる AI が、入っていてログインしていないときだけ出す", () => {
  assert.equal(canBrowserLogin(codex({})), true);
  assert.equal(canBrowserLogin(codex({ logged_in: true })), false);
  assert.equal(canBrowserLogin(codex({ installed: false })), false);
  assert.equal(canBrowserLogin(codex({ implemented: false })), false);
  assert.equal(canBrowserLogin(codex({ features: ["models"] })), false);
});
