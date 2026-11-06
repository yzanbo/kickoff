// チャットのやり取りの記録（Markdown。別のチャットに添付ファイルとして渡して AI が Read で読む・右クリックの「全部のやり取りをコピー」。Node 依存なし）
import { UNTITLED_CHAT_TITLE, type Project, type Chat, type ChatEvent } from "@shared/types";
import { workdirOf } from "./workdir.js";

/** ファイルを変える編集のツール（変えたファイルを作業ごとに書き添える） */
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

/** 記録の日時（2026-11-04 13:05） */
function stamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 作業場所からの相対パス（外のファイルはそのまま） */
const relative = (file: string, root: string) => (file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file);

/**
 * チャットのやり取りを Markdown にする（自分の発言・AI の返答（メインのエージェントのもの）を古い順に。作業ごとに、
 * 変えたファイルと、失敗・中断したことを添える）。ツールの細かい出力・考えている途中・サブエージェントの中の発言は入れない。
 * note: 別のチャットに読ませるための断り書き（参照のために書き出したもの）を入れるか（コピーするときは入れない）
 */
export function chatTranscript(chat: Chat, project: Project, events: ChatEvent[], { note = true }: { note?: boolean } = {}): string {
  const root = workdirOf(chat, project);
  const lines = [
    `# チャット「${chat.title || UNTITLED_CHAT_TITLE}」の記録`,
    "",
    `- プロジェクト: ${project.name}（${root}${chat.branch ? `・ブランチ ${chat.branch}` : ""}）`,
    `- 作成: ${stamp(chat.created_at)}`,
  ];
  if (note) {
    lines.push(
      "",
      "このファイルは、別のチャットのやり取りを参照のために書き出したものです。自分（利用者）の発言と AI の返答を古い順に並べ、作業ごとに変えたファイルを添えています。ツールの細かい出力は入れていません。",
    );
  }
  let edited = new Set<string>();
  for (const e of events) {
    if (e.type === "user") {
      const d = e.data;
      const files = d.attachments?.length ? `\n\n（添付: ${d.attachments.map((a) => a.name).join("、")}）` : "";
      lines.push("", `## 自分（${stamp(e.created_at)}）`, "", `${d.text.trim()}${files}`);
    } else if (e.type === "approval_resolved" && e.data.action === "answer") {
      // AI からの質問に答えた内容（選んだままの回答と添付の名前）
      const r = e.data;
      const items = Object.entries(r.answers).map(([q, a]) => {
        const files = r.attachments?.[q]?.length ? `（添付: ${r.attachments[q].map((f) => f.name).join("、")}）` : "";
        return `- ${q} → ${Array.isArray(a) ? a.join("、") : a}${files}`;
      });
      lines.push("", `## 自分（質問への回答・${stamp(e.created_at)}）`, "", ...items);
    } else if (e.type === "text" && !e.data.parent && e.data.text.trim()) {
      lines.push("", "## AI", "", e.data.text.trim());
    } else if (e.type === "tool_use" && EDIT_TOOLS.has(e.data.name)) {
      const input = e.data.input as { file_path?: string; notebook_path?: string } | undefined;
      const file = input?.file_path ?? input?.notebook_path;
      if (file) edited.add(relative(file, root));
    } else if (e.type === "result") {
      const r = e.data;
      if (edited.size > 0) lines.push("", `（この作業で変えたファイル: ${[...edited].join("、")}）`);
      if (r.status === "failed") lines.push("", `（作業は失敗しました: ${String(r.text ?? "").slice(0, 300)}）`);
      if (r.status === "cancelled") lines.push("", "（作業は途中で止めました）");
      edited = new Set();
    }
  }
  return `${lines.join("\n")}\n`;
}

/** 添付にするときのファイル名（「チャット履歴-名前.md」。ファイル名に使えない文字は除く） */
export function transcriptFileName(chat: Chat): string {
  const title = (chat.title || UNTITLED_CHAT_TITLE).replace(/[\\/:*?"<>|\n\r\t]+/g, " ").trim().slice(0, 60);
  return `チャット履歴-${title}.md`;
}
