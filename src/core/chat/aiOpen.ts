// チャットの AI が、このプロジェクトのメモ・同じ家系のチャット・作業場所のファイルと差分・SQL のタブを画面に開き、家系のチャットの入力欄に下書きを入れる
// （kickoff_chat の open_memo・open_chat・open_file・open_diff・open_sql・add_draft の中身。プロバイダーに依らない）。
// 開く・入れるだけで送る・流す・消すはしないので、聞かずに頼む（権限モード・Auto mode によらず承認カードを出さない）。コアは確かめてから SSE の
// open_view・chat_draft で頼み、Mac のアプリのメインのウィンドウが、画面のいまの開き方（右の欄 / 別ウィンドウ）で開く（画面が開いたかは待たない）
import fs from "node:fs/promises";
import path from "node:path";
import type { AddDraftInput, OpenChatInput, OpenDiffInput, OpenFileInput, OpenMemoInput, OpenSqlInput } from "@shared/chat/aiOpen";
import { memoExtensionOf } from "@shared/memo/kinds";
import { OPEN_PLACE_LABELS, UNTITLED_CHAT_TITLE, type BusEvent, type Chat, type OpenPlace, type Project } from "@shared/types";
import type { Store } from "../db/store.js";
import { isInside, realPathOrSelf } from "../system/paths.js";
import { familyOf, lineageOf } from "./aiChatEdit.js";
import { workdirOf } from "./workdir.js";

/** メモ・家系のチャットを開くツールの中身（AI に返す文。開けなければ理由の文で throw） */
export interface AiOpenTools {
  openMemo(input: OpenMemoInput): Promise<string>;
  openChat(input: OpenChatInput): string;
  openFile(input: OpenFileInput): Promise<string>;
  openDiff(input: OpenDiffInput): string;
  openSql(input: OpenSqlInput): string;
  addDraft(input: AddDraftInput): string;
}

/** 下書きの長さの上限（送る指示と同じ） */
const DRAFT_MAX = 50_000;
/** SQL の長さの上限 */
const SQL_MAX = 100_000;

export interface AiOpenDeps {
  store: Store;
  /** 画面に頼む（SSE） */
  publish: (event: BusEvent) => void;
  /** プロジェクトのメモのフォルダ（なければメモは開けない） */
  memoDirOf?: (project: Project) => string;
}

/** 文の中の名前（空なら「名前なし」） */
const nameOf = (title: string) => title.trim() || "（名前なし）";

/** 開く場所の言葉（省いたら設定の開き方） */
const placeText = (place: OpenPlace | undefined, setting: string) => (place ? OPEN_PLACE_LABELS[place] : `設定の「${setting}」の場所`);

/**
 * AI が渡したパスを、メモのフォルダからの相対パス（「/」区切り）にする。絶対パスはメモのフォルダの中だけ（リンクを解いた形でも比べる）。
 * 外を指す・フォルダそのもの・「.」で始まる名前は throw
 */
export function memoPathIn(dir: string, given: string): string {
  const raw = given.trim();
  if (!raw) throw new Error("path が空です。メモのフォルダからの相対パスか、メモのフォルダの中の絶対パスを渡してください");
  const abs = path.isAbsolute(raw) ? raw : path.join(dir, raw);
  const base = [dir, realPathOrSelf(dir)].find((d) => isInside(d, abs) || isInside(d, realPathOrSelf(abs)));
  if (!base) throw new Error(`${raw} はこのプロジェクトのメモのフォルダ（${dir}）の外です。開けるのはメモのフォルダの中のメモだけです`);
  const rel = path.relative(base, isInside(base, abs) ? abs : realPathOrSelf(abs)).split(path.sep).join("/");
  if (!rel) throw new Error("メモのフォルダそのものは開けません。メモのファイルを指してください");
  if (rel.split("/").some((part) => part.startsWith("."))) throw new Error("「.」で始まる名前のファイル・フォルダは、メモとして扱いません");
  return rel;
}

/**
 * AI が渡したパスを、作業場所からの相対パス（「/」区切り）にする。絶対パスは作業場所の中だけ（リンクを解いた形でも比べる）。外・作業場所そのものは throw
 */
export function workPathIn(dir: string, given: string): string {
  const raw = given.trim();
  if (!raw) throw new Error("path が空です。作業場所からの相対パスか、作業場所の中の絶対パスを渡してください");
  const abs = path.isAbsolute(raw) ? raw : path.join(dir, raw);
  const base = [dir, realPathOrSelf(dir)].find((d) => isInside(d, abs) || isInside(d, realPathOrSelf(abs)));
  if (!base) throw new Error(`${raw} はこのチャットの作業場所（${dir}）の外です。開けるのは作業場所の中のファイルだけです`);
  const rel = path.relative(base, isInside(base, abs) ? abs : realPathOrSelf(abs)).split(path.sep).join("/");
  if (!rel) throw new Error("作業場所そのものは開けません。ファイルを指してください");
  return rel;
}

/**
 * chatId のチャットの AI に渡す、メモ・家系のチャットなどを開く・下書きを入れるツールの中身。家系・メモ・接続は呼ぶたびに引き直す
 */
export function createAiOpenTools({ store, publish, memoDirOf }: AiOpenDeps, chatId: number): AiOpenTools {
  const requireSelf = (): Chat => {
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
    return chat;
  };
  /** このチャットとプロジェクトと作業場所のフォルダ */
  const workplace = () => {
    const self = requireSelf();
    const project = store.projects.get(self.project_id);
    if (!project) throw new Error("このチャットのプロジェクトが見つかりません");
    return { self, project, dir: workdirOf(self, project) };
  };
  /** 同じ家系のチャット（外なら理由の文で throw） */
  const familyMember = (self: Chat, id: number, verb: string) => {
    const { members, relationOf } = familyOf(store, self);
    const target = members.find((c) => c.id === id);
    if (!target) {
      throw new Error(
        `チャット ID ${id} は、このチャットの家系（いちばん上の親チャットから下にぶら下がるチャット）にありません。${verb}のは同じ家系のチャットだけです。list_family_chats で ID を確かめてください`,
      );
    }
    return { target, label: `チャット「${nameOf(target.title)}」（ID ${target.id}・${relationOf(target)}）` };
  };
  return {
    async openMemo(input) {
      const self = requireSelf();
      const project = store.projects.get(self.project_id);
      if (!project || !memoDirOf) throw new Error("このプロジェクトのメモのフォルダが分からないため、メモを開けません");
      const dir = memoDirOf(project);
      const rel = memoPathIn(dir, input.path);
      if (!memoExtensionOf(rel)) throw new Error(`${rel} はメモ（.md・.markdown・.html・.htm）ではありません`);
      const stat = await fs.stat(path.join(dir, rel)).catch(() => null);
      if (!stat?.isFile()) throw new Error(`メモ ${rel} が見つかりません（メモのフォルダ: ${dir}）`);
      publish({ type: "open_view", request: { kind: "memo", project_id: project.id, path: rel, place: input.place ?? null, lineage: lineageOf(store, self) } });
      return `メモ「${rel}」を${placeText(input.place, "チャットからメモを開く場所")}で開くよう、画面に頼みました（開けたかは返りません）。`;
    },
    openChat(input) {
      const self = requireSelf();
      const { target, label } = familyMember(self, input.chat_id, "開ける");
      publish({ type: "open_view", request: { kind: "chat", place: input.place ?? null, lineage: lineageOf(store, target) } });
      // いちばん上の親チャットは右の欄・別ウィンドウに置けないので、チャットのパネルで開く
      if (target.parent_chat_id === null) return `${label}を、チャットのパネルで開くよう画面に頼みました（いちばん上の親チャットは右の欄・別ウィンドウには開きません）。`;
      return `${label}を${placeText(input.place, "子チャットを開く場所")}で開くよう、画面に頼みました（開けたかは返りません）。`;
    },
    async openFile(input) {
      const { self, project, dir } = workplace();
      const rel = workPathIn(dir, input.path);
      const stat = await fs.stat(path.join(dir, rel)).catch(() => null);
      if (!stat?.isFile()) throw new Error(`ファイル ${rel} が見つかりません（作業場所: ${dir}）`);
      const line = input.line !== undefined && input.line >= 1 ? Math.trunc(input.line) : null;
      publish({ type: "open_view", request: { kind: "file", project_id: project.id, worktree: self.worktree_path, path: rel, line, place: input.place ?? null, lineage: lineageOf(store, self) } });
      return `ファイル「${rel}」${line ? `の ${line} 行目` : ""}を${input.place ? OPEN_PLACE_LABELS[input.place] : "右の欄"}で開くよう、画面に頼みました（開けたかは返りません）。`;
    },
    openDiff(input) {
      const { self, project, dir } = workplace();
      // 消したファイルの差分もあるので、ファイルがあるかは確かめない
      const rel = input.path?.trim() ? workPathIn(dir, input.path) : null;
      publish({ type: "open_view", request: { kind: "diff", project_id: project.id, worktree: self.worktree_path, path: rel, place: input.place ?? null, lineage: lineageOf(store, self) } });
      return `コミットしていない変更${rel ? `（${rel} の位置）` : ""}を${input.place ? OPEN_PLACE_LABELS[input.place] : "右の欄"}で開くよう、画面に頼みました（開けたかは返りません）。`;
    },
    openSql(input) {
      const self = requireSelf();
      const sql = input.sql.trim();
      if (!sql) throw new Error("sql が空です");
      if (sql.length > SQL_MAX) throw new Error(`sql は ${SQL_MAX} 文字までです`);
      // 「AI に見せない」接続は選ばせない（名前も出さない）
      const shown = store.dbConnections.list(self.project_id).filter((c) => c.ai_access !== "none");
      const name = input.connection?.trim();
      const hit = name ? (shown.find((c) => c.name === name) ?? shown.find((c) => c.name.toLowerCase() === name.toLowerCase())) : shown.length === 1 ? shown[0] : undefined;
      if (!hit) {
        if (shown.length === 0) throw new Error("このプロジェクトには、AI に見せる DB の接続がありません。");
        if (!name) throw new Error(`connection に接続の名前を渡してください（AI に見せる接続: ${shown.map((c) => c.name).join("、")}）。`);
        throw new Error(`「${name}」という AI に見せる接続はありません（AI に見せる接続: ${shown.map((c) => c.name).join("、")}。利用者が AI に見せないと決めた接続は選べません）。`);
      }
      publish({ type: "open_view", request: { kind: "sql", project_id: self.project_id, connection_id: hit.id, sql, lineage: lineageOf(store, self) } });
      return `接続「${hit.name}」の新しい SQL のタブに SQL を入れて開くよう、画面に頼みました（流していません。流すのは利用者です）。`;
    },
    addDraft(input) {
      const self = requireSelf();
      const text = input.text.trim();
      if (!text) throw new Error("text が空です");
      if (text.length > DRAFT_MAX) throw new Error(`text は ${DRAFT_MAX} 文字までです`);
      const { target, label } = familyMember(self, input.chat_id, "下書きを入れられる");
      if (target.archived_at) throw new Error(`${label}はアーカイブ済みなので、下書きを入れられません`);
      // 親チャットに入れるなら「子チャットから渡した」の札も付ける（画面の「親チャットに渡す」と同じ）
      const from = target.id === self.parent_chat_id ? { chat_id: self.id, title: self.title.trim() || UNTITLED_CHAT_TITLE } : null;
      publish({ type: "chat_draft", request: { text, from, lineage: lineageOf(store, target) } });
      return `${label}の入力欄に下書きを入れるよう、画面に頼みました（書きかけがあれば、その後ろに足します。送るのは利用者です）。`;
    },
  };
}
