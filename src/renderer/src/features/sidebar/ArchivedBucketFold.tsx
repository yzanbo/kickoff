import { Archive } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import { toggleArchiveChat } from "@/features/chat/chatActions";
import type { ChatBucket } from "@/features/chatList/buckets";
import { useChatDropTarget } from "@/features/group/groups";
import { useFold } from "@/hooks/useFold";
import { FoldSection } from "@/ui/FoldHead";
import { reportFailure } from "@/ui/dialogs";
import { isForeignChat } from "./projectChatDrop";
import { busyBlockReason } from "@/features/chat/chatBusy";

/**
 * ドラッグで落としたチャットをアーカイブする（確かめてから。toggleArchiveChat）。groupId を渡すと、そのグループへも移す
 * （グループの中の「アーカイブ済み」へ、ほかのグループのチャットを落としたとき。null = グループから外す / undefined = 変えない）。
 * もうアーカイブ済みなら、移すだけ
 */
export async function archiveDroppedChat(chat: Chat, groupId?: number | null) {
  try {
    if (!chat.archived_at && !(await toggleArchiveChat(chat))) return;
    if (groupId !== undefined && chat.group_id !== groupId) await api.setChatGroup(chat.id, groupId);
  } catch (e) {
    reportFailure("アーカイブできませんでした")(e);
  }
}

/** ドラッグで落としたアーカイブ済みのチャットを戻す（確かめてから。toggleArchiveChat）。groupId を渡すと、そのグループへも移す */
export async function restoreDroppedChat(chat: Chat, groupId?: number | null) {
  try {
    if (!chat.archived_at || !(await toggleArchiveChat(chat))) return;
    if (groupId !== undefined && chat.group_id !== groupId) await api.setChatGroup(chat.id, groupId);
  } catch (e) {
    reportFailure("アーカイブから戻せませんでした")(e);
  }
}

/**
 * サイドバーのプロジェクトの、まとまりの外の落とし先: いちばん下の「アーカイブ済み」（・その代わりの「アーカイブ済みへ」）へ落とすとアーカイブ
 * （アーカイブしていないチャットだけ）、見出しの下の一覧へアーカイブ済みのチャットを落とすと戻す（どちらも確かめてから）
 */
export function useSidebarArchiveDrops(projectId: number, chats: readonly Chat[]) {
  const find = (id: number) => chats.find((c) => c.id === id);
  // ほかのプロジェクトのチャットは受けず、外側のプロジェクトのまとまり（確かめてから移す）へ渡す
  const foreign = (id: number) => isForeignChat(id, projectId);
  const archiveDrop = useChatDropTarget(
    (id) => {
      const chat = find(id);
      if (chat) void archiveDroppedChat(chat);
    },
    // 作業中のチャット（子孫も）はアーカイブできないので、落とせないことを見せる
    { accepts: (id) => find(id)?.archived_at === null, passThrough: foreign, blockedBy: (id) => busyBlockReason(id, "アーカイブ") },
  );
  const restoreDrop = useChatDropTarget(
    (id) => {
      const chat = find(id);
      if (chat) void restoreDroppedChat(chat);
    },
    { accepts: (id) => Boolean(find(id)?.archived_at), passThrough: foreign },
  );
  return { archiveDrop, restoreDrop };
}

/**
 * サイドバーのグループ別・作業場所別で、まとまり（グループ・No Group・作業場所）のいちばん下に置く、そのまとまりのアーカイブ済み
 * （bucketChats の archived: "nested" の bucket.archived。初めは閉じる。検索中は開いて見せる）。
 * アーカイブしていないチャットを落とすと、確かめてからアーカイブする（groupId があればそのグループへも移す）。
 * 中のアーカイブ済みの行は、まとまりの中身（グループ・No Group・一覧）へ落とすと、確かめてから戻す（落とし先の側）
 */
export function ArchivedBucketFold({
  projectId,
  bucket,
  chats,
  groupId,
  renderRow,
  forceOpen,
}: {
  projectId: number;
  bucket: ChatBucket;
  /** 落としたチャットを引く一覧（アーカイブ済みも含めたプロジェクトのチャット） */
  chats: readonly Chat[];
  /** 落としたチャットを移すグループ（グループ別のとき。作業場所別は undefined = 変えない） */
  groupId?: number | null;
  renderRow: (chat: Chat) => ReactNode;
  forceOpen: boolean;
}) {
  const fold = useFold("sidebar", bucket.key, { defaultOpen: false, forceOpen });
  const find = (id: number) => chats.find((c) => c.id === id);
  // 受けるのは、アーカイブしていないチャットと、ほかのグループのアーカイブ済み（移すだけ）
  const drop = useChatDropTarget(
    (id) => {
      const chat = find(id);
      if (chat) void archiveDroppedChat(chat, groupId);
    },
    {
      accepts: (id) => {
        const chat = find(id);
        return chat !== undefined && (!chat.archived_at || (groupId !== undefined && chat.group_id !== groupId));
      },
      passThrough: (id) => isForeignChat(id, projectId),
      // アーカイブするもの（アーカイブしていないチャット）だけ、作業中なら落とせない
      blockedBy: (id) => (find(id)?.archived_at ? null : busyBlockReason(id, "アーカイブ")),
    },
  );
  return (
    <div className={cx("archive-drop nested-archive", drop.over && (drop.blocked ? "drop-blocked" : "drop-target"))} {...drop.props}>
      <FoldSection look="row" icon={Archive} label="アーカイブ済み" count={bucket.chats.length} open={fold.open} onToggle={fold.toggle} title="ここへチャットをドラッグすると、確かめてからアーカイブします">
        <ul className="chat-rows archived-rows">{bucket.chats.map(renderRow)}</ul>
      </FoldSection>
    </div>
  );
}
