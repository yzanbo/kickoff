// チャット欄（右端の欄。surface が side の欄）を、メインのウィンドウと別ウィンドウの間で受け渡す（状態の持ち主ごと移す。タブの後始末はしない）。
// 持っているウィンドウだけがその欄を描き・変え・下書きを残す（setPanelOwnership）。受け取った側は種類の onMoveToWindow でタブを自分のものにしてから
// （ターミナルはシェルの持ち主になってから）渡した側を閉じる
import { postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { parsePanelKey } from "@/features/panel/ui/surface";
import type { PanelState } from "./panelState";
import { kindOf, putPanels, setPanelOwnership, takePanels } from "./panelStore";

/** メインのウィンドウ: チャット欄を別ウィンドウへ渡したあとか（戻される・別ウィンドウが閉じるまで） */
let handedOut = false;

/** メインのウィンドウ: チャット欄を別ウィンドウへ渡しているか（ブラウザのタブを開く頼みをそちらへ回す。openBrowserTab.ts） */
export const sidePanelsHandedOut = (): boolean => handedOut;

/** チャット欄の欄か */
export const isSidePanel = (key: string): boolean => parsePanelKey(key)?.surface === "side";

/** 移ってきた欄のタブを、このウィンドウのものにする（種類の onMoveToWindow） */
const adoptTabs = (panels: readonly (readonly [string, PanelState])[]): Promise<unknown> =>
  Promise.all(panels.flatMap(([, state]) => state.tabs.map((t) => kindOf(t).onMoveToWindow?.(t))));

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
  if (!holding) postWindowMessage("sidePanels", { panels: taken });
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
  await adoptTabs(panels);
}

/** チャット欄の別ウィンドウ: このウィンドウはチャット欄だけを持つ（ほかの欄の下書きは書かない） */
export function ownSidePanelsOnly(): void {
  setPanelOwnership(isSidePanel);
}

/** チャット欄の別ウィンドウ: 渡されたチャット欄を受け取る（シェルの持ち主は、タブを表示したときにつなぐ TerminalPane が替える。表示しないタブもこのウィンドウにする） */
export function adoptSidePanels(panels: readonly (readonly [string, PanelState])[]): void {
  setPanelOwnership(isSidePanel);
  putPanels(isSidePanel, panels);
  void adoptTabs(panels);
}
