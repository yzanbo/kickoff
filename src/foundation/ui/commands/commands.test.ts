import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import type { KeyInput } from "@/foundation/ui/lib/keys";
import { runCommandKey } from "./commands";
import { commands, KeyHint, keyLabel, matchKey, runCommand, useCommandKeys, type Command, type CommandContext } from "./index";

/** キーの知らせ（書いたものだけ押している） */
const key = (k: string, mods: Partial<KeyInput & { defaultPrevented: boolean }> = {}): KeyInput & { defaultPrevented: boolean } => ({ key: k, code: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false, ...mods });
const main: CommandContext = { window: "main", route: null, projectId: null };

test("matchKey: mod は Mac で ⌘ だけ（⌃ は入力欄の編集に残す）、ほかで Ctrl だけ", () => {
  const rows: [KeyInput, string, boolean, boolean][] = [
    [key("k", { metaKey: true }), "mod+k", true, true],
    [key("k", { ctrlKey: true }), "mod+k", true, false],
    [key("k", { ctrlKey: true }), "mod+k", false, true],
    [key("k", { metaKey: true }), "mod+k", false, false],
    [key("k", { metaKey: true, ctrlKey: true }), "mod+k", true, false],
    // Control をそのまま書いたキーはどこでも Control
    [key("`", { ctrlKey: true }), "ctrl+`", true, true],
    [key("`", { ctrlKey: true }), "ctrl+`", false, true],
    [key("1", { ctrlKey: true, metaKey: true }), "ctrl+1", true, false],
    // 修飾キーなしのキーは、⌘・⌃ を押していたら合わない
    [key("Escape"), "Escape", true, true],
    [key("Escape", { metaKey: true }), "Escape", true, false],
  ];
  for (const [e, combo, mac, expected] of rows) assert.equal(matchKey(e, combo, mac), expected, `${combo} mac=${mac} ${JSON.stringify(e)}`);
});

test("matchKey: Shift つき・⌥ つきは書いたものだけ。⌥ つきはキーの位置（code:）で見る。1 文字は大文字・小文字を区別しない", () => {
  assert.equal(matchKey(key("k", { metaKey: true, shiftKey: true }), "mod+k", true), false);
  assert.equal(matchKey(key("A", { metaKey: true, shiftKey: true }), "mod+shift+a", true), true);
  assert.equal(matchKey(key("a", { metaKey: true }), "mod+shift+a", true), false);
  assert.equal(matchKey(key("b", { metaKey: true, altKey: true }), "mod+b", true), false);
  // ⌥ を押すと文字が変わる（⌥⌘T の key は "†"）
  assert.equal(matchKey(key("†", { code: "KeyT", metaKey: true, altKey: true }), "mod+alt+code:KeyT", true), true);
  assert.equal(matchKey(key("t", { code: "KeyT", metaKey: true }), "mod+alt+code:KeyT", true), false);
  assert.equal(matchKey(key("[", { metaKey: true }), "mod+[", true), true);
  assert.equal(matchKey(key("+", { metaKey: true }), "mod++", true), true);
  assert.equal(matchKey(key("ArrowRight", { metaKey: true, altKey: true }), "mod+alt+ArrowRight", true), true);
});

test("keyLabel: 修飾キーは書いた順に、Mac は記号で続け、ほかは + でつなぐ", () => {
  assert.equal(keyLabel("mod+shift+s", true), "⌘⇧S");
  assert.equal(keyLabel("mod+shift+s", false), "Ctrl+Shift+S");
  assert.equal(keyLabel("alt+mod+code:KeyT", true), "⌥⌘T");
  assert.equal(keyLabel("ctrl+`", true), "⌃`");
  assert.equal(keyLabel("mod+[", false), "Ctrl+[");
  assert.equal(keyLabel("ctrl+code:Digit1", true), "⌃1");
  assert.equal(keyLabel("Escape", true), "Esc");
  assert.equal(keyLabel("mod+alt+ArrowUp", true), "⌘⌥↑");
});

/** 走らせた id を並べるコマンド */
function recorder() {
  const ran: string[] = [];
  const make = (id: string, keys: string, extra: Partial<Command> = {}): Command => ({ id, title: id, keys, run: () => void ran.push(id), ...extra });
  return { ran, make };
}

test("runCommandKey: 先に受けたキー（defaultPrevented）は evenIfHandled の項目だけ。when が通らなければキーを奪わない", () => {
  const { ran, make } = recorder();
  const list = [make("find", "mod+f"), make("save", "mod+shift+s", { evenIfHandled: true }), make("back", "mod+[", { when: () => false })];
  assert.equal(runCommandKey(key("f", { metaKey: true, defaultPrevented: true }), main, "bubble", list, true), false);
  assert.equal(runCommandKey(key("s", { metaKey: true, shiftKey: true, defaultPrevented: true }), main, "bubble", list, true), true);
  // ⌘[ ⌘] はエディタ・ダイアログの中では奪わない（when で断る）
  assert.equal(runCommandKey(key("[", { metaKey: true }), main, "bubble", list, true), false);
  assert.deepEqual(ran, ["save"]);
});

test("runCommandKey: capture の項目は capture の段だけで受け（ターミナルの中でも効く）、ほかはふだんの段", () => {
  const { ran, make } = recorder();
  const list = [make("bottom", "ctrl+`", { capture: true }), make("palette", "mod+k")];
  assert.equal(runCommandKey(key("`", { ctrlKey: true }), main, "bubble", list, true), false);
  assert.equal(runCommandKey(key("`", { ctrlKey: true }), main, "capture", list, true), true);
  assert.equal(runCommandKey(key("k", { metaKey: true }), main, "capture", list, true), false);
  assert.equal(runCommandKey(key("k", { metaKey: true }), main, "bubble", list, true), true);
  assert.deepEqual(ran, ["bottom", "palette"]);
});

test("runCommandKey: 効くウィンドウ（既定はメイン）と、run が false ならキーを奪わず次の項目へ", () => {
  const { ran, make } = recorder();
  const popout: CommandContext = { window: "popout", route: null, projectId: null };
  const list = [make("focus", "mod+l", { run: () => (ran.push("focus"), false) }), make("mainOnly", "mod+n"), make("both", "mod+n", { windows: "both" })];
  assert.equal(runCommandKey(key("l", { metaKey: true }), main, "bubble", list, true), false);
  assert.equal(runCommandKey(key("n", { metaKey: true }), popout, "bubble", list, true), true);
  assert.deepEqual(ran, ["focus", "both"]);
});

test("runCommand・useCommandKeys・KeyHint: 表のコマンドを id で走らせ、キーの表示を出す", () => {
  const { ran, make } = recorder();
  useTestContributions([commands.item(make("settings.open", "mod+,")), commands.item(make("none", "mod+x", { keys: undefined }))]);
  assert.equal(runCommand("settings.open", { window: "popout", route: null, projectId: null }), false);
  assert.equal(runCommand("settings.open", { window: "main", route: null, projectId: null }), true);
  assert.equal(runCommand("unknown", main), false);
  assert.deepEqual(ran, ["settings.open"]);
  let shown: (string | null)[] = [];
  const Probe = () => {
    shown = [useCommandKeys("settings.open"), useCommandKeys("none"), useCommandKeys("unknown")];
    return null;
  };
  renderToString(createElement(Probe));
  assert.equal(shown[0] === "⌘," || shown[0] === "Ctrl+,", true);
  assert.deepEqual(shown.slice(1), [null, null]);
  assert.match(renderToString(createElement(KeyHint, { keys: "mod+k" })), /<kbd>(⌘K|Ctrl\+K)<\/kbd>/);
  assert.equal(renderToString(createElement(KeyHint, { command: "none" })), "");
});
