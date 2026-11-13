// チャットの AI が、このプロジェクトのメモ・同じ家系のチャットを画面に開く（kickoff_chat の open_memo・open_chat の中身。プロバイダーに依らない）。
// 開くだけで何も変えないので、聞かずに頼む（権限モード・Auto mode によらず承認カードを出さない）。コアは確かめてから SSE の open_view で頼み、
// Mac のアプリのメインのウィンドウが、画面のいまの開き方（右の欄 / 別ウィンドウ）で開く（画面が開いたかは待たない）
import fs from "node:fs/promises";
import path from "node:path";
import type { OpenChatInput, OpenMemoInput } from "@shared/chat/aiOpen";
import { memoExtensionOf } from "@shared/memo/kinds";
import { OPEN_PLACE_LABELS, type BusEvent, type Chat, type OpenPlace, type Project } from "@shared/types";
import type { Store } from "../db/store.js";
import { isInside, realPathOrSelf } from "../system/paths.js";
import { familyOf, lineageOf } from "./aiChatEdit.js";

/** メモ・家系のチャットを開くツールの中身（AI に返す文。開けなければ理由の文で throw） */
export interface AiOpenTools {
  openMemo(input: OpenMemoInput): Promise<string>;
  openChat(input: OpenChatInput): string;
}

export interface AiOpenDeps {
  store: Store;
  /** 画面に頼む（SSE） */
  publish: (event: BusEvent) => void;
  /** プロジェクトのメモのフォルダ（なければメモは開けない） */
  memoDirOf?: (project: Project) => string;
}

/** 文の中の名前（空なら「名前なし」） */
const nameOf = (title: string) => title.trim() || "（名前なし）";

/** 開く場所の言葉（省いたら設定の開き方） */
const placeText = (place: OpenPlace | undefined, setting: string) => (place ? OPEN_PLACE_LABELS[place] : `設定の「${setting}」の場所`);

/**
 * AI が渡したパスを、メモのフォルダからの相対パス（「/」区切り）にする。絶対パスはメモのフォルダの中だけ（リンクを解いた形でも比べる）。
 * 外を指す・フォルダそのもの・「.」で始まる名前は throw
 */
export function memoPathIn(dir: string, given: string): string {
  const raw = given.trim();
  if (!raw) throw new Error("path が空です。メモのフォルダからの相対パスか、メモのフォルダの中の絶対パスを渡してください");
  const abs = path.isAbsolute(raw) ? raw : path.join(dir, raw);
  const base = [dir, realPathOrSelf(dir)].find((d) => isInside(d, abs) || isInside(d, realPathOrSelf(abs)));
  if (!base) throw new Error(`${raw} はこのプロジェクトのメモのフォルダ（${dir}）の外です。開けるのはメモのフォルダの中のメモだけです`);
  const rel = path.relative(base, isInside(base, abs) ? abs : realPathOrSelf(abs)).split(path.sep).join("/");
  if (!rel) throw new Error("メモのフォルダそのものは開けません。メモのファイルを指してください");
  if (rel.split("/").some((part) => part.startsWith("."))) throw new Error("「.」で始まる名前のファイル・フォルダは、メモとして扱いません");
  return rel;
}

/**
 * chatId のチャットの AI に渡す、メモ・家系のチャットを開くツールの中身。家系とメモは呼ぶたびに引き直す
 */
export function createAiOpenTools({ store, publish, memoDirOf }: AiOpenDeps, chatId: number): AiOpenTools {
  const requireSelf = (): Chat => {
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
    return chat;
  };
  return {
    async openMemo(input) {
      const self = requireSelf();
      const project = store.projects.get(self.project_id);
      if (!project || !memoDirOf) throw new Error("このプロジェクトのメモのフォルダが分からないため、メモを開けません");
      const dir = memoDirOf(project);
      const rel = memoPathIn(dir, input.path);
      if (!memoExtensionOf(rel)) throw new Error(`${rel} はメモ（.md・.markdown・.html・.htm）ではありません`);
      const stat = await fs.stat(path.join(dir, rel)).catch(() => null);
      if (!stat?.isFile()) throw new Error(`メモ ${rel} が見つかりません（メモのフォルダ: ${dir}）`);
      publish({ type: "open_view", request: { kind: "memo", project_id: project.id, path: rel, place: input.place ?? null, lineage: lineageOf(store, self) } });
      return `メモ「${rel}」を${placeText(input.place, "チャットからメモを開く場所")}で開くよう、画面に頼みました（開けたかは返りません）。`;
    },
    openChat(input) {
      const self = requireSelf();
      const { members, relationOf } = familyOf(store, self);
      const target = members.find((c) => c.id === input.chat_id);
      if (!target) {
        throw new Error(
          `チャット ID ${input.chat_id} は、このチャットの家系（いちばん上の親チャットから下にぶら下がるチャット）にありません。開けるのは同じ家系のチャットだけです。list_family_chats で ID を確かめてください`,
        );
      }
      publish({ type: "open_view", request: { kind: "chat", place: input.place ?? null, lineage: lineageOf(store, target) } });
      const label = `チャット「${nameOf(target.title)}」（ID ${target.id}・${relationOf(target)}）`;
      // いちばん上の親チャットは右の欄・別ウィンドウに置けないので、チャットのパネルで開く
      if (target.parent_chat_id === null) return `${label}を、チャットのパネルで開くよう画面に頼みました（いちばん上の親チャットは右の欄・別ウィンドウには開きません）。`;
      return `${label}を${placeText(input.place, "子チャットを開く場所")}で開くよう、画面に頼みました（開けたかは返りません）。`;
    },
  };
}
