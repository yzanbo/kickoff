import { Inbox } from "lucide-react";
import { useMemo } from "react";
import type { Chat } from "@shared/chat/types";
import { FOLD_ROW, FoldSection } from "@/foundation/ui/kit/FoldHead";
import { useFold } from "@/foundation/ui/hooks/useFold";
import { useChatStates, useChatsWithChildrenByProject } from "@/features/chat/ui";
import { BucketTree } from "@/features/chatList/ui";
import { inboxBuckets, inboxByProject, inboxSections, waitingSince } from "./inboxOrder";
import type { SidebarViewState } from "./viewFields";
import { INBOX_HEADS } from "./sidebarHeads";
import { useChatRowRenderer } from "./useChatRowRenderer";
import { useVisibleProjects } from "@/features/projects/ui";

/**
 * 要対応のチャットのまとまり。並べ方（order）は、状態順 = プロジェクトをまたいで回答待ち → エラー → 未読の見出しに分ける（見出しの中は待っている時間の長い順。
 * 行にどのプロジェクトかの印を添える）/ プロジェクト別 = サイドバーのプロジェクトの並びで見出しに分ける（見出しの中は状態順）。
 * variant: top = 一覧の上にまとめる（「要対応 n 件」の見出しで開閉し、その下にプロジェクトの一覧が続く）/ list = 要対応だけを並べる（これだけを並べる）。
 * 行はプロジェクトの一覧と同じ ChatRow（右クリック・名前の変更・複数選択）。出すのはサイドバーと同じく、しまっていない・タグの絞り込みに合うプロジェクトのチャット。
 * 子チャット（孫も）も並べ、押すと設定の開き方（右の欄 / 別ウィンドウ）で開く（未読の子チャットも数に入れるため）
 */
export function WaitingInbox({ variant, order }: { variant: "top" | "list"; order: SidebarViewState["waitingOrder"] }) {
  const chats = useChatsWithChildrenByProject();
  const { stateOf, approvals } = useChatStates();
  const { visible } = useVisibleProjects();
  // 並べ方ごとの見出し（状態順 = 状態の見出し / プロジェクト別 = プロジェクトの見出し）
  const buckets = useMemo(() => {
    const since = (chat: Chat, state: Parameters<typeof waitingSince>[1]) => waitingSince(chat, state, approvals);
    return order === "status"
      ? inboxBuckets(inboxSections(visible.flatMap((p) => chats[p.id] ?? []), stateOf, since), [])
      : inboxBuckets([], inboxByProject(visible, (id) => chats[id] ?? [], stateOf, since));
  }, [order, visible, chats, stateOf, approvals]);
  const projectOf = useMemo(() => new Map(visible.map((p) => [p.id, p])), [visible]);
  const total = buckets.reduce((n, b) => n + b.chats.length, 0);
  const rows = useChatRowRenderer();
  const topFold = useFold("sidebar", "waiting:top");

  const body =
    total === 0 ? (
      <p className="empty-note chat-search-empty waiting-inbox-empty">要対応のチャットはありません</p>
    ) : (
      <BucketTree
        buckets={buckets}
        heads={INBOX_HEADS}
        place="sidebar"
        renderRow={(chat) =>
          rows.renderRow(chat, {
            // 状態順はプロジェクトをまたぐので、どのプロジェクトかの印を添える（プロジェクト別は見出しで分かる）
            project: order === "status" ? projectOf.get(chat.project_id) : undefined,
            // 子チャットも親の外に 1 行で並ぶので、子チャットだと分かる札を付ける
            childMark: true,
          })
        }
      />
    );
  return (
    <div className={`waiting-inbox ${variant}`}>
      {variant === "top" ? (
        <FoldSection look={FOLD_ROW} icon={Inbox} title="要対応（回答待ち・エラー・未読）" open={topFold.open} onToggle={topFold.toggle} label="要対応" count={total}>
          {body}
        </FoldSection>
      ) : (
        body
      )}
      {rows.menuElement}
    </div>
  );
}
