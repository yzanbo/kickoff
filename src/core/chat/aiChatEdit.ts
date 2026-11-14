// チャットの AI が、同じ家系のチャット（いちばん上の親チャットから下にぶら下がるチャットの全部）の名前・固定・グループを変え、子チャットを親から外す
// （kickoff_chat の list_family_chats・update_chat の中身。プロバイダーに依らない）。
// 名前・固定・グループは利用者がいつでも戻せるので、聞かずに変える（権限モード・Auto mode によらず承認カードを出さない）。親から外すのも聞かないが、
// 戻せないので、ツールの説明で利用者に頼まれたときだけ使うよう伝える（2026-11-14 に利用者と決めた）。
// 家系の外のチャットは変えられない。読み書きは店（store.chats・store.groups）を通し、変えたら店の知らせで画面に届く
import type { UpdateChatInput } from "@shared/chat/aiChatEdit";
import { errorMessage } from "@shared/errors";
import { CHAT_TITLE_MAX, type Chat } from "@shared/types";
import type { Store } from "../db/store.js";
import { familyOrder, familyRelation } from "./chatFamily.js";
import { detachChat } from "./detach.js";

/** 名前・固定・グループを変えるツールの中身（AI に返す文。変えられなければ理由の文で throw） */
export interface AiChatEditTools {
  listFamily(): string;
  update(input: UpdateChatInput): string;
}

/** 系譜をたどる深さの上限（親子が輪になっていても止まるように） */
const MAX_DEPTH = 20;

/** 文の中の名前（空なら「名前なし」） */
const nameOf = (title: string) => title.trim() || "（名前なし）";

/** いちばん上の親チャットから、そのチャット自身までの並び */
export function lineageOf(store: Store, chat: Chat): Chat[] {
  const path = [chat];
  const seen = new Set([chat.id]);
  let parentId = chat.parent_chat_id;
  while (parentId !== null && !seen.has(parentId) && path.length <= MAX_DEPTH) {
    const parent = store.chats.get(parentId);
    if (!parent) break;
    seen.add(parent.id);
    path.unshift(parent);
    parentId = parent.parent_chat_id;
  }
  return path;
}

/** 家系のチャット（親のすぐ下に子が続く並び）と、それぞれのいちばん上の親からのパス（関係の呼び名に使う） */
export function familyOf(store: Store, self: Chat) {
  const root = lineageOf(store, self)[0];
  const members = familyOrder(root, store.chats.descendants(root.id));
  const paths = new Map<number, number[]>();
  for (const m of members) {
    const parentPath = m.parent_chat_id === null ? [] : (paths.get(m.parent_chat_id) ?? []);
    paths.set(m.id, [...parentPath, m.id]);
  }
  const selfPath = paths.get(self.id) ?? [self.id];
  const relationOf = (chat: Chat) => familyRelation(selfPath, paths.get(chat.id) ?? [chat.id]);
  return { members, relationOf };
}

/**
 * chatId のチャットの AI に渡す、家系のチャットの名前・固定・グループを変えるツールの中身。家系は呼ぶたびに引き直す
 * （作業の途中で子チャットが増えた・消えたら次の呼び出しから効く）
 */
export function createAiChatEditTools(store: Store, chatId: number, isBusy: (chatId: number) => boolean): AiChatEditTools {
  const requireSelf = () => {
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
    return chat;
  };
  const groupOf = (chat: Chat) => {
    const group = chat.group_id === null ? undefined : store.groups.get(chat.group_id);
    return group ? { id: group.id, name: group.name } : null;
  };
  return {
    listFamily() {
      const self = requireSelf();
      const { members, relationOf } = familyOf(store, self);
      return JSON.stringify(
        {
          self_id: self.id,
          chats: members.map((c) => ({
            id: c.id,
            title: c.title,
            relation: relationOf(c),
            is_self: c.id === self.id,
            parent_id: c.parent_chat_id,
            pinned: c.pinned,
            group: groupOf(c),
            archived: c.archived_at !== null,
          })),
          groups: store.groups.list(self.project_id).map((g) => ({ id: g.id, name: g.name })),
          note: "update_chat で変えられるのは、この一覧のチャットだけ。グループに入れられるのは親のないチャット（parent_id が null）だけで、groups から選ぶ（グループは作れない）。子チャットは parent_id で親から外せる（null = 親のないチャット、自分の先祖の ID = その子に上げる。利用者に頼まれたときだけ）。",
        },
        null,
        2,
      );
    },
    update(input) {
      const self = requireSelf();
      const { members, relationOf } = familyOf(store, self);
      const target = members.find((c) => c.id === input.chat_id);
      if (!target) {
        throw new Error(
          `チャット ID ${input.chat_id} は、このチャットの家系（いちばん上の親チャットから下にぶら下がるチャット）にありません。変えられるのは同じ家系のチャットだけです。list_family_chats で ID を確かめてください`,
        );
      }
      if (input.title === undefined && input.pinned === undefined && input.group_id === undefined && input.parent_id === undefined) {
        throw new Error("変える項目がありません。title・pinned・group_id・parent_id のどれかを渡してください（省いた項目は変えません）");
      }
      // 親から外す（parent_id）。グループは親のないチャットにするときだけ一緒に渡せる
      const detaching = input.parent_id !== undefined;
      if (detaching && target.parent_chat_id === null) throw new Error("親のないチャットです（parent_id で外せるのは子チャットだけです）");
      if (detaching && input.parent_id !== null && input.group_id !== undefined && input.group_id !== null) {
        throw new Error("グループに入れられるのは親のないチャットだけです（先祖の子に上げるときは group_id を渡さないでください）");
      }
      // 先にすべて確かめてから変える（途中で断って一部だけ変わらないように）
      const title = input.title?.trim();
      if (title !== undefined && !title) throw new Error("名前（title）が空です");
      if (title !== undefined && title.length > CHAT_TITLE_MAX) throw new Error(`名前（title）は ${CHAT_TITLE_MAX} 文字までです`);
      const group = input.group_id === undefined || input.group_id === null ? null : store.groups.get(input.group_id);
      if (input.group_id !== undefined) {
        if (target.parent_chat_id !== null && !(detaching && input.parent_id === null)) {
          throw new Error("子チャットはグループに入りません（グループを変えられるのは親のないチャットだけです。parent_id: null で親から外すなら、一緒にグループへ入れられます）");
        }
        if (input.group_id !== null && (!group || group.project_id !== target.project_id)) {
          throw new Error(
            `グループ ID ${input.group_id} はこのプロジェクトにありません（ほかのプロジェクトのグループ・ないグループは選べず、グループは作りません）。list_family_chats の groups から選んでください`,
          );
        }
      }

      const changes: string[] = [];
      // 親から外すのを先にする（先祖でない ID・作業中などで断るときは、ほかの項目も変えないように）
      if (detaching) {
        const parentId = input.parent_id ?? null;
        const before = target.parent_chat_id === null ? null : store.chats.get(target.parent_chat_id);
        try {
          detachChat(store, isBusy, target, { parentId, groupId: parentId === null ? (input.group_id ?? null) : null });
        } catch (e) {
          throw new Error(`親から外せませんでした: ${errorMessage(e)}`, { cause: e });
        }
        const to = parentId === null ? null : store.chats.get(parentId);
        changes.push(to ? `「${nameOf(before?.title ?? "")}」から「${nameOf(to.title)}」の子に上げた` : `「${nameOf(before?.title ?? "")}」から外して親のないチャットにした${group ? `（グループ「${group.name}」）` : ""}`);
      }
      if (title !== undefined && title !== target.title) {
        store.chats.update(target.id, { title });
        changes.push(`名前を「${nameOf(target.title)}」から「${title}」に変えた`);
      }
      if (input.pinned !== undefined && input.pinned !== target.pinned) {
        store.chats.setPinned(target.id, input.pinned);
        changes.push(input.pinned ? "固定した" : "固定を外した");
      }
      if (!detaching && input.group_id !== undefined && input.group_id !== target.group_id) {
        store.chats.setGroup(target.id, input.group_id);
        changes.push(group ? `グループ「${group.name}」に入れた` : "グループから外した");
      }
      const label = `チャット「${nameOf(title ?? target.title)}」（ID ${target.id}・${relationOf(target)}）`;
      return changes.length > 0 ? `${label}を変えました: ${changes.join("・")}。` : `${label}は、もともと頼まれた値だったので変えていません。`;
    },
  };
}
