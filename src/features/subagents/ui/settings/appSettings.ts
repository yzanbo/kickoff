// サブエージェントがアプリの設定に出す欄: 「表示」のサブエージェントを開く場所
import type { SettingsItemDef } from "@/features/settings/ui";
import { SubagentOpenField } from "./DisplayFields";

export const subagentOpenItem: SettingsItemDef = { id: "subagents.openIn", section: "display", order: 110, Component: SubagentOpenField };
