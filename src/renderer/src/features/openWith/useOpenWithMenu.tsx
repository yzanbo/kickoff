import { Globe, SquareTerminal, type LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";
import type { ExternalBrowserId, ExternalTerminalId } from "@shared/types";
import { anchorPlacement, type Placement } from "@/lib/floating";
import { useContextMenu } from "@/ui/useContextMenu";
import { TerminalTargetMenu } from "@/features/terminal/TerminalTargetMenu";
import { findPane, type PaneLeaf } from "@/features/panel/layout/paneLayout";
import type { PanelController } from "@/features/panel/usePanel";
import { useExternalBrowser, useExternalTerminal } from "./externalApps";
import { browserPageOf, terminalTargetOf } from "./openTargets";
import { OpenWithMenu } from "./OpenWithMenu";

/** ▾ のメニューの種類 */
export type OpenWithKind = "browser" | "terminal";

/** 開くボタン（タブの列のターミナル・タブがないときのターミナル・▾）。開いているメニューを外側のクリックとして閉じず、押したボタンの側で開閉する */
const OPENERS = ".panel-tab-terminal, .panel-empty-terminal, .panel-open-with";

/** ▾ のメニューの中身（ブラウザ・ターミナルで同じ形） */
interface OpenWithChoice {
  icon: LucideIcon;
  title: string;
  apps: { id: string; label: string; missing?: boolean }[];
  current: string;
  onNewTab: () => void;
  /** そのアプリで開く（次からの既定にもする） */
  onOpenIn: (app: string) => void;
}

/**
 * パネルのタブの列のブラウザ・ターミナルを開く操作と、▾ のメニュー（新しいタブで開く・「外部で開く」のアプリを押すとそのアプリで開く。次からの既定にもする）。
 * ターミナルを開く場所はアイコン・タブがないときのボタン・▾ のどれも同じ決め方（openTargets の terminalTargetOf: 押したペインでチャットを表示していればその作業場所 →
 * 開く場所が 1 つならそこ）で、決まらなければ開く場所を選ぶメニューを出す（1 つのメニューを、新しいタブ・外のターミナルで共通に使う）。
 * 外のブラウザでは、押したペインで見せている表示中のブラウザのタブのページを開く（なければアプリを開くだけ。browserPageOf）。
 * openTerminal をターミナルのアイコンに、open を ▾ に渡し、menu を描く
 */
export function useOpenWithMenu(panel: PanelController) {
  const browser = useExternalBrowser();
  const terminal = useExternalTerminal();
  const targets = panel.terminals;
  // ▾ のメニュー（どのペインの、どちらの ▾ か）
  const caret = useContextMenu<{ kind: OpenWithKind; paneId: string }>({ align: "end" });
  // ターミナルを開く場所を選ぶメニュー（tab = 新しいタブ / external = 外のターミナル。icon = アイコン・タブがないときのボタンから開いた）
  const picker = useContextMenu<{ mode: "tab" | "external"; app?: ExternalTerminalId; icon: boolean }>();

  /** ペインで見せている表示中のタブ（隠した種類のタブを表示中にしていたら、見せている種類の最初のタブ） */
  const shownTab = (paneId: string) => {
    const pane = findPane(panel.layout, paneId);
    const key = pane && panel.shownTabOf(pane);
    return panel.tabs.find((t) => t.key === key);
  };

  /** ターミナルを開く（新しいタブ・外のターミナル）。場所が決まらなければ、開く場所を選ぶメニューを at に出す */
  const openTerminalIn = (paneId: string, mode: "tab" | "external", at: Placement, app?: ExternalTerminalId, icon = false) => {
    const shown = shownTab(paneId);
    const target = terminalTargetOf(shown, panel.chatOf(shown), targets);
    if (!target) return picker.openAt(at, { mode, app, icon });
    if (mode === "tab") panel.openTerminal(target);
    else terminal.open(target.cwd, app);
  };

  /** ターミナルのアイコン・タブがないときのボタン（押したペインに新しいタブで開く。開く場所を選ぶメニューを開いているときに押したら閉じる） */
  const openTerminal = (e: MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => {
    const toggled = picker.menu?.value.icon === true;
    picker.close();
    caret.close();
    if (toggled) return;
    panel.focusPane(pane.id);
    openTerminalIn(pane.id, "tab", anchorPlacement(e.currentTarget, { align: "end" }), undefined, true);
  };

  /** ▾（▾ の右端にそろえて、その下に開く。開いているときに押したら閉じる） */
  const open = (kind: OpenWithKind, e: MouseEvent<HTMLButtonElement>, pane: PaneLeaf) => {
    picker.close();
    if (caret.menu?.value.kind === kind && caret.menu.value.paneId === pane.id) return caret.close();
    panel.focusPane(pane.id);
    caret.openBelow(e, { kind, paneId: pane.id });
  };

  /** ▾ のメニューの中身 */
  const choiceOf = (kind: OpenWithKind, paneId: string, at: Placement): OpenWithChoice => {
    if (kind === "browser") {
      const url = browserPageOf(shownTab(paneId));
      return {
        icon: Globe,
        title: "ブラウザの開き方",
        apps: browser.choices,
        current: browser.browser,
        onNewTab: () => panel.openBrowser(),
        onOpenIn: (app) => {
          browser.setBrowser(app as ExternalBrowserId);
          browser.open(url, app as ExternalBrowserId);
        },
      };
    }
    return {
      icon: SquareTerminal,
      title: "ターミナルの開き方",
      apps: terminal.choices,
      current: terminal.terminal,
      onNewTab: () => openTerminalIn(paneId, "tab", at),
      onOpenIn: (app) => {
        terminal.setTerminal(app as ExternalTerminalId);
        openTerminalIn(paneId, "external", at, app as ExternalTerminalId);
      },
    };
  };

  const shown = caret.menu && choiceOf(caret.menu.value.kind, caret.menu.value.paneId, caret.menu.at);
  const pick = picker.menu?.value;
  const menu = (
    <>
      {caret.menu && shown && (
        <OpenWithMenu
          at={caret.menu.at}
          ignore={OPENERS}
          icon={shown.icon}
          title={shown.title}
          newTab="新しいタブで開く"
          apps={shown.apps}
          current={shown.current}
          onNewTab={shown.onNewTab}
          onOpenIn={shown.onOpenIn}
          onClose={caret.close}
        />
      )}
      {picker.menu && pick && (
        <TerminalTargetMenu
          at={picker.menu.at}
          targets={targets}
          ignore={OPENERS}
          onPick={(t) => (pick.mode === "tab" ? panel.openTerminal(t) : terminal.open(t.cwd, pick.app))}
          onClose={picker.close}
        />
      )}
    </>
  );
  return {
    openTerminal,
    open,
    /** いま開いている ▾ のメニュー（aria-expanded に使う） */
    shown: caret.menu?.value.kind ?? null,
    /** アイコン・タブがないときのボタンから、開く場所を選ぶメニューを開いているか（aria-expanded に使う） */
    picking: pick?.icon === true,
    menu,
  };
}
