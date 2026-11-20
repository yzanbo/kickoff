// github の画面の保存（キーは kickoff:github:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, family, flag, json, number, text } from "@/foundation/ui/storage";
import { GITHUB_MERGE_METHODS } from "@shared/github/types";
import { DEFAULT_GITHUB_FILTERS, parseGitHubFilters } from "./githubFilters";
import { EMPTY_REVIEW_DRAFT, isEmptyReviewDraft, parseReviewDraft } from "./githubReviewDraft";

export const storage = defineSettings("github", {
  /** GitHub タブの一覧の絞り込み（プロジェクトごと。issue と PR で別々に、いま見ている種類も） */
  filters: family(json(parseGitHubFilters, DEFAULT_GITHUB_FILTERS), { ids: true }),
  /** PR のマージで前回選んだ方式（プロジェクトごと。確認の初めの選択） */
  mergeMethod: family(choice(GITHUB_MERGE_METHODS, "merge"), { ids: true }),
  /** PR のレビューの書きかけ（キーは「プロジェクト:PR の番号」。ためた行のコメントと本文。送ったら消す。アプリを閉じても残す） */
  reviewDraft: family(json(parseReviewDraft, EMPTY_REVIEW_DRAFT, isEmptyReviewDraft), { ids: true }),
  /** GitHub タブの左の一覧の幅（どのプロジェクトでも同じ） */
  listWidth: number(380),
  /** GitHub タブの左の一覧を隠しているか（どのプロジェクトでも同じ。一覧と中身を切り替える狭い所では効かない） */
  listHidden: flag(false),
  /** GitHub タブの PR の「変更」の左のファイルの木を閉じているか（初めは出す）と、その幅（どのプロジェクトでも同じ） */
  filesTreeHidden: flag(),
  filesWidth: number(240),
  /** CI のタブで開いている実行（プロジェクトごと。「43377548818」、ジョブも指すなら「43377548818:12345」） */
  ciSelected: family(text(), { ids: true }),
  /** CI のタブの左の一覧の幅（どのプロジェクトでも同じ） */
  ciListWidth: number(380),
  /** CI のタブの左の一覧を隠しているか（どのプロジェクトでも同じ。一覧と中身を切り替える狭い所では効かない） */
  ciListHidden: flag(false),
});
