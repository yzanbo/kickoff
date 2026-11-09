import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { tempDir } from "../../testing/tempDir.js";
import { geminiPackageRoot, oauthClientIn, scriptsIn } from "./geminiClient.js";

/** ファイルを作る（フォルダも作る） */
function write(root: string, rel: string, text: string) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

test("oauthClientIn: ID と秘密の値が両方あれば組で返し、片方だけなら null", () => {
  const text = `const a = "123456-abc9.apps.googleusercontent.com"; const b = "GOCSPX-fake_value";`;
  assert.deepEqual(oauthClientIn(text), { id: "123456-abc9.apps.googleusercontent.com", secret: "GOCSPX-fake_value" });
  assert.equal(oauthClientIn(`"123456-abc9.apps.googleusercontent.com"`), null);
  assert.equal(oauthClientIn(`"GOCSPX-fake_value"`), null);
});

test("geminiPackageRoot: 上へたどって、名前が Gemini CLI の package.json のフォルダを返す（ほかの package.json は飛ばす）", async () => {
  const root = tempDir();
  const pkg = path.join(root, "lib", "node_modules", "@google", "gemini-cli");
  write(pkg, "package.json", JSON.stringify({ name: "@google/gemini-cli" }));
  write(pkg, "dist/package.json", JSON.stringify({ type: "module" }));
  const bin = write(pkg, "dist/index.js", "");
  assert.equal(await geminiPackageRoot(bin), pkg);
  assert.equal(await geminiPackageRoot(write(root, "other/index.js", "")), null);
});

test("scriptsIn: 名前に oauth を含む .js を先に並べ、node_modules は根の直下の @google だけをたどる", async () => {
  const pkg = tempDir();
  write(pkg, "bundle/chunk-a.js", "");
  write(pkg, "bundle/readme.md", "");
  write(pkg, "node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js", "");
  write(pkg, "node_modules/@google/gemini-cli-core/node_modules/dep/index.js", "");
  write(pkg, "node_modules/left-pad/index.js", "");
  const rel = (await scriptsIn(pkg)).map((f) => path.relative(pkg, f));
  assert.deepEqual(rel, ["node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js", "bundle/chunk-a.js"]);
});
