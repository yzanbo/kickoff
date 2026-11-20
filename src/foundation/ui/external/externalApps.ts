// アプリの外で開く（外部のターミナル: Terminal.app・Ghostty など / 外部のブラウザ: Chrome・Safari・Arc など）。
// 選んでいるアプリはどの部品にもすぐ伝わり（useSetting）、この Mac に入っているアプリはアプリ全体で 1 回だけ調べる
import { EXTERNAL_BROWSERS, EXTERNAL_TERMINALS, type ExternalBrowserId, type ExternalTerminalId } from "@shared/foundation/ipc";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { createStore } from "@/foundation/ui/store/createStore";
import { useStore } from "@/foundation/ui/store/useStore";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { installedBrowsers as listBrowsers, installedTerminals as listTerminals, openExternal } from "./native";
import { storage as externalStorage } from "./storage";

/** 外部のターミナルの表示名 */
export const terminalLabel = (id: ExternalTerminalId) => EXTERNAL_TERMINALS.find((t) => t.id === id)?.label ?? id;
const browserLabel = (id: ExternalBrowserId) => EXTERNAL_BROWSERS.find((b) => b.id === id)?.label ?? id;
/** アプリの短い名前（メニューの「外部で開く」に添える。Terminal・Google Chrome など） */
const appName = (list: readonly { id: string; app: string }[], id: string) => list.find((a) => a.id === id)?.app ?? id;

// この Mac に入っているアプリ（アプリ全体で 1 回だけ調べる。調べられなければ、次に使うときに調べ直す。デスクトップアプリでなければ既定のものだけ）
const installedTerminals = createStore({ load: async (): Promise<ExternalTerminalId[]> => (await listTerminals()) ?? ["terminal"] });
const installedBrowsers = createStore({ load: async (): Promise<ExternalBrowserId[]> => (await listBrowsers()) ?? ["chrome"] });

/** 一覧のうち、入っているもの（選んでいるものは、入っていなくても出す。missing で見分ける） */
function choicesOf<T extends string>(all: readonly { id: T }[], installed: T[] | undefined, current: T, label: (id: T) => string) {
  return all
    .filter((a) => a.id === current || (installed ?? [current]).includes(a.id))
    .map((a) => ({ id: a.id, label: label(a.id), missing: installed !== undefined && !installed.includes(a.id) }));
}

/**
 * 選んでいる外部のターミナル（設定の「ターミナル」・パネルのターミナルの ▾ で選ぶ）と、そのアプリでフォルダを開く関数・選べるアプリ。
 * 開けなければお知らせで出す
 */
export function useExternalTerminal() {
  const [terminal, setTerminal] = useSetting(externalStorage.settings.terminal);
  const installed = useStore(installedTerminals);
  const open = (dir: string, app: ExternalTerminalId = terminal) =>
    void openExternal({ kind: "terminal", dir, app }).catch(reportFailure("ターミナルを開けませんでした"));
  return {
    terminal,
    setTerminal,
    label: terminalLabel(terminal),
    app: appName(EXTERNAL_TERMINALS, terminal),
    open,
    choices: choicesOf(EXTERNAL_TERMINALS, installed.data, terminal, terminalLabel),
  };
}

/**
 * 選んでいる外部のブラウザ（パネルのブラウザの ▾ で選ぶ。初めは Chrome）と、そのアプリでページを開く関数・選べるアプリ。
 * url がなければ空の新しいタブ。開けなければお知らせで出す
 */
export function useExternalBrowser() {
  const [browser, setBrowser] = useSetting(externalStorage.settings.browser);
  const installed = useStore(installedBrowsers);
  const open = (url?: string, app: ExternalBrowserId = browser) =>
    void openExternal({ kind: "browser", url, app }).catch(reportFailure("ブラウザを開けませんでした"));
  return {
    browser,
    setBrowser,
    label: browserLabel(browser),
    app: appName(EXTERNAL_BROWSERS, browser),
    open,
    choices: choicesOf(EXTERNAL_BROWSERS, installed.data, browser, browserLabel),
  };
}
