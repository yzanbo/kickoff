// 利用者が見ているものを AI に返す文（純粋な関数。メモの仕様書「0019_AI の操作ツールの追加」の D と Q3）。
// ほかのプロジェクトを見ているときは中身（ペイン・ファイル・選んだ範囲）を返さず、プロジェクトの名前と事情だけを返す。
// 結果の 1 行目は記録の行に出す文（userViewSummaryLine）
import path from "node:path";
import { userViewSummaryLine } from "@shared/chat/aiUserView";
import type { UserView, UserViewSelection, UserViewTab } from "@shared/types";
import type { SeenView } from "./registry.js";

export interface UserViewTextInput {
  /** ツールを呼んだチャット */
  chatId: number;
  projectId: number;
  projectName: (id: number) => string;
  /** いま読むウィンドウの様子（画面が開いていなければ null） */
  current: SeenView | null;
  /** このチャットの最後の発言を送ったときの様子（なければ null） */
  sent: SeenView | null;
  now: number;
}

const ASK = "どのファイル・どこを指しているか分からなければ、利用者に聞いてください。";

/** 選んでいる範囲の文（「120〜135 行を選択中」。1 行の中なら「120 行の 3〜10 文字目を選択中」） */
function selectionText(s: UserViewSelection): string {
  if (s.from_line === s.to_line) return `${s.from_line} 行の ${s.from_column}〜${s.to_column} 文字目を選択中`;
  return `${s.from_line}〜${s.to_line} 行を選択中（${s.from_line} 行 ${s.from_column} 文字目〜${s.to_line} 行 ${s.to_column} 文字目）`;
}

/** タブ 1 つの文（AI に返す。長い文は「選んでいる文」として次の行に） */
function tabText(tab: UserViewTab, chatId: number): string {
  switch (tab.kind) {
    case "chat":
      return `チャット「${tab.title}」（ID ${tab.chat_id}${tab.chat_id === chatId ? "。このチャット" : ""}）`;
    case "child_chat":
      return `子チャット「${tab.title}」（ID ${tab.chat_id}${tab.chat_id === chatId ? "。このチャット" : ""}）`;
    case "new_chat":
      return "新しいチャット（送る前）";
    case "subagent":
      return `サブエージェント「${tab.title}」`;
    case "editor": {
      const where = tab.worktree ? `（ワークツリー ${tab.worktree}）` : "";
      const at = tab.selection ? ` ${selectionText(tab.selection)}` : tab.line ? ` カーソルは ${tab.line} 行` : "";
      return `エディタ: ${tab.path}${where}${at}`;
    }
    case "changes":
      return `変更（差分）${tab.focus ? `: ${tab.focus}` : ""}${tab.worktree ? `（ワークツリー ${tab.worktree}）` : ""}`;
    case "memo":
      return `メモ: ${tab.path}${tab.selected_text ? `\n    選んでいる文: 「${tab.selected_text}」` : ""}`;
    case "browser":
      return `ブラウザ: ${tab.title || "（題なし）"}（${tab.url}）`;
    case "github":
      return tab.item ? `GitHub: ${tab.item.kind === "pr" ? "PR" : "issue"} #${tab.item.number}` : "GitHub（一覧）";
    case "database":
      return `DB: ${tab.connection ? `接続「${tab.connection}」` : "接続なし"}${tab.table ? `・テーブル ${tab.table}` : ""}`;
    case "terminal":
      return `ターミナル: ${tab.label}`;
    case "page":
      return tab.label;
  }
}

/** 記録の行に出す短い文（「エディタ: runner.ts 120〜135 行を選択中」） */
function tabSummary(tab: UserViewTab): string {
  switch (tab.kind) {
    case "editor":
      return `エディタ: ${path.basename(tab.path)}${tab.selection ? ` ${tab.selection.from_line === tab.selection.to_line ? `${tab.selection.from_line} 行` : `${tab.selection.from_line}〜${tab.selection.to_line} 行`}を選択中` : ""}`;
    case "memo":
      return `メモ: ${path.basename(tab.path)}${tab.selected_text ? "（文を選択中）" : ""}`;
    case "chat":
    case "child_chat":
      return `チャット「${tab.title}」`;
    default:
      return tabText(tab, -1).split("\n")[0];
  }
}

/** 記録の行に出すとき、どのタブを先に挙げるか（選んでいるもの → エディタ・メモ → 開いている issue・PR → ブラウザ・DB → ほか） */
function weight(tab: UserViewTab): number {
  if (tab.kind === "editor") return tab.selection ? 0 : 2;
  if (tab.kind === "memo") return tab.selected_text ? 1 : 3;
  if (tab.kind === "github" && tab.item) return 4;
  if (tab.kind === "browser" || tab.kind === "database" || tab.kind === "changes") return 5;
  if (tab.kind === "chat" || tab.kind === "child_chat" || tab.kind === "new_chat") return 9;
  return 6;
}

/** ほかのプロジェクトのタブ（全プロジェクトの画面で）は中身を伏せる */
const visibleTab = (tab: UserViewTab | null, projectId: number): UserViewTab | null =>
  tab && tab.project_id !== undefined && tab.project_id !== projectId ? { kind: "page", label: "（ほかのプロジェクトのもの。中身は読めません）" } : tab;

/** 様子の本文（ペインごとの前のタブと、右の欄に開いているもの） */
function viewLines(view: UserView, projectId: number, chatId: number): string[] {
  const lines = view.panes.map((p) => {
    const tab = visibleTab(p.tab, projectId);
    return `- ${p.area}: ${tab ? tabText(tab, chatId) : "（タブなし）"}`;
  });
  const side = view.side.map((t) => visibleTab(t, projectId)).filter((t): t is UserViewTab => t !== null);
  if (side.length > 0) lines.push(`- 右の欄に開いているもの: ${side.map((t) => tabText(t, chatId).split("\n")[0]).join(" / ")}`);
  return lines.length > 0 ? lines : ["- （見えているペインはありません）"];
}

/** 何秒・何分前か */
function ago(at: number, now: number): string {
  const sec = Math.max(0, Math.round((now - at) / 1000));
  return sec < 60 ? `${sec} 秒前` : `${Math.round(sec / 60)} 分前`;
}

/** 送ったときの様子の段（このチャットのプロジェクトのものだけ。なければ空） */
function sentLines(input: UserViewTextInput): string[] {
  const { sent } = input;
  if (!sent) return ["このチャットの最後の発言を送ったときの様子は、覚えていません（画面から送っていない・アプリを起動し直したなど）。"];
  if (sent.view.project_id !== null && sent.view.project_id !== input.projectId) {
    return [`このチャットの最後の発言を送ったとき（${ago(sent.at, input.now)}）も、ほかのプロジェクト「${input.projectName(sent.view.project_id)}」を見ていました。`];
  }
  return [`このチャットの最後の発言を送ったとき（${ago(sent.at, input.now)}）の様子:`, ...viewLines(sent.view, input.projectId, input.chatId)];
}

/** AI に返す文（1 行目は記録の行の文） */
export function userViewText(input: UserViewTextInput): string {
  const { current, projectId } = input;
  if (!current) {
    const reason = "Kickoff の画面が開いていないため（ウィンドウを閉じている・スマホだけから使っている）、いまの画面は読めません";
    return [userViewSummaryLine(reason), `${reason}。`, ...sentLines(input), ASK].join("\n");
  }
  const seen = current.view.project_id;
  if (seen !== null && seen !== projectId) {
    const other = input.projectName(seen);
    return [
      userViewSummaryLine(`画面を見ようとしましたが、ほかのプロジェクト「${other}」を見ていたため読めませんでした`),
      `利用者はいま、ほかのプロジェクト「${other}」を見ています（このチャットはプロジェクト「${input.projectName(projectId)}」）。ほかのプロジェクトの画面の中身は読めない決まりのため、ペイン・ファイル・選んだ範囲は返しません。`,
      ...sentLines(input),
      ASK,
    ].join("\n");
  }
  const tabs = [...current.view.panes.map((p) => visibleTab(p.tab, projectId)), ...current.view.side.map((t) => visibleTab(t, projectId))].filter(
    (t): t is UserViewTab => t !== null && t.kind !== "page",
  );
  const top = [...tabs].sort((a, b) => weight(a) - weight(b))[0];
  const summary = top ? `画面を見ました（${tabSummary(top)}${tabs.length > 1 ? " ほか" : ""}）` : "画面を見ました";
  return [
    userViewSummaryLine(summary),
    `利用者がいま見ている画面（${seen === null ? "全プロジェクトの画面" : `プロジェクト「${input.projectName(seen)}」`}・${ago(current.at, input.now)}に知らされた様子）:`,
    ...viewLines(current.view, projectId, input.chatId),
    "（AI が読むころには、利用者がもう別の画面に移っていることがあります。下の「送ったとき」の様子も手がかりにしてください）",
    ...sentLines(input),
    ASK,
  ].join("\n");
}
