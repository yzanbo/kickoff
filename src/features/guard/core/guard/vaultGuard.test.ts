import assert from "node:assert/strict";
import os from "node:os";
import { test } from "vitest";
import { evaluateVaultAccess } from "./vaultGuard";

const bash = (command: string) => evaluateVaultAccess("Bash", { command }).kind;
const vault = `${os.homedir()}/Library/Keychains/nexy-release.keychain-db`;

test("evaluateVaultAccess: 金庫の場所を含むコマンドを、書き方によらず断る", () => {
  assert.equal(bash(`security unlock-keychain ${vault}`), "deny");
  assert.equal(bash("security find-identity -v -p codesigning ~/Library/Keychains/nexy-release.keychain-db"), "deny");
  assert.equal(bash('codesign --keychain "$HOME/Library/Keychains/nexy-release.keychain-db" -s F84F a.app'), "deny");
  assert.equal(bash("ls ~/Library/Keychains/ && cat nexy-release.keychain-db"), "deny");
  // 金庫でないキーチェーン・ふつうの security は通す
  assert.equal(bash("security find-identity -v -p codesigning"), "pass");
  assert.equal(bash("security create-keychain -p x /tmp/kickoff-sign-test/test.keychain-db"), "pass");
});

test("evaluateVaultAccess: 金庫を開けるスクリプト（publish・install-app）を流すのを断る", () => {
  for (const command of ["npm run publish", "npm run install-app", "npm run-script publish", "cd repo && npm run publish -- --dry", "node scripts/publish.mjs", "node ./scripts/install-app.mjs", "sh -c 'npm run install-app'", "ADHOC=1 npm run install-app"]) {
    assert.equal(bash(command), "deny", command);
  }
  // ほかのスクリプト・名前に含むだけのものは通す
  for (const command of ["npm run build", "npm publish --dry-run", "npm run test -- install-app", "node scripts/check-docs.mjs", "grep publish package.json"]) {
    assert.equal(bash(command), "pass", command);
  }
});

test("evaluateVaultAccess: ファイルのツールで金庫を読むのを断る", () => {
  assert.equal(evaluateVaultAccess("Read", { file_path: vault }).kind, "deny");
  assert.equal(evaluateVaultAccess("Grep", { path: `${os.homedir()}/Library/Keychains/nexy-release.keychain-db` }).kind, "deny");
  assert.equal(evaluateVaultAccess("Read", { file_path: "/repo/scripts/vault.mjs" }).kind, "pass");
});
