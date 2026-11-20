// 送る前の新しいチャットのタブを、ウィンドウの間で渡す（書きかけの文・添付は別ウィンドウの URL に入らないので、localStorage の storage.settings.popoutTabHandoff に置き、
// 受け取った側が取り出して消す。別ウィンドウへ移す popOutTab・別ウィンドウから戻す dockPopout）
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "@/features/panel/ui/storage";
import type { PanelTab } from "./panelTypes";

type NewChatTab = Extract<PanelTab, { kind: "new" }>;

/** 渡すタブを置く */
export function handOffTab(tab: NewChatTab): void {
  writeSetting(storage.settings.popoutTabHandoff, { ...readSetting(storage.settings.popoutTabHandoff), [tab.key]: tab });
}

/** 渡されたタブを取り出す（取り出したら消す。ない・形が合わなければ undefined） */
export function takeHandedTab(key: string): NewChatTab | undefined {
  const all = readSetting(storage.settings.popoutTabHandoff);
  const found = all[key];
  if (!found) return undefined;
  const { [key]: _taken, ...rest } = all;
  writeSetting(storage.settings.popoutTabHandoff, rest);
  const tab = found as Partial<NewChatTab>;
  return tab.kind === "new" && tab.key === key && typeof tab.projectId === "number" ? (tab as NewChatTab) : undefined;
}
