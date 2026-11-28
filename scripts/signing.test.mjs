import assert from "node:assert/strict";
import { test } from "vitest";
import { adhocRequested, hasHardenedRuntime, isMachOHeader, leafCertOf, signatureProblem, signModeOf } from "./signing.mjs";
import { missingVaultMessage, vaultOf, VAULT } from "./vault.mjs";
import { busyMessage, kickoffTerminalOf } from "./kickoff-status.mjs";

const SHA = "F84FBC463E4889FC6FED2DEF2DC27A9310DB57FC";
const requirement = `Executable=/x/Kickoff.app/Contents/MacOS/Kickoff\ndesignated => identifier "app.nexy.Kickoff" and certificate leaf = H"${SHA.toLowerCase()}"\n`;
const runtime = "CodeDirectory v=20500 size=1234 flags=0x10000(runtime) hashes=28+7 location=embedded\n";
const adhocRuntime = "CodeDirectory v=20500 size=1234 flags=0x10002(adhoc,runtime) hashes=28+7 location=embedded\n";

test("signModeOf: 付けなければ仮の署名、release だけが金庫の印鑑、知らない値は止める", () => {
  assert.equal(signModeOf(undefined), "adhoc");
  assert.equal(signModeOf("adhoc"), "adhoc");
  assert.equal(signModeOf("release"), "release");
  assert.throws(() => signModeOf("vault"), /KICKOFF_SIGN/);
});

test("adhocRequested: ADHOC は 1 だけを受け付ける（書き違いで印鑑なしにしない）", () => {
  assert.equal(adhocRequested(undefined), false);
  assert.equal(adhocRequested(""), false);
  assert.equal(adhocRequested("1"), true);
  for (const value of ["true", "yes", "0"]) assert.throws(() => adhocRequested(value), /ADHOC は 1 だけ/);
});

test("leafCertOf: 同じアプリと見なす条件から印鑑の SHA-1 を取り出す（仮の署名は null）", () => {
  assert.equal(leafCertOf(requirement), SHA);
  assert.equal(leafCertOf('designated => cdhash H"a101f8244f0ba6c27cdc0f164db6e35328c63dd4"'), null);
});

test("signatureProblem: 印鑑の指紋が違う・仮の署名・Hardened Runtime なしを見分ける", () => {
  assert.equal(signatureProblem({ requirement, details: runtime, identity: SHA }), null);
  assert.equal(signatureProblem({ requirement, details: runtime, identity: SHA.toLowerCase() }), null);
  assert.match(signatureProblem({ requirement, details: runtime, identity: "0".repeat(40) }) ?? "", /別の印鑑/);
  assert.match(signatureProblem({ requirement: 'designated => cdhash H"a1"', details: adhocRuntime, identity: SHA }) ?? "", /印鑑で署名されていません/);
  assert.match(signatureProblem({ requirement, details: runtime.replace("(runtime)", "(none)"), identity: SHA }) ?? "", /Hardened Runtime/);
  // 仮の署名を求めたときは、Hardened Runtime だけを見る
  assert.equal(signatureProblem({ requirement: "", details: adhocRuntime, identity: null }), null);
  assert.equal(hasHardenedRuntime("CodeDirectory v=20400 flags=0x2(adhoc) hashes=1"), false);
});

test("isMachOHeader: 実行ファイル・両方入り・.node の頭を見分ける", () => {
  assert.equal(isMachOHeader(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])), true);
  assert.equal(isMachOHeader(Buffer.from([0xca, 0xfe, 0xba, 0xbe])), true);
  assert.equal(isMachOHeader(Buffer.from("#!/b")), false);
  assert.equal(isMachOHeader(Buffer.from([0xcf])), false);
});

test("vaultOf: 差し替えは KICKOFF_SIGN_KEYCHAIN と KICKOFF_SIGN_IDENTITY の両方がそろったときだけ", () => {
  assert.equal(vaultOf({}), VAULT);
  assert.deepEqual(vaultOf({ KICKOFF_SIGN_KEYCHAIN: "/tmp/t/test.keychain-db", KICKOFF_SIGN_IDENTITY: SHA.toLowerCase() }), { keychain: "/tmp/t/test.keychain-db", identity: SHA });
  assert.throws(() => vaultOf({ KICKOFF_SIGN_KEYCHAIN: "/tmp/t/test.keychain-db" }), /両方/);
  assert.throws(() => vaultOf({ KICKOFF_SIGN_KEYCHAIN: "/tmp/t/x", KICKOFF_SIGN_IDENTITY: "nexy Release Signing" }), /SHA-1/);
});

test("busyMessage: 実行中・数えられない Kickoff があれば止める文を返す", () => {
  assert.equal(busyMessage([{ label: "製品版", running: 0 }, { label: "開発版", running: 0 }]), null);
  assert.match(busyMessage([{ label: "製品版", running: 2 }, { label: "開発版", running: null }]) ?? "", /製品版（2 件）・開発版（数えられません）/);
});

test("金庫の案内: publish では印鑑なしの道を出さない", () => {
  assert.match(missingVaultMessage(VAULT, { adhocHint: true }), /ADHOC=1 npm run install-app/);
  assert.doesNotMatch(missingVaultMessage(VAULT, { adhocHint: false }), /ADHOC/);
});

test("kickoffTerminalOf: どの Kickoff のターミナルから流したか（印のない古い版は unknown）", () => {
  assert.equal(kickoffTerminalOf({}), null);
  assert.equal(kickoffTerminalOf({ TERM_PROGRAM: "Apple_Terminal" }), null);
  assert.equal(kickoffTerminalOf({ KICKOFF_TERMINAL_OF: "production" }), "production");
  assert.equal(kickoffTerminalOf({ KICKOFF_TERMINAL_OF: "development", TERM_PROGRAM: "Kickoff" }), "development");
  assert.equal(kickoffTerminalOf({ TERM_PROGRAM: "Kickoff" }), "unknown");
});
