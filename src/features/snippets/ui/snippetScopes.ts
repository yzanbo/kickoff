// 定型文の使う範囲（project_id）の選択肢と札。null は「すべてのプロジェクト」（札は「すべて」。どのプロジェクトと共通のチャットでも使う）、
// 共通のプロジェクトの id は「共通」（共通のチャットだけ）。「共通」は共通のチャット・共通のノートの意味だけに使い、null を「共通」と呼ばない
import type { Snippet } from "@shared/snippets/types";

/** 範囲の選択肢（value の null = すべてのプロジェクト） */
export interface SnippetScope {
  value: number | null;
  label: string;
}

/** project_id が null の範囲の呼び名 */
const ALL_PROJECTS_LABEL = "すべてのプロジェクト";
const COMMON_LABEL = "共通";

/** 範囲の選択肢と札を決めるもの（commonId: 共通のプロジェクトの id。使えなければ null） */
interface ScopeContext {
  commonId: number | null;
}

/**
 * 範囲の選択肢。here は開いている所（null = アプリの設定、共通の id = 共通の設定・共通のチャット、ほか = そのプロジェクト）。
 * アプリの設定は すべてのプロジェクト・共通・各プロジェクト（projects は選べるプロジェクト = アーカイブしていない利用者のもの）、
 * プロジェクトの中は すべてのプロジェクト / このプロジェクトだけ、共通の中は すべてのプロジェクト / 共通だけ
 */
export function snippetScopes(here: number | null, { commonId, projects }: ScopeContext & { projects: readonly { id: number; name: string }[] }): SnippetScope[] {
  const all: SnippetScope = { value: null, label: ALL_PROJECTS_LABEL };
  if (here === null) return [all, ...(commonId === null ? [] : [{ value: commonId, label: COMMON_LABEL }]), ...projects.map((p) => ({ value: p.id, label: p.name }))];
  return [all, { value: here, label: here === commonId ? "共通だけ" : "このプロジェクトだけ" }];
}

/** 一覧の範囲の札（すべて / 共通 / このプロジェクト / プロジェクトの名前。here はプロジェクトの画面の中のとき、そのプロジェクト） */
export function scopeLabel(
  snippet: Pick<Snippet, "project_id">,
  { commonId, here, nameOf }: ScopeContext & { here: number | null; nameOf: (id: number) => string | undefined },
): string {
  if (snippet.project_id === null) return "すべて";
  if (snippet.project_id === commonId) return COMMON_LABEL;
  if (snippet.project_id === here) return "このプロジェクト";
  return nameOf(snippet.project_id) ?? "もうないプロジェクト";
}
