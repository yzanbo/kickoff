import { Folder } from "lucide-react";
import type { CSSProperties } from "react";
import type { Chat } from "@shared/types";
import { useGroup } from "@/stores/groups";

/**
 * どのグループのチャットかの札（グループの色。タブの名前の後ろの札・グループ別のまとまりの札と同じ色 --group-hue。形はブランチの印と同じ小さなピル）。
 * チャットの見出しとサイドバーの行（2 行のとき）で使う。グループなし・読み込み中・もうないグループは出さない
 */
export function GroupChip({ chat }: { chat: Pick<Chat, "project_id" | "group_id"> }) {
  const group = useGroup(chat.project_id, chat.group_id);
  if (!group) return null;
  return (
    <span className="chat-group-chip" style={{ "--group-hue": group.hue } as CSSProperties} title={`グループ「${group.name}」のチャット`}>
      <Folder size={11} aria-hidden />
      <span className="chip-name">{group.name}</span>
    </span>
  );
}
