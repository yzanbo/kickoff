import type { ChatEvent } from "@shared/types";

/**
 * チャット欄の ↑↓ で呼び出す、前に送った自分の発言。
 * 判定はここの純粋関数に集め、Composer は usePromptHistory からキーを渡すだけにする
 */

/** チャットのイベントから、自分の発言を新しい順に（文のない添付だけの発言は除き、続けて同じ文は 1 つにまとめる） */
export function userPrompts(events: ChatEvent[]): string[] {
  const prompts: string[] = [];
  for (const e of events) {
    if (e.type !== "user") continue;
    const text = (e.data as { text?: string }).text?.trim();
    if (!text || prompts[prompts.length - 1] === text) continue;
    prompts.push(text);
  }
  return prompts.reverse();
}

export interface HistoryInput {
  key: "ArrowUp" | "ArrowDown";
  /** 前に送った発言（新しい順） */
  prompts: string[];
  /** いま出している発言の位置（-1 = 呼び出していない） */
  index: number;
  /** 入力欄の文 */
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface HistoryMove {
  index: number;
  text: string;
  /** 入れたあとのキャレットの位置 */
  caret: number;
}

/**
 * ↑↓ で履歴を動かすなら、次の状態を返す（普通のカーソル移動に任せるなら null）。
 * 使えるのは、入力欄が空のときと、呼び出した文を書き換えずに出している間だけ。
 * 複数行の文では、↑ はキャレットが 1 行目にあるとき、↓ は最後の行にあるときだけ履歴に使う
 */
export function historyMove({ key, prompts, index, text, selectionStart, selectionEnd }: HistoryInput): HistoryMove | null {
  // 書き換えていない呼び出し中の文か、空の入力欄でなければ使わない
  const current = index >= 0 && prompts[index] === text ? index : text === "" ? -1 : null;
  if (current === null || selectionStart !== selectionEnd) return null;
  const caret = selectionStart;
  if (key === "ArrowUp") {
    if (text.slice(0, caret).includes("\n")) return null;
    const next = current + 1;
    if (next >= prompts.length) return null;
    const recalled = prompts[next];
    // 続けて ↑ を押せるよう、キャレットは 1 行目の終わりに置く（1 行の文なら文の終わり）
    const firstLineEnd = recalled.indexOf("\n");
    return { index: next, text: recalled, caret: firstLineEnd === -1 ? recalled.length : firstLineEnd };
  }
  if (current < 0 || text.slice(caret).includes("\n")) return null;
  const next = current - 1;
  // いちばん新しい発言を越えたら、呼び出す前の空の入力欄に戻す
  const restored = next >= 0 ? prompts[next] : "";
  return { index: next, text: restored, caret: restored.length };
}

/** 自分の指示の一覧（指示の履歴・⌘⌥↑ / ↓）の 1 行 */
export interface PromptEntry {
  id: number;
  /** 送った文（添付だけなら空） */
  text: string;
  /** 一覧に出す名前（文。添付だけならファイル名） */
  label: string;
  at: string;
}

/** チャットのイベントから、自分の指示を会話の順に */
export function promptEntries(events: ChatEvent[]): PromptEntry[] {
  return events
    .filter((e) => e.type === "user")
    .map((e) => {
      const data = e.data as { text?: string; attachments?: { name: string }[] };
      const text = String(data.text ?? "").trim();
      return { id: e.id, text, label: text || (data.attachments ?? []).map((a) => a.name).join("、"), at: e.created_at };
    });
}
