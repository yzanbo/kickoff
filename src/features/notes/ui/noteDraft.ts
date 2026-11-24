// まだ保存していないノートの保存の形（保存の宣言は storage.ts の draft）
/** まだ保存していないノート（storage.ts の draft の値） */
export interface NoteDraft {
  /** 書いたもの */
  text: string;
  /** 書き始めたときのノートの指紋（いまのノートと違えば、ほかで変わっている） */
  hash: string;
}

export function parseNoteDraft(value: unknown): NoteDraft | null | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { text: body, hash } = value as Record<string, unknown>;
  return typeof body === "string" && typeof hash === "string" ? { text: body, hash } : undefined;
}
