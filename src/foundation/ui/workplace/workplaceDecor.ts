// 作業場所の飾りの拡張点: 作業場所の札・選ぶ欄に、持ち主の機能が印・説明の行・名前に添える文を足す
// （github が PR の知らせ、worktrees が実行環境のポート・ワークツリーの帯・作る / 消す。土台は作業場所の機能を読まない）
import { createElement, useEffect, useState, type ComponentType } from "react";
import { definePoint } from "@/foundation/ui/points";
import type { useWorktrees } from "./worktreesStore";

/** そのプロジェクトのワークツリーの一覧（読み込み中は undefined） */
type WorktreeList = ReturnType<typeof useWorktrees>;
/** ワークツリー 1 つ（一覧の形から引く。土台は git の型を読まない） */
type Worktree = NonNullable<WorktreeList>[number];

/** ワークツリーを作る・消す（履歴の左の一覧の「ワークツリー」が使う。どちらも済んだら true、やめたら false。失敗は投げる） */
export interface WorkplaceActions {
  /** 名前を聞いて作る（repoName はリポジトリの一番上の名前。隣のフォルダの名前に使う） */
  create(projectId: number, repoName: string): Promise<boolean>;
  /** 確かめてから消す */
  remove(projectId: number, worktree: Worktree): Promise<boolean>;
}

/** 作業場所の右に出す帯の props（path はワークツリーのフォルダ。onFinished は片付けたあと = 作業場所を本体に戻す） */
export interface WorkplaceBarProps {
  projectId: number;
  path: string;
  onFinished: () => void;
}

export interface WorkplaceDecor {
  id: string;
  /** 札の後ろに添える印（path: null = 本体。狭い所は iconOnly） */
  Mark?: ComponentType<{ projectId: number; path: string | null; iconOnly?: boolean }>;
  /** 札の説明（乗せたとき）に添える行。list はそのプロジェクトのワークツリーの一覧（読み込み中は undefined） */
  lines?(projectId: number, path: string | null, list: WorktreeList): string[];
  /** 作業場所を選ぶ欄の名前に添える文（「マージ済み」など。なければ null）と、変わったら知らせる見張り（見ている間は読み込みも頼む） */
  note?: { text(path: string): string | null; watch(listener: () => void): () => void };
  /** ファイルタブでワークツリーを選んでいるとき、作業場所の右に出す帯 */
  Bar?: ComponentType<WorkplaceBarProps>;
  /** ワークツリーを作る・消す（登録した最初の 1 つを使う） */
  actions?: WorkplaceActions;
}

/** 作業場所の飾り（key は id） */
export const workplaceDecor = definePoint<WorkplaceDecor>("workplaceDecor", { key: (d) => d.id });

/** ワークツリーを作る・消す口（登録がなければ null = 作る・消すの項目を出さない） */
export const workplaceActions = (): WorkplaceActions | null => workplaceDecor.items().find((d) => d.actions)?.actions ?? null;

/** 札の後ろに添える印（飾りの登録の順） */
export const WorkplaceMarks = ({ projectId, path, iconOnly }: { projectId: number; path: string | null; iconOnly?: boolean }) =>
  workplaceDecor.items().map(({ id, Mark }) => Mark && createElement(Mark, { key: id, projectId, path, iconOnly }));

/** 作業場所の右に出す帯（飾りの登録の順） */
export const WorkplaceBars = (props: WorkplaceBarProps) => workplaceDecor.items().map(({ id, Bar }) => Bar && createElement(Bar, { key: id, ...props }));

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
