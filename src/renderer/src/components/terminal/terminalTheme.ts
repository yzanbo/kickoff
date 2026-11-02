import type { ITheme } from "@xterm/xterm";
import type { AppliedTheme } from "../../theme";

// 16 色は VS Code の Dark+ / Light+ のターミナルと同じ（コードの色付けとそろえる）
const DARK_ANSI = {
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

const LIGHT_ANSI = {
  black: "#000000",
  red: "#cd3131",
  green: "#00bc00",
  yellow: "#949800",
  blue: "#0451a5",
  magenta: "#bc05bc",
  cyan: "#0598bc",
  white: "#555555",
  brightBlack: "#666666",
  brightRed: "#cd3131",
  brightGreen: "#14ce14",
  brightYellow: "#b5ba00",
  brightBlue: "#0451a5",
  brightMagenta: "#bc05bc",
  brightCyan: "#0598bc",
  brightWhite: "#a5a5a5",
};

/** ターミナルの配色。地と文字はアプリの色（CSS 変数）に合わせる */
export function terminalTheme(theme: AppliedTheme): ITheme {
  const css = getComputedStyle(document.documentElement);
  const background = css.getPropertyValue("--bg").trim();
  const foreground = css.getPropertyValue("--text").trim();
  return {
    ...(theme === "dark" ? DARK_ANSI : LIGHT_ANSI),
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: theme === "dark" ? "#264f78" : "#add6ff",
  };
}

/** ターミナルの文字（アプリの等幅の文字と同じ） */
export function terminalFont(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "Menlo, monospace";
}
