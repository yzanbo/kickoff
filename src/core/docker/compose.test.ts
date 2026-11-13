// compose のファイルの探し方・up に渡すファイルの選び方・設定を覚える口（AI の Docker の守りの組の名前も同じ読み方）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fakeDocker } from "../testing/fakeDocker.js";
import { tempDir } from "../testing/tempDir.js";
import { DockerCli } from "./cli.js";
import { ComposeConfigCache, findComposeFiles, upFilesFor } from "./compose.js";

/** root の下に、相対パスのファイルを置く */
function place(root: string, files: Record<string, string>) {
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
}

test("findComposeFiles: 直下の決まった名前と別名（override は除く）、2 段下までのフォルダの決まった名前。依存・「.」のフォルダと 3 段下は見ない", () => {
  const root = tempDir();
  place(root, {
    "compose.yaml": "",
    "compose.override.yaml": "",
    "compose.e2e.yaml": "",
    "docker-compose.ci.yml": "",
    "notes.yaml": "",
    "infra/docker-compose.yml": "",
    "infra/db/compose.yaml": "",
    "infra/db/deep/compose.yaml": "",
    "node_modules/pkg/compose.yaml": "",
    ".devcontainer/compose.yaml": "",
    "dist/compose.yaml": "",
    // 下のフォルダの別名は探さない
    "infra/compose.e2e.yaml": "",
  });
  assert.deepEqual(
    findComposeFiles(root).map((f) => path.relative(root, f)),
    ["compose.e2e.yaml", "compose.yaml", "docker-compose.ci.yml", "infra/db/compose.yaml", "infra/docker-compose.yml"],
  );
  assert.deepEqual(findComposeFiles(path.join(root, "nothing")), []);
});

test("upFilesFor: .env の COMPOSE_FILE に見つけたファイルがあればその並び、なければ決まった名前にだけ同じ系統の override を足す", () => {
  const root = tempDir();
  place(root, { "compose.yaml": "", "compose.override.yml": "", "docker-compose.yml": "", "docker-compose.override.yaml": "", "compose.e2e.yaml": "" });
  const at = (n: string) => path.join(root, n);
  assert.deepEqual(upFilesFor(at("compose.yaml")), [at("compose.yaml"), at("compose.override.yml")]);
  assert.deepEqual(upFilesFor(at("docker-compose.yml")), [at("docker-compose.yml"), at("docker-compose.override.yaml")]);
  // 別名の compose には override を重ねない
  assert.deepEqual(upFilesFor(at("compose.e2e.yaml")), [at("compose.e2e.yaml")]);
  // COMPOSE_FILE に入っていればその並び（override は足さない）、入っていなければ今までどおり
  fs.writeFileSync(at(".env"), "COMPOSE_FILE=compose.yaml:compose.e2e.yaml\n");
  assert.deepEqual(upFilesFor(at("compose.yaml")), [at("compose.yaml"), at("compose.e2e.yaml")]);
  assert.deepEqual(upFilesFor(at("docker-compose.yml")), [at("docker-compose.yml"), at("docker-compose.override.yaml")]);
});

test("ComposeConfigCache: 同じファイルなら覚えた設定を返し、ファイル・.env が変わったら・clear したら聞き直す。読めなければ標準エラーを error に", async () => {
  const docker = fakeDocker();
  docker.set([{ match: "config --format json", stdout: JSON.stringify({ name: "app", services: { db: { image: "postgres:16" } } }) }]);
  const cache = new ComposeConfigCache(new DockerCli(() => docker.bin));
  const root = tempDir();
  place(root, { "compose.yaml": "services: {}\n" });
  const files = [path.join(root, "compose.yaml")];
  const configCalls = () => docker.calls().filter((c) => c.args.includes("config")).length;

  assert.equal((await cache.read(files, false)).config?.name, "app");
  assert.equal((await cache.read(files, false)).config?.name, "app");
  assert.equal(configCalls(), 1, "同じなら聞き直さない");
  // .env を足すと鍵が変わる
  fs.writeFileSync(path.join(root, ".env"), "X=1\n");
  await cache.read(files, false);
  assert.equal(configCalls(), 2);
  cache.clear();
  await cache.read(files, false);
  assert.equal(configCalls(), 3);
  assert.deepEqual(docker.calls().find((c) => c.args.includes("config"))?.args, ["compose", "-f", files[0], "--profile", "*", "config", "--format", "json"]);

  docker.set([{ match: "config --format json", code: 1, stderr: "line 1\nservices.db.image must be a string\n" }]);
  cache.clear();
  const bad = await cache.read(files, false);
  assert.equal(bad.config, null);
  assert.match(bad.error ?? "", /must be a string/);
});
