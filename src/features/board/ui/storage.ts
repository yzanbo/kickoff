// board の画面の保存（キーは kickoff:board:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, flag, json, list, namedViews } from "@/foundation/ui/storage";
import { DEFAULT_ALL_PROJECTS_VIEWS, DEFAULT_PROJECT_VIEWS } from "./initialViews";

/** 段の分け方（プロジェクトのボードと全プロジェクトのボードで同じ選択肢） */
const LANES = ["group", "worktree", "project"] as const;

/** 並び順（列の名前と向き。列の名前が使えるかは読む側で確かめる） */
function parseSortPair(value: unknown): { key: string; dir: "asc" | "desc" } | null | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { key, dir } = value as Record<string, unknown>;
  return typeof key === "string" && (dir === "asc" || dir === "desc") ? { key, dir } : undefined;
}

/** 形を確かめずにオブジェクトとして読む（中身は読む側で確かめる） */
function parseLooseObject(value: unknown): Readonly<Record<string, unknown>> | null | undefined {
  if (value === null) return null;
  return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export const storage = defineSettings("board", {
  /**
   * 全プロジェクトのボードの列（state = 状態ごと / groups = プロジェクトの段ごとにグループの列（ドラッグでグループを移す）/
   * none = 分けない。下書きもチャットも 1 つの並び（最近動いた順）にする）
   */
  columnsAll: choice(["state", "groups", "none"], "state"),
  /** グループの列の中を、状態（作業中・回答待ち・未読・既読）で小分けにするか（全プロジェクトのボードの列の「状態」と「グループ」の両方オン = グループ×状態） */
  groupsByState: flag(),
  /**
   * プロジェクトのボードの列の分け方（state = 状態ごと / groups = グループの列（カードをドラッグしてグループを移す。groupsByState なら中を状態で小分け）/
   * none = 分けない。ボードとリストで共通。全プロジェクトのボードの columnsAll とは別に覚える）
   */
  columnsProject: choice(["state", "groups", "none"], "state"),
  /** ボードの表示（board = 列を横に並べる / list = まとまりを縦に並べる。すべてのボードで共通） */
  view: choice(["board", "list"], "board"),
  /** ボードを段（スイムレーン）に分けるか（ボード・リストで共通。分け方は lanes・lanesAll） */
  split: flag(),
  /**
   * ボードのチャットの並び順（ツールバーの「並び順」で選び、ボード・リストの列・まとまりの中に効く。すべてのボードで共通）。
   * 列の名前は features/board/chatSort.ts の CHAT_SORT_KEYS（知らない名前は、読む側で初めの並び = 最後に動いた順にする）
   */
  sort: json(parseSortPair, null, (v) => v === null),
  /**
   * ボードのカード・リストの行・フィードのカードで隠している項目（ツールバーの「表示項目」。features/board/cardFields.ts の CARD_FIELDS。すべてのボードで共通）。
   * 初めに出すのは状態・プロジェクト（全プロジェクトのボードだけ）・モデル・最終更新で、ほかは隠す（利用者の指定。メニューの「既定に戻す」でこの値に戻す）
   */
  cardHidden: list(["group", "worktree", "pending", "turns", "cost", "context", "created"]),
  /**
   * 保存したボードのビュー（表示・段・列の分け方・並び順・アーカイブの絞り込みの組に名前を付けたもの。features/board/savedViews.ts）。
   * 全プロジェクトのボードとプロジェクトのボード（すべてのプロジェクトで共通）で別に覚える
   */
  // 覚えていなければ初めのビュー（DEFAULT_ALL_PROJECTS_VIEWS・DEFAULT_PROJECT_VIEWS）。すべて消したら [] を覚え、初めのビューには戻さない
  viewsAll: namedViews(DEFAULT_ALL_PROJECTS_VIEWS),
  views: namedViews(DEFAULT_PROJECT_VIEWS),
  /**
   * ボードごとの最後の見え方（features/board/savedViews.ts の BoardViewState。読む側で確かめる）。表示・並び順などの設定はすべてのボードで共通なので、
   * ボードを移る（全プロジェクト ⇄ プロジェクト）たびに、そのボードで最後に見ていた見え方に戻す（覚えていなければ最初のビュー）。
   * プロジェクトのボードはすべてのプロジェクトで共通
   */
  lastViewAll: json(parseLooseObject, null, (v) => v === null),
  lastView: json(parseLooseObject, null, (v) => v === null),
  /** 全プロジェクトのボードをフィード（チャットごとの最新の返答を新しい順に並べる）で見るか（ボード・リストの view とは別に覚える） */
  feedAll: flag(),
  /** プロジェクトのボードの段の分け方（group = グループ / worktree = 作業場所 / project = プロジェクト） */
  lanes: choice(LANES, "worktree"),
  /** 全プロジェクトのボードの段の分け方（プロジェクトのボードとは別に覚える。初めはプロジェクト別） */
  lanesAll: choice(LANES, "project"),
});
