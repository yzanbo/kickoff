// 子チャットがアプリの設定に出す欄: 「表示」の子チャットを開く場所・作ったとき・親チャットに追加するとき・追加したあと
import type { SettingsItemDef } from "@/features/settings/ui";
import { ChildOpenField } from "./DisplayFields";
import { ChildChatCreateField } from "./ChildChatCreateField";
import { HandoffAfterField, HandoffViaField } from "./HandBackFields";

export const childChatsDisplayItems: SettingsItemDef[] = [
  { id: "childChats.openIn", section: "display", order: 120, Component: ChildOpenField },
  { id: "childChats.create", section: "display", order: 130, Component: ChildChatCreateField },
  { id: "childChats.handoffVia", section: "display", order: 140, Component: HandoffViaField },
  { id: "childChats.handoffAfter", section: "display", order: 150, Component: HandoffAfterField },
];
