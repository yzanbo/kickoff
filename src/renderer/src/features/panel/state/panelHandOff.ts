// チャット欄（右端の欄。surface が side の欄）を、メインのウィンドウと別ウィンドウの間で受け渡す（状態の持ち主ごと移す。タブの後始末はしない）。
// 持っているウィンドウだけがその欄を描き・変え・下書きを残す（setPanelOwnership）。ターミナルのシェルは、受け取った側が持ち主になってから渡した側を閉じる
import { postWindowMessage } from "@/app/windowBus";
import { claimTerminal } from "@/features/terminal/terminalOwner";
import { parsePanelKey } from "@/features/panel/surfaces";
import type { PanelState } from "./panelState";
import { putPanels, setPanelOwnership, takePanels } from "./panelStore";

/** メインのウィンドウ: チャット欄を別ウィンドウへ渡したあとか（戻される・別ウィンドウが閉じるまで） */
let handedOut = false;

/** チャット欄の欄か */
export const isSidePanel = (key: string): boolean => parsePanelKey(key)?.surface === "side";

/** 欄の中のターミナルのタブのキー（シェルのキー） */
export const terminalKeysOf = (panels: readonly (readonly [string, PanelState])[]): string[] =>
  panels.flatMap(([, state]) => state.tabs.flatMap((t) => (t.kind === "terminal" ? [t.key] : [])));

/**
 * メインのウィンドウ: チャット欄を別ウィンドウへ渡す（取り出して送り、このウィンドウでは描かず・下書きも書かない）。
 * holding なら別ウィンドウがもう持っているので送らずに捨てる（読み込み直したときに戻した下書きの写し）
 */
export function handSidePanelsOut(holding: boolean): void {
  // 渡したあとに「開いた」がもう一度届いても渡し直さない（取り出したあとなので空を渡し、別ウィンドウの中身を消してしまう）
  if (handedOut && !holding) return;
  handedOut = true;
  setPanelOwnership((key) => !isSidePanel(key));
  const taken = takePanels(isSidePanel);
  if (!holding) postWindowMessage({ type: "sidePanels", panels: taken });
}

/** メインのウィンドウ: 別ウィンドウが閉じた（戻さずに）。チャット欄をまたこのウィンドウで持つ */
export function ownSidePanelsAgain(): void {
  handedOut = false;
  setPanelOwnership(() => true);
}

/** メインのウィンドウ: 戻されたチャット欄を受け取る（シェルの持ち主をこのウィンドウにしてから返す。別ウィンドウはそのあと閉じる） */
export async function takeSidePanelsBack(panels: readonly (readonly [string, PanelState])[]): Promise<void> {
  handedOut = false;
  setPanelOwnership(() => true);
  putPanels(isSidePanel, panels);
  await Promise.all(terminalKeysOf(panels).map(claimTerminal));
}

/** チャット欄の別ウィンドウ: このウィンドウはチャット欄だけを持つ（ほかの欄の下書きは書かない） */
export function ownSidePanelsOnly(): void {
  setPanelOwnership(isSidePanel);
}

/** チャット欄の別ウィンドウ: 渡されたチャット欄を受け取る（シェルの持ち主は、タブを表示したときにつなぐ TerminalPane が替える。表示しないタブもこのウィンドウにする） */
export function adoptSidePanels(panels: readonly (readonly [string, PanelState])[]): void {
  setPanelOwnership(isSidePanel);
  putPanels(isSidePanel, panels);
  void Promise.all(terminalKeysOf(panels).map(claimTerminal));
}
