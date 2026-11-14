// チャットの AI が返答の中に描く図（kickoff_chat の visual_guide・show_visual・update_visual の中身。プロバイダーに依らない）。
// 図の中身はツールの呼び出しの入力として記録に残り、画面とスマホが記録から描く（`@shared/chat/aiVisual` の collectVisuals）ので、
// ここは確かめて図の ID を返すだけ。何も変えないので聞かずに使わせる
import { randomBytes } from "node:crypto";
import { VISUAL_CODE_MAX, VISUAL_KINDS, VISUAL_TITLE_MAX, isVisualId, visualIdLine, type ShowVisualInput, type UpdateVisualInput, type VisualGuideTopic } from "@shared/chat/aiVisual";
import type { Store } from "../db/store.js";
import { visualGuide } from "./visualGuide.js";

/** 図のツールの中身（AI に返す文。描けなければ理由の文で throw） */
export interface AiVisualTools {
  guide(topics: readonly VisualGuideTopic[]): string;
  show(input: ShowVisualInput): string;
  update(input: UpdateVisualInput): string;
}

/** 新しい図の ID（「v-」と英小文字・数字 8 文字） */
function newVisualId(): string {
  const digits = "abcdefghijklmnopqrstuvwxyz0123456789";
  return `v-${[...randomBytes(8)].map((b) => digits[b % digits.length]).join("")}`;
}

/** 中身と題名を確かめる */
function checkCode(code: string, title: string | undefined) {
  if (!code.trim()) throw new Error("code が空です。図の中身（SVG・HTML・Mermaid の文）を渡してください");
  if (code.length > VISUAL_CODE_MAX) throw new Error(`code が長すぎます（${code.length} 文字。${VISUAL_CODE_MAX} 文字まで）。小さく分けて描いてください`);
  if (title !== undefined && title.length > VISUAL_TITLE_MAX) throw new Error(`title は ${VISUAL_TITLE_MAX} 文字までです`);
}

export function createAiVisualTools(store: Store, chatId: number): AiVisualTools {
  return {
    guide: (topics) => visualGuide(topics),
    show({ kind, code, title }) {
      if (!(VISUAL_KINDS as readonly string[]).includes(kind)) throw new Error(`kind は ${VISUAL_KINDS.join(" / ")} のどれかです`);
      checkCode(code, title);
      const id = newVisualId();
      const name = title?.trim() ? `「${title.trim()}」` : "図";
      return `${name}を返答のこの位置に描きました。${visualIdLine(id)}（描き直すときは update_visual にこの visual_id を渡してください。利用者に ID を見せる必要はありません）`;
    },
    update({ visual_id, code, title }) {
      if (!isVisualId(visual_id) || !store.events.hasToolResultWith(chatId, visualIdLine(visual_id))) {
        throw new Error(`visual_id「${visual_id}」の図はこのチャットにありません。show_visual が返した visual_id を渡してください（ほかのチャットの図は描き直せません）`);
      }
      checkCode(code, title);
      return `図を元の位置で描き直しました。${visualIdLine(visual_id)}`;
    },
  };
}
