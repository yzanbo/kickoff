import { Globe, SquareTerminal } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useExternalBrowser, useExternalTerminal } from "../../externalApps";
import type { ExternalTerminalId } from "../../../../core/types";
import { clampToViewport } from "../PopupMenu";
import { TARGET_MENU_WIDTH, targetMenuHeight, TerminalTargetMenu } from "../terminal/TerminalTargetMenu";
import { OPEN_WITH_MENU_WIDTH, OpenWithMenu, openWithMenuHeight } from "./OpenWithMenu";
import type { PaneLeaf } from "./paneLayout";
import type { OpenWithKind } from "./PaneTabBar";
import type { SidePanelController, TerminalTarget } from "./useSidePanel";

/** ▾ を押したボタンのセレクタ（外側のクリックとして閉じず、ボタンの側で開閉する） */
const CARET = ".panel-open-with";

/**
 * パネルのタブの列のブラウザ・ターミナルの ▾ のメニュー（新しいタブで開く・「外部で開く」のアプリを押すとそのアプリで開く。次からの既定にもする）。
 * 外のブラウザでは、押したペインで表示中のブラウザのタブのページを開く（なければアプリを開くだけ）。
 * 外のターミナルでは、新しいタブと同じ場所（表示中のチャットの作業場所 → 開く場所が 1 つならそこ）で開き、いくつもあれば開く場所を選ぶ。
 * open を ▾ の onClick に、menu を描く
 */
export function useOpenWithMenu({
  panel,
  targets,
  chatTarget,
}: {
  panel: SidePanelController;
  targets: TerminalTarget[];
  /** ペインで表示しているチャットの作業場所（チャットでなければ undefined） */
  chatTarget: (pane: PaneLeaf) => TerminalTarget | undefined;
}) {
  const browser = useExternalBrowser();
  const terminal = useExternalTerminal();
  const [shown, setShown] = useState<{ kind: OpenWithKind; pane: PaneLeaf; x: number; y: number } | null>(null);
  // ターミナルを開く場所を選ぶメニュー（開く場所がいくつもあるとき。tab = 新しいタブ / external = 外のターミナル）
  const [pick, setPick] = useState<{ mode: "tab" | "external"; app?: ExternalTerminalId; x: number; y: number } | null>(null);

  const open = (kind: OpenWithKind, e: MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => {
    if (shown?.kind === kind && shown.pane.id === pane.id) return setShown(null);
    panel.focusPane(pane.id);
    const r = e.currentTarget.getBoundingClientRect();
    const apps = kind === "browser" ? browser.choices.length : terminal.choices.length;
    setShown({ kind, pane, ...clampToViewport(r.right - OPEN_WITH_MENU_WIDTH, r.bottom + 4, OPEN_WITH_MENU_WIDTH, openWithMenuHeight(apps)) });
  };

  /** 押したペインで表示中のブラウザのタブのページ */
  const browserUrl = (pane: PaneLeaf) => {
    const tab = panel.tabs.find((t) => t.key === pane.active);
    return tab?.kind === "browser" ? (tab.current ?? tab.url) : undefined;
  };

  /** ターミナルを開く（新しいタブ・外のターミナル）。場所はアイコンと同じ決め方で、決まらなければ選ぶメニューを同じ位置に出す */
  const openTerminalIn = (mode: "tab" | "external", pane: PaneLeaf, at: { x: number; y: number }, app?: ExternalTerminalId) => {
    const target = chatTarget(pane) ?? (targets.length === 1 ? targets[0] : undefined);
    if (target) return mode === "tab" ? panel.openTerminal(target) : terminal.open(target.cwd, app);
    setPick({ mode, app, ...clampToViewport(at.x, at.y, TARGET_MENU_WIDTH, targetMenuHeight(targets.length)) });
  };

  const menu = (
    <>
      {shown?.kind === "browser" && (
        <OpenWithMenu
          x={shown.x}
          y={shown.y}
          ignore={CARET}
          icon={Globe}
          title="ブラウザの開き方"
          newTab="新しいタブで開く"
          apps={browser.choices}
          current={browser.browser}
          onNewTab={() => panel.openBrowser()}
          onOpenIn={(app) => {
            browser.setBrowser(app);
            browser.open(browserUrl(shown.pane), app);
          }}
          onClose={() => setShown(null)}
        />
      )}
      {shown?.kind === "terminal" && (
        <OpenWithMenu
          x={shown.x}
          y={shown.y}
          ignore={CARET}
          icon={SquareTerminal}
          title="ターミナルの開き方"
          newTab="新しいタブで開く"
          apps={terminal.choices}
          current={terminal.terminal}
          onNewTab={() => openTerminalIn("tab", shown.pane, shown)}
          onOpenIn={(app) => {
            terminal.setTerminal(app);
            openTerminalIn("external", shown.pane, shown, app);
          }}
          onClose={() => setShown(null)}
        />
      )}
      {pick && (
        <TerminalTargetMenu
          x={pick.x}
          y={pick.y}
          targets={targets}
          ignore={CARET}
          onPick={(t) => (pick.mode === "tab" ? panel.openTerminal(t) : terminal.open(t.cwd, pick.app))}
          onClose={() => setPick(null)}
        />
      )}
    </>
  );
  return { open, shown: shown?.kind ?? null, menu };
}
