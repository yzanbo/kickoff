import { test } from "node:test";
import assert from "node:assert/strict";
import { worktreeSlotLabel, type WorktreePortSlot } from "@shared/types";
import { assignSlots, bandOf, pickBand } from "./bands.js";
import { composePortsOf, overrideYaml, portSpec } from "./composeOverride.js";
import { commentOutKeys, rewriteEnvPorts, withKickoffBlock, withoutKickoffBlock } from "./envRewrite.js";
import { browserHostOf, composeProjectNameOf } from "./names.js";
import { envSetupPrompt, envSetupTitle } from "./setupPrompt.js";

test("pickBand: 渡してある帯・使用中の番号がある帯を飛ばし、一番小さい帯を選ぶ", () => {
  assert.equal(pickBand(new Set(), []), 20100);
  assert.equal(pickBand(new Set([20100]), []), 20200);
  // 帯の中に待ち受けている番号があれば飛ばす（20000〜20099 は使わない）
  assert.equal(pickBand(new Set([20100]), [20250, 20050, 3000]), 20300);
  const all = new Set(Array.from({ length: 99 }, (_, i) => 20100 + i * 100));
  assert.equal(pickBand(all, []), null);
  assert.equal(bandOf(20199), 20100);
});

const db = { compose_dir: "", service: "db", target: 5432, protocol: "tcp", original: 5432 };
const redis = { compose_dir: "", service: "redis", target: 6379, protocol: "tcp", original: 6379 };
const api = { compose_dir: "api", service: "db", target: 5432, protocol: "tcp", original: 15432 };

test("assignSlots: +00 は開発サーバー、+01 から compose のフォルダ → サービス名の順", () => {
  const { slots, overflow } = assignSlots(20100, [], [redis, api, db]);
  assert.deepEqual(
    slots.map((s) => [s.kind, s.compose_dir, s.service, s.port]),
    [
      ["dev", null, null, 20100],
      ["docker", "", "db", 20101],
      ["docker", "", "redis", 20102],
      ["docker", "api", "db", 20103],
    ],
  );
  assert.deepEqual(overflow, []);
});

test("assignSlots: 前に決めた番号は変えず、増えたものには空いている次の番号", () => {
  const before = assignSlots(20100, [], [db, redis]).slots;
  // db が消えて api が増えた → redis は 20102 のまま、api は空いている 20101
  const after = assignSlots(20100, before, [redis, api]).slots;
  assert.deepEqual(
    after.filter((s) => s.kind === "docker").map((s) => [s.compose_dir, s.service, s.port]),
    [
      ["api", "db", 20101],
      ["", "redis", 20102],
    ],
  );
  // 本体の番号は今のものにする
  const moved = assignSlots(20100, before, [{ ...db, original: 5433 }, redis]).slots;
  assert.equal(moved.find((s) => s.service === "db")?.original, 5433);
});

test("assignSlots: 帯に収まらないものは overflow", () => {
  const wants = Array.from({ length: 100 }, (_, i) => ({ ...db, service: `s${String(i).padStart(3, "0")}` }));
  const { slots, overflow } = assignSlots(20100, [], wants);
  assert.equal(slots.length, 100);
  assert.equal(overflow.length, 1);
});

test("worktreeSlotLabel: 対応表の文", () => {
  const slots = assignSlots(20100, [], [db, api]).slots;
  assert.deepEqual(slots.map(worktreeSlotLabel), ["開発サーバー PORT → 20100", "db 5432 → 20101", "api/db 15432 → 20102"]);
  const udp: WorktreePortSlot = { kind: "docker", compose_dir: "", service: "dns", target: 53, protocol: "udp", original: null, port: 20103 };
  assert.equal(worktreeSlotLabel(udp), "dns 53/udp → 20103");
});

test("rewriteEnvPorts: URL の中のポートと _PORT の変数を、本体の Docker の番号のときだけ書き換える", () => {
  const text = [
    "DATABASE_URL=postgres://app:app@localhost:5432/app",
    'REDIS_URL="redis://127.0.0.1:6379/0"',
    "REDIS_PORT=6379 # キャッシュ",
    "DB_PORT='5432'",
    "OTHER_PORT=3000",
    "REMOTE_URL=postgres://u:p@db.example.com:5432/app",
    "INNER_URL=postgres://db:5432/app",
    "NEXTAUTH_URL=http://localhost:3000",
    "DB_ADDR=localhost:5432",
    "# DATABASE_URL=postgres://localhost:5432/old",
  ].join("\n");
  const r = rewriteEnvPorts(text, new Map([[5432, 20101], [6379, 20102]]));
  assert.deepEqual(r.text.split("\n"), [
    "DATABASE_URL=postgres://app:app@localhost:20101/app",
    'REDIS_URL="redis://127.0.0.1:20102/0"',
    "REDIS_PORT=20102 # キャッシュ",
    "DB_PORT='20101'",
    "OTHER_PORT=3000",
    // この Mac の外のホスト・コンテナどうしの名前は書き換えない
    "REMOTE_URL=postgres://u:p@db.example.com:5432/app",
    "INNER_URL=postgres://db:5432/app",
    "NEXTAUTH_URL=http://localhost:3000",
    "DB_ADDR=localhost:5432",
    "# DATABASE_URL=postgres://localhost:5432/old",
  ]);
  assert.deepEqual(r.rewritten, ["DATABASE_URL", "REDIS_URL", "REDIS_PORT", "DB_PORT"]);
  // 外のホスト・コンテナの名前の :5432 は手順では分からないので、残っているものとして知らせる
  assert.deepEqual(r.leftovers, ["REMOTE_URL", "INNER_URL", "DB_ADDR"]);
  assert.deepEqual(r.localUrls, ["NEXTAUTH_URL"]);
});

test("Kickoff の区切り: 足し直しても 1 つ、中は書き換えない", () => {
  const once = withKickoffBlock("A=1\n", "帯 20100〜20199", ["COMPOSE_PROJECT_NAME=app-x"]);
  assert.equal(once, "A=1\n\n# >>> Kickoff（帯 20100〜20199）\nCOMPOSE_PROJECT_NAME=app-x\n# <<< Kickoff\n");
  const twice = withKickoffBlock(once, "帯 20200〜20299", ["COMPOSE_PROJECT_NAME=app-y"]);
  assert.equal(twice, "A=1\n\n# >>> Kickoff（帯 20200〜20299）\nCOMPOSE_PROJECT_NAME=app-y\n# <<< Kickoff\n");
  assert.equal(withoutKickoffBlock(twice), "A=1\n\n");
  assert.equal(withKickoffBlock("", "h", ["X=1"]), "# >>> Kickoff（h）\nX=1\n# <<< Kickoff\n");
  const inBlock = rewriteEnvPorts("# >>> Kickoff（h）\nDB_PORT=5432\n# <<< Kickoff\nDB_PORT=5432", new Map([[5432, 20101]]));
  assert.equal(inBlock.text, "# >>> Kickoff（h）\nDB_PORT=5432\n# <<< Kickoff\nDB_PORT=20101");
});

test("commentOutKeys: 区切りの外の COMPOSE_FILE などをコメントにして、元の値を返す（作り直しても引き継ぐ）", () => {
  const first = commentOutKeys('COMPOSE_FILE="compose.yaml:compose.dev.yaml"\nCOMPOSE_PROJECT_NAME=app\nA=1', ["COMPOSE_FILE", "COMPOSE_PROJECT_NAME"]);
  assert.equal(first.values.get("COMPOSE_FILE"), "compose.yaml:compose.dev.yaml");
  assert.equal(first.values.get("COMPOSE_PROJECT_NAME"), "app");
  assert.match(first.text, /^# COMPOSE_FILE="compose.yaml:compose.dev.yaml" {2}# Kickoff/);
  const again = commentOutKeys(first.text, ["COMPOSE_FILE"]);
  assert.equal(again.text, first.text);
  assert.equal(again.values.get("COMPOSE_FILE"), "compose.yaml:compose.dev.yaml");
});

test("composePortsOf・portSpec・overrideYaml: 公開ポートを帯の番号にした上書きファイル", () => {
  const doc = {
    services: {
      db: { ports: [{ mode: "ingress", target: 5432, published: "5432", protocol: "tcp" }] },
      web: { ports: [{ target: 80, published: "8080", host_ip: "127.0.0.1", protocol: "tcp" }, { target: 9229, protocol: "tcp" }, { target: 53, published: "5353", protocol: "udp" }] },
      worker: {},
    },
  };
  const ports = composePortsOf(doc);
  assert.deepEqual([...ports.keys()], ["db", "web"]);
  const web = ports.get("web")!;
  assert.deepEqual(web.map((p) => portSpec(p, p.published === null ? null : 20102)), ["127.0.0.1:20102:80", "9229", "20102:53/udp"]);
  assert.equal(portSpec({ target: 80, published: null, published_raw: "8000-8001", host_ip: "::1", protocol: "tcp" }, null), "[::1]:8000-8001:80");
  assert.equal(
    overrideYaml([{ name: "db", ports: ["20101:5432"] }]),
    '# Kickoff が書いたファイル（ワークツリーの実行環境。ポートを帯の番号にする）。.git/info/exclude で Git に無視させています\nservices:\n  "db":\n    ports: !override ["20101:5432"]\n',
  );
  assert.match(overrideYaml([]), /services: \{\}\n$/);
});

test("browserHostOf・composeProjectNameOf: ブランチ名から作る名前", () => {
  assert.equal(browserHostOf("feat/Login_Form"), "feat-login-form.localhost");
  assert.equal(browserHostOf("日本語"), "wt.localhost");
  assert.equal(browserHostOf("a".repeat(80)), `${"a".repeat(63)}.localhost`);
  assert.equal(composeProjectNameOf("myapp", "feat/x"), "myapp-feat-x");
  assert.equal(composeProjectNameOf("My App", "fix_y"), "my-app-fix-y");
  assert.equal(composeProjectNameOf("", "x"), "x");
});

test("［AI で整える］の指示: 帯がなければそう書き、止まった理由・ほかの帯・守ることを添える", () => {
  const text = envSetupPrompt({
    label: "feat/x",
    path: "/r-worktrees/feat-x",
    mainPath: "/r",
    env: { band: null, host: null, slots: [], compose_names: [], rewritten: [], issues: [], blocked: "ワークツリーの実行環境を整えられませんでした: x" },
    otherBands: [20100, 20300],
  });
  assert.match(text, /ポートの帯はまだ割り当てていません/);
  assert.match(text, /手順が止まった理由:\n- ワークツリーの実行環境を整えられませんでした: x/);
  assert.match(text, /ほかのワークツリーの帯（使わない）: 20100〜20199、20300〜20399/);
  assert.match(text, /Git で管理しているファイル（compose\.yaml・vite\.config・package\.json など）は書き換えない/);
  assert.equal(envSetupTitle("feat/x"), "実行環境を整える（feat/x）");
});
