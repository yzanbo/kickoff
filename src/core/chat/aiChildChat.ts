// チャットの AI が自分の子チャットを作る（kickoff_chat のツールの中身。プロバイダーに依らない）。
// 親はいつも、ツールを呼んだチャット自身（引数で親を選べないので、ほかのチャットの子は作れない）。
// 作って最初の依頼を送るだけで、子の答えは待たない（答えは利用者が子チャットで見て、要れば「親チャットに追加」で渡す）
import { AI_CHILD_CHAT_MAX_DEPTH, childChatMark } from "@shared/chat/aiChildChat";
import { childDepthLabel } from "@shared/chat/childDepth";
import type { Chat } from "@shared/types";
import type { Store } from "../db/store.js";
import type { ChildChatInput } from "./children.js";

/** 作った子チャットと、親の会話を引き継いだか（写し終えた・いま写している） */
export interface StartedChild {
  chat: Chat;
  inherited: boolean;
}

/** AI が頼んだ子チャット（承認カードに出す） */
export interface AiChildChatRequest {
  text: string;
  title: string | null;
  inherit: boolean;
}

/** 利用者の答え（allow_always は「次から聞かない」= 設定を「聞かずに作る」にする） */
export type AiChildChatDecision = { action: "allow" } | { action: "allow_always" } | { action: "deny"; message: string | null };

/** 子チャットを作るツールの中身（作れたら AI に返す文。作れなければ理由の文で throw） */
export interface AiChildChatTools {
  create(input: { text: string; title?: string; inherit?: boolean }, approve: (request: AiChildChatRequest) => Promise<AiChildChatDecision>): Promise<string>;
}

/** 根のチャットから何段目か（親のないチャット = 0。親子が輪になっていても止まる） */
export function chatDepth(store: Store, chat: Chat): number {
  const seen = new Set<number>([chat.id]);
  let depth = 0;
  let parentId = chat.parent_chat_id;
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId);
    depth++;
    parentId = store.chats.get(parentId)?.parent_chat_id ?? null;
  }
  return depth;
}

/** このチャットの AI に、子チャットを作るツールを渡すか（設定で止めていない・作る子チャットが深さの上限を超えない） */
export function canCreateChildChat(store: Store, chat: Chat): boolean {
  return store.settings.get().ai_child_chat !== "off" && chatDepth(store, chat) < AI_CHILD_CHAT_MAX_DEPTH;
}

/**
 * chatId のチャットの AI に渡す、子チャットを作るツールの中身。設定と深さは呼ぶたびに確かめ直す（作業の途中で設定を変えたら次の呼び出しから効く）。
 * 設定が「毎回聞く」なら approve で利用者に聞く（権限モード・Auto mode によらない）。「常に許可」なら設定を「聞かずに作る」にしてから作る
 */
export function createAiChildChatTools(deps: { store: Store; startChild: (parent: Chat, input: ChildChatInput) => Promise<StartedChild> }, chatId: number): AiChildChatTools {
  const { store } = deps;
  const requireParent = () => {
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
    return chat;
  };
  return {
    async create(input, approve) {
      const text = input.text.trim();
      if (!text) throw new Error("子チャットに送る依頼の文（text）が空です");
      const parent = requireParent();
      const mode = store.settings.get().ai_child_chat;
      if (mode === "off") throw new Error("利用者が設定（チャット →「AI が子チャットを作るとき」）で、AI が子チャットを作るのを止めています");
      if (chatDepth(store, parent) >= AI_CHILD_CHAT_MAX_DEPTH) {
        throw new Error(`AI が作れる子チャットは${childDepthLabel(AI_CHILD_CHAT_MAX_DEPTH)}までです。このチャットからは、これより深い子チャットを作れません`);
      }
      const request: AiChildChatRequest = { text, title: input.title?.trim() || null, inherit: input.inherit ?? true };
      if (mode === "ask") {
        const decision = await approve(request);
        if (decision.action === "deny") throw new Error(decision.message ? `利用者が断りました: ${decision.message}` : "利用者が断りました");
        if (decision.action === "allow_always") store.settings.update({ ai_child_chat: "allow" });
      }
      // 聞いている間に親が消えていないか確かめ直す。聞いた位置は、いまの作業のもとになった自分の発言（その発言の下に子チャットの札が出る）
      const { chat: child, inherited } = await deps.startChild(requireParent(), {
        text,
        quote: null,
        inherit: request.inherit,
        eventId: store.events.latestUserId(chatId),
        ...(request.title ? { title: request.title } : {}),
      });
      // 引き継げたら、子は親の会話を写したセッションで始まる（写すのは作ったあと。引き継げなければ、依頼の文だけで始まりお知らせが残る）
      return resultText(child, request.inherit ? (inherited ? "inherited" : "failed") : "fresh");
    },
  };
}

/** 会話を引き継いだか（引き継いだ / 頼んだが引き継げなかった / 頼まなかった）ごとの、AI に伝える文 */
const INHERIT_TEXT = {
  inherited: "子チャットは、このチャットの会話のうち、いまの作業より前に終わったところまでを引き継いでいます。",
  failed: "このチャットの会話は引き継げなかったので（まだ終わった作業がないなど）、子チャットは依頼の文だけで始めています。",
  fresh: "子チャットは、このチャットの会話を引き継がずに、依頼の文だけで始めています。",
} as const;

/** 作ったことを AI に伝える文（引き継いだか・子の答えは返らないこと・同じ依頼で作り直さないことも） */
function resultText(child: Chat, inherit: keyof typeof INHERIT_TEXT): string {
  const name = child.title.trim() || "（名前は依頼の文から付きます）";
  return [
    `子チャット「${name}」を作り、依頼を送りました${childChatMark(child.id)}。`,
    INHERIT_TEXT[inherit],
    "子チャットの答えはこのツールには返りません。利用者が子チャットを開いて見ます（要れば利用者が「親チャットに追加」で、このチャットに渡します）。答えを待たずに、いまの作業を続けてください。同じ依頼で何度も作らないでください。",
  ].join("\n");
}
