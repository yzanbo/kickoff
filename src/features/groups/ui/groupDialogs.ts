import type { ChatGroup } from "@shared/groups/types";
import { confirm, prompt } from "@/foundation/ui/kit/ask";
import { NO_GROUP_LABEL } from "@shared/groups/labels";

// グループの名前を聞く・削除を確かめるダイアログ（サイドバー・ボード・タブのまとまりの札・チャットのメニューで共通）

/** 新しいグループの名前を聞く（ボードの「グループを作成」・タブのまとまりの札・チャットの「グループを変更」で共通）。やめた・空なら null */
export async function askNewGroupName(confirmLabel = "作成"): Promise<string | null> {
  const name = await prompt({ title: "新しいグループ", label: "グループ名", placeholder: "例: コードレビュー", confirmLabel }).then((r) => r?.value ?? null);
  return name?.trim() || null;
}

/** グループの削除を確かめる（中のチャットは消えず、グループなしに戻る） */
export function confirmDeleteGroup(group: Pick<ChatGroup, "name">): Promise<boolean> {
  return confirm({
    title: `グループ「${group.name}」を削除しますか？`,
    message: `中のチャットは消えず、「${NO_GROUP_LABEL}」に戻ります。`,
    confirmLabel: "削除",
    danger: true,
  }).then((r) => r !== null);
}
