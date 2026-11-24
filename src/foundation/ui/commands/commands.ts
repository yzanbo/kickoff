// コマンド: ⌘K に出す操作・ショートカット・キーの表示が同じ表を読む。項目は機能が ui/contributes.ts で commands.item({…}) を出す。
// キーの判定の決まり: Mac は ⌘ だけ（⌃K などは入力欄の編集に残す）・エディタが先に受けたキー（defaultPrevented）は扱わない・
// Shift つき・⌥ つきは表に書いたものだけ（⌥ は文字が変わるので code: のキーの位置で書く）・capture の項目はほかより先に受ける（ターミナルの中でも効く）
import type { ComponentType } from "react";
import { definePoint } from "@/foundation/ui/points";
import { hasAppModifier, IS_MAC, type KeyInput } from "@/foundation/ui/lib/keys";
import { isPopoutWindow } from "@/foundation/ui/navigation/popout";
import { parse, routeProjectId, type Route } from "@/foundation/ui/navigation/router";

/** キーの書き方: "mod+k"・"mod+shift+s"・"mod+["・"mod+alt+code:KeyT"・"ctrl+`"。mod は Mac で ⌘、ほかで Ctrl。ctrl はどこでも Control。code: はキーの位置で見る */
export type KeyCombo = string;
export interface CommandContext {
  readonly window: "main" | "popout";
  readonly route: Route | null;
  readonly projectId: number | null;
  readonly event?: KeyboardEvent;
}
export interface Command {
  id: string;
  title: string;
  /** ⌘K に出すまとまり（省けば ⌘K に出さない。何か入力したときだけ、行の右の薄い文に出す） */
  group?: string;
  /** ⌘K の行の印と、名前のほかに絞り込みに使う言葉 */
  icon?: ComponentType<{ size?: number }>;
  keywords?: string;
  keys?: KeyCombo | readonly KeyCombo[];
  /** どのウィンドウで効くか（既定 "main"） */
  windows?: "main" | "popout" | "both";
  /** エディタ・入力欄が先に受けた（defaultPrevented）キーでも走らせるか（既定 false） */
  evenIfHandled?: boolean;
  /** keydown を capture の段で受ける（ターミナルの中でも効く ⌃` ⌘J） */
  capture?: boolean;
  when?(ctx: CommandContext): boolean;
  /** 走らせたら true（false ならキーを奪わない。⌘L で入力欄がなかったとき） */
  run(ctx: CommandContext): boolean | void | Promise<void>;
}
/** コマンド（key は id） */
export const commands = definePoint<Command>("commands", { key: (c) => c.id });

type Modifier = "mod" | "ctrl" | "shift" | "alt";
const MODIFIERS: readonly Modifier[] = ["mod", "ctrl", "shift", "alt"];

/** キーの書き方を、書いた順の修飾キーとキーに分ける（最後の "+" の後ろがキー。"mod++" のキーは "+"） */
function parseCombo(combo: KeyCombo): { mods: Modifier[]; key: string; byCode: boolean } {
  const at = combo.endsWith("++") ? combo.length - 1 : combo.lastIndexOf("+") + 1;
  const mods = combo.slice(0, Math.max(0, at - 1)).toLowerCase().split("+").filter((m): m is Modifier => MODIFIERS.includes(m as Modifier));
  const last = combo.slice(at);
  return last.startsWith("code:") ? { mods, key: last.slice(5), byCode: true } : { mods, key: last, byCode: false };
}

/** そのキーの書き方を押したか（修飾キーはちょうど書いたものだけ。1 文字のキーは大文字・小文字を区別しない） */
export function matchKey(e: KeyInput, combo: KeyCombo, mac = IS_MAC): boolean {
  const { mods, key, byCode } = parseCombo(combo);
  const held = mods.includes("mod") ? hasAppModifier(e, mac) : mods.includes("ctrl") ? e.ctrlKey && !e.metaKey : !e.metaKey && !e.ctrlKey;
  if (!held || e.shiftKey !== mods.includes("shift") || e.altKey !== mods.includes("alt")) return false;
  if (byCode) return e.code === key;
  return key.length === 1 ? e.key.toLowerCase() === key.toLowerCase() : e.key === key;
}

const MAC_NAMES: Record<Modifier, string> = { mod: "⌘", ctrl: "⌃", shift: "⇧", alt: "⌥" };
const OTHER_NAMES: Record<Modifier, string> = { mod: "Ctrl", ctrl: "Ctrl", shift: "Shift", alt: "Alt" };
const KEY_NAMES: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", Backslash: "\\", Backquote: "`" };

/** キーの表示（修飾キーは書いた順。Mac は "⌘⇧S"、ほかは "Ctrl+Shift+S"） */
export function keyLabel(combo: KeyCombo, mac = IS_MAC): string {
  const { mods, key, byCode } = parseCombo(combo);
  const plain = byCode ? key.replace(/^(Key|Digit)/, "") : key;
  const name = KEY_NAMES[plain] ?? (plain.length === 1 ? plain.toUpperCase() : plain);
  return mac ? mods.map((m) => MAC_NAMES[m]).join("") + name : [...mods.map((m) => OTHER_NAMES[m]), name].join("+");
}

/** そのコマンドのキーの書き方（なければ空） */
export const keysOf = (command: Command): readonly KeyCombo[] => (command.keys === undefined ? [] : typeof command.keys === "string" ? [command.keys] : command.keys);

/** そのウィンドウで、いま走らせてよいか */
function allowed(command: Command, ctx: CommandContext): boolean {
  const windows = command.windows ?? "main";
  return (windows === "both" || windows === ctx.window) && (command.when?.(ctx) ?? true);
}

/** いまのウィンドウの文脈（メインのウィンドウはいまの画面とそのプロジェクト） */
export function commandContext(window: "main" | "popout" = isPopoutWindow() ? "popout" : "main", event?: KeyboardEvent): CommandContext {
  const route = window === "main" ? parse(location.hash) : null;
  return { window, route, projectId: route ? routeProjectId(route) : null, ...(event ? { event } : {}) };
}

/**
 * キーの知らせに合うコマンドを、表の順に 1 つ走らせる（capture の段は capture の項目だけ、ふだんの段はそれ以外）。
 * 走らせて run が false を返さなければ true（呼んだ側がキーを奪う）
 */
export function runCommandKey(e: KeyInput & { defaultPrevented: boolean }, ctx: CommandContext, phase: "capture" | "bubble", list: readonly Command[] = commands.items(), mac = IS_MAC): boolean {
  for (const command of list) {
    if (Boolean(command.capture) !== (phase === "capture")) continue;
    if (e.defaultPrevented && !command.evenIfHandled) continue;
    if (!keysOf(command).some((combo) => matchKey(e, combo, mac)) || !allowed(command, ctx)) continue;
    if (command.run(ctx) !== false) return true;
  }
  return false;
}

/** ⌘K に出すコマンド（group があり、いまのウィンドウで走らせてよいもの。表の順） */
export const paletteCommands = (): Command[] => {
  const ctx = commandContext();
  return commands.items().filter((c) => c.group !== undefined && allowed(c, ctx));
};

/** そのコマンドを走らせる（⌘K・ボタンから。走らせたら true） */
export function runCommand(id: string, ctx: Partial<CommandContext> = {}): boolean {
  const command = commands.items().find((c) => c.id === id);
  // 渡されていない所は、いまのウィンドウの文脈で埋める
  const { window, route, projectId } = ctx;
  const full = window !== undefined && route !== undefined && projectId !== undefined ? { ...ctx, window, route, projectId } : { ...commandContext(window), ...ctx };
  if (!command || !allowed(command, full)) return false;
  return command.run(full) !== false;
}
