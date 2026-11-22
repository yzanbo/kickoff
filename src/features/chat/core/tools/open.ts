// 同じ家系のチャットを画面に開く・入力欄に下書きを入れるツール（kickoff_chat の open_chat・add_draft。定義と中身。プロバイダーに依らない）。
// 開く・入れるだけで送らないので、聞かずに頼む（権限モード・Auto mode によらず承認カードを出さない）。コアは確かめてから SSE の
// open_view・chat_draft で頼み、Mac のアプリのメインのウィンドウが、画面のいまの開き方（右の欄 / 別ウィンドウ）で開く（画面が開いたかは待たない）
import { z } from "zod";
import { defineAiTool, type AiToolDef } from "@/foundation/core/aiTools/tool";
import { OPEN_PLACE_LABELS, OPEN_PLACES, type OpenPlace } from "@shared/chat/openView";
import { chatName, type Chat } from "@shared/chat/types";
import type { BusEvent } from "@shared/foundation/contract";
import type { ChatStoreDeps } from "@/features/chat/core/stores";
import { familyOf, lineageOf } from "@/features/chat/core/family";
import { toolChat } from "./context";

/** 下書きの長さの上限（送る指示と同じ） */
const DRAFT_MAX = 50_000;

/** 開く場所の言葉（省いたら設定の開き方） */
const placeText = (place: OpenPlace | undefined, setting: string) => (place ? OPEN_PLACE_LABELS[place] : `設定の「${setting}」の場所`);

/** 開く場所の入力（開くツールで同じ形） */
export const openPlaceInput = () => z.enum(OPEN_PLACES).optional().describe("side = 右の欄（いちばん上の親チャットの画面）/ window = 別ウィンドウ。利用者が場所を言わなければ省く");

/** chatId のチャットの AI に渡す、家系のチャットを開く・下書きを入れるツール（家系は呼ぶたびに引き直す） */
export function chatOpenTools({ store, publish }: { store: Pick<ChatStoreDeps, "chats" | "projects">; publish: (event: BusEvent) => void }, chatId: number): { openChat: AiToolDef; addDraft: AiToolDef } {
  const { self: requireSelf } = toolChat(store.chats, chatId);
  /** 同じ家系のチャット（外なら理由の文で throw） */
  const familyMember = (self: Chat, id: number, verb: string) => {
    const { members, relationOf } = familyOf(store.chats, self);
    const target = members.find((c) => c.id === id);
    if (!target) {
      throw new Error(
        `チャット ID ${id} は、このチャットの家系（いちばん上の親チャットから下にぶら下がるチャット）にありません。${verb}のは同じ家系のチャットだけです。list_family_chats で ID を確かめてください`,
      );
    }
    return { target, label: `チャット「${chatName(target, "ai")}」（ID ${target.id}・${relationOf(target)}）` };
  };
  return {
    openChat: defineAiTool({
      server: "kickoff_chat",
      name: "open_chat",
      description: "同じ家系のチャット（子チャット・孫チャット・親など）を Kickoff の画面に開く（開くだけ）",
      input: { chat_id: z.number().int().describe("開くチャットの ID（分からなければ list_family_chats で確かめる）"), place: openPlaceInput() },
      run: (input) => {
        const { target, label } = familyMember(requireSelf(), input.chat_id, "開ける");
        publish({ type: "open_view", request: { kind: "chat", place: input.place ?? null, lineage: lineageOf(store.chats, target) } });
        // いちばん上の親チャットは右の欄・別ウィンドウに置けないので、チャットのパネルで開く
        if (target.parent_chat_id === null) return `${label}を、チャットのパネルで開くよう画面に頼みました（いちばん上の親チャットは右の欄・別ウィンドウには開きません）。`;
        return `${label}を${placeText(input.place, "子チャットを開く場所")}で開くよう、画面に頼みました（開けたかは返りません）。`;
      },
    }),
    addDraft: defineAiTool({
      server: "kickoff_chat",
      name: "add_draft",
      description: "同じ家系のチャットの入力欄に下書きを入れる（書きかけの後ろに足す。送らない）",
      input: {
        chat_id: z.number().int().describe("入れる先のチャットの ID（分からなければ list_family_chats で確かめる）"),
        text: z.string().min(1).describe("入れる文"),
      },
      run: (input) => {
        const self = requireSelf();
        const text = input.text.trim();
        if (!text) throw new Error("text が空です");
        if (text.length > DRAFT_MAX) throw new Error(`text は ${DRAFT_MAX} 文字までです`);
        const { target, label } = familyMember(self, input.chat_id, "下書きを入れられる");
        if (target.archived_at) throw new Error(`${label}はアーカイブ済みなので、下書きを入れられません`);
        // 親チャットに入れるなら「子チャットから渡した」の札も付ける（画面の「親チャットに渡す」と同じ）
        const from = target.id === self.parent_chat_id ? { chat_id: self.id, title: chatName(self, "ui") } : null;
        publish({ type: "chat_draft", request: { text, from, lineage: lineageOf(store.chats, target) } });
        return `${label}の入力欄に下書きを入れるよう、画面に頼みました（書きかけがあれば、その後ろに足します。送るのは利用者です）。`;
      },
    }),
  };
}
