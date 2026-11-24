// まとまりの木（BucketTree.tsx）の決め方のうち、部品・店を読まない純粋なもの（開いているか・固定したものを小見出しへ分ける）
import type { Chat } from "@shared/chat/types";
import type { ChatBucket, DraftTarget } from "./buckets";

/** 下書き（固定したものは「固定」の小見出しへ分ける） */
export type TreeDraft = DraftTarget & { pinned?: boolean };

/** まとまりが開いているか（まとめない all・絞り込み中はいつも開く。覚えた値がなければ、アーカイブ済みだけ閉じる） */
export const bucketOpen = (bucket: Pick<ChatBucket, "key" | "kind">, forceOpen: boolean, isOpen: (key: string, defaultOpen: boolean) => boolean): boolean =>
  bucket.kind === "all" || forceOpen || isOpen(bucket.key, bucket.kind !== "archived");

/** 固定の小見出しに入るか（アーカイブ済みは固定に数えない） */
const pinnedChat = (c: Chat) => c.pinned && !c.archived_at;

/**
 * 固定したチャットと下書きを「固定」の小見出しのまとまり（種類 pinned）に分け、残りを返す
 * （状態順でも、中の段の「固定」は重ねない）
 */
export function splitPinned<D extends TreeDraft>(bucket: ChatBucket<D>) {
  const pinnedChats = bucket.chats.filter(pinnedChat);
  const pinnedDrafts = bucket.drafts.filter((d) => d.pinned);
  const regularChats = bucket.chats.filter((c) => !pinnedChat(c));
  const regularDrafts = bucket.drafts.filter((d) => !d.pinned);
  const pinned: ChatBucket<D> = { ...bucket, key: `${bucket.key}/pinned`, kind: "pinned", chats: pinnedChats, drafts: pinnedDrafts, children: undefined, archived: undefined };
  return {
    pinned,
    regularChats,
    regularDrafts,
    regularSections: bucket.children?.filter((b) => b.kind !== "pinned"),
    hasPinned: pinnedChats.length > 0 || pinnedDrafts.length > 0,
    hasRegular: regularChats.length > 0 || regularDrafts.length > 0,
  };
}
