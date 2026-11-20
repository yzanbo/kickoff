// アプリ全体で使う確認・入力・選ぶダイアログの頼み（OS 標準の confirm / prompt の代わり。描くのは App と別ウィンドウに 1 つずつの AskHost）。
// 見た目をアプリにそろえ（Electron では prompt が使えない）、ボタンは「キャンセル」と操作の名前（取り消せない操作は赤）。
// 最初はキャンセルを選んだ状態にし、Enter で誤って実行しない（Esc・外側でも閉じる）。開いている間に来た依頼は順番に待つ
import { errorMessage } from "@shared/foundation/errors";
import type { PromptAssistOptions } from "./PromptAssist";

/** ダイアログに添えるチェック（initial は初めの状態。help はチェックの状態ごとの説明） */
export interface AskCheck {
  label: string;
  initial?: boolean;
  help?: (checked: boolean) => string;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** 実行するボタンの名前（既定は「OK」。削除なら「削除」） */
  confirmLabel?: string;
  /** 取り消せない操作（赤いボタンにする） */
  danger?: boolean;
  /** キャンセルを出さない（お知らせ） */
  hideCancel?: boolean;
  /** 実行のときに一緒に選んでもらうチェック（上から順に出す） */
  checks?: AskCheck[];
}

export interface PromptOptions {
  title: string;
  message?: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** 入力欄の上に、文から入力の案を作ってもらう欄を添える（あればその文の欄にピントを置く） */
  assist?: PromptAssistOptions;
  /** 入力と一緒に選んでもらうチェック（入力欄の下に出す） */
  checks?: AskCheck[];
  /** 空のままでも決められる（空なら "" を返す。退避のメッセージなど、省ける入力） */
  optional?: boolean;
  /** 何行も書ける欄にする（書いた分だけ伸びる。Enter で決め、Shift+Enter で改行。AI への追加の指示など） */
  multiline?: boolean;
  /** 入力と一緒に 1 つ選んでもらう一覧（入力欄の下に出す。initial は初めに選んでおく value） */
  select?: { label: string; options: { value: string; label: string }[]; initial: string };
}

export interface ChooseOptions<T extends string> {
  title: string;
  message?: string;
  /** キャンセルのほかに並べる選択肢（左から順に。primary はいちばんおすすめのもの、danger は取り消せない操作（赤）） */
  choices: { value: T; label: string; primary?: boolean; danger?: boolean }[];
  /** 「次からはこれにする」のチェックの文（あれば出す） */
  remember?: string;
  /** 選ぶときに一緒に決めてもらうチェック（上から順に出す） */
  checks?: AskCheck[];
}

/** AskHost に渡す依頼（checked はチェックの状態。checks の順） */
export type AskRequest =
  | ({ kind: "confirm"; resolve: (ok: boolean, checked: boolean[]) => void } & ConfirmOptions)
  | ({ kind: "prompt"; resolve: (value: string | null, checked: boolean[], selected: string) => void } & PromptOptions)
  | ({ kind: "choice"; resolve: (value: string | null, remember: boolean, checked: boolean[]) => void } & ChooseOptions<string>);

let show: ((req: AskRequest) => void) | undefined;

/** AskHost が置かれた・外れた（undefined） */
export function setAskHost(next: ((req: AskRequest) => void) | undefined): void {
  show = next;
}

/** 確認のダイアログ。実行を選べばチェックの状態（checks の順）、キャンセルなら null */
export function confirm(options: ConfirmOptions): Promise<{ checked: boolean[] } | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ kind: "confirm", resolve: (ok, checked) => resolve(ok ? { checked } : null), ...options });
  });
}

/** 入力のダイアログ。決定すれば入力した文字（前後の空白は除く）・チェックの状態・一覧で選んだ value、キャンセルなら null */
export function prompt(options: PromptOptions): Promise<{ value: string; checked: boolean[]; selected: string } | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ kind: "prompt", resolve: (value, checked, selected) => resolve(value === null ? null : { value, checked, selected }), ...options });
  });
}

/** いくつかの選択肢から選ぶダイアログ（「このまま送る / 新しいワークツリーで始める」など）。選んだもの・チェックの状態・「次からはこれにする」、キャンセルなら null */
export function choose<T extends string>(options: ChooseOptions<T>): Promise<{ value: T; checked: boolean[]; remember: boolean } | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ kind: "choice", resolve: (value, remember, checked) => resolve(value === null ? null : { value: value as T, checked, remember }), ...options });
  });
}

/** お知らせのダイアログ（エラーなど。ボタンは OK だけ） */
export function alert(title: string, message?: string): Promise<void> {
  return confirm({ title, message, hideCancel: true }).then(() => undefined);
}

/** 失敗をお知らせのダイアログで知らせる（操作の catch に渡す） */
export const reportFailure = (title: string) => (e: unknown) => alert(title, errorMessage(e));
