// 作業場所の飾りの拡張点: 作業場所の札・選ぶ欄に、持ち主の機能が印・説明の行・名前に添える文を足す
// （github が PR の知らせ、worktrees が実行環境のポート。土台は作業場所の機能を読まない）
import { useEffect, useState, type ComponentType } from "react";
import { definePoint } from "@/foundation/ui/points";
import type { useWorktrees } from "./worktreesStore";

/** そのプロジェクトのワークツリーの一覧（読み込み中は undefined） */
type WorktreeList = ReturnType<typeof useWorktrees>;

export interface WorkplaceDecor {
  id: string;
  /** 札の後ろに添える印（path: null = 本体。狭い所は iconOnly） */
  Mark?: ComponentType<{ projectId: number; path: string | null; iconOnly?: boolean }>;
  /** 札の説明（乗せたとき）に添える行。list はそのプロジェクトのワークツリーの一覧（読み込み中は undefined） */
  lines?(projectId: number, path: string | null, list: WorktreeList): string[];
  /** 作業場所を選ぶ欄の名前に添える文（「マージ済み」など。なければ null）と、変わったら知らせる見張り（見ている間は読み込みも頼む） */
  note?: { text(path: string): string | null; watch(listener: () => void): () => void };
}

/** 作業場所の飾り（key は id） */
export const workplaceDecor = definePoint<WorkplaceDecor>("workplaceDecor", { key: (d) => d.id });

/** 札の説明に添える行（飾りの登録の順） */
export const workplaceDecorLines = (projectId: number, path: string | null, list: WorktreeList): string[] =>
  workplaceDecor.items().flatMap((d) => d.lines?.(projectId, path, list) ?? []);

/** version は描き直しのきっかけ（飾りの文が変わるたびに増える。同じ version の間は同じ答え） */
function noteLookup(_version: number): (path: string) => string | null {
  const notes = workplaceDecor.items().flatMap((d) => (d.note ? [d.note] : []));
  return (path) => {
    for (const note of notes) {
      const text = note.text(path);
      if (text !== null) return text;
    }
    return null;
  };
}

/** 作業場所を選ぶ欄の名前に添える文を引く関数（飾りの文が変わったら新しい関数になる） */
export function useWorkplaceNotes(): (path: string) => string | null {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const offs = workplaceDecor.items().flatMap((d) => (d.note ? [d.note.watch(() => setVersion((v) => v + 1))] : []));
    return () => offs.forEach((off) => off());
  }, []);
  return noteLookup(version);
}
