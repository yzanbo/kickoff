// ノートが 1 回の実行に足すもの（contributor "notes"・order 60）: ノートのフォルダ（なければ作る。読める・書ける場所 = Bash の砂場と書き込み先の守りでも書ける）、
// システムプロンプトの「ノート」の節（500）、ノートのチャットでツールの結果が届いたらノートが変わったと知らせる
import { mkdirSync } from "node:fs";
import path from "node:path";
import { noteKindOf } from "@shared/notes/kinds";
import type { BusEvent } from "@shared/foundation/contract";
import type { Project } from "@shared/projects/types";
import type { PromptSection, TurnContributor } from "@/features/chat/core/index";

/** フォルダがなければ作って返す（作れなければ null） */
function ensureDir(dir: string): string | null {
  try {
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

/** ノート: どのチャットでも「ノート」が「ノート」タブのノートのことだと伝え、ノートのチャットはどのノートの横かを伝える */
export function noteSection(note: { dir: string; file: string | null }): PromptSection {
  if (!note.file) {
    return {
      order: 500,
      heading: `## ノート`,
      lines: [
        `利用者が「ノート」と言ったら、Kickoff の「ノート」タブのノートのことです。ノートは、ノートフォルダ \`${note.dir}\` にある Markdown（.md）と HTML（.html）のファイルで、読み書きできます（利用者が「ノートフォルダ」と言ったら、このフォルダのこと）。`,
        `- 「ノートに書いて」「ノートを見て」などと頼まれたら、ノートフォルダのノートを Read / Edit / Write で読み書きしてください。どのノートか分からなければ、Glob で一覧を見てから、名前の近いものを選ぶか利用者に聞いてください。新しく作るときは、ノートフォルダの中に内容の分かる名前で作ってください（利用者の画面の「ノート」タブにすぐ出ます）。`,
        `- 「.」で始まる名前（隠しファイル）は作らないでください（ノートのタブに出ません）。ノートのパス（\` \` の中）には空白が入ることがあります。シェルのコマンドで使うときは引用符で囲んでください。`,
      ],
    };
  }
  return {
    order: 500,
    heading: `## ノート`,
    lines: [
      `このチャットは、利用者のノート \`${note.file}\` の横で話しています（ノートフォルダ: \`${note.dir}\`）。利用者と相談しながら、このノートの中身を一緒に作ってください。`,
      noteKindOf(note.file) === "html"
        ? `- ノートは HTML のファイルです（利用者の画面では、ページとして描いた見た目で見ています）。見た目は同じファイルの <style> の CSS で整え、ノートのフォルダの中の画像・CSS は相対パスで読めます。JavaScript は動かず、インターネット上の画像・フォントも読み込まれないので使わないでください。話の前に Read で今の中身を読み、変えるときは Edit / Write でこのファイルを直接書き換えてください（利用者の画面は書き換えるとすぐ読み直します）。`
        : `- ノートは Markdown のファイルです。話の前に Read で今の中身を読み、変えるときは Edit / Write でこのファイルを直接書き換えてください（利用者の画面は書き換えるとすぐ読み直します）。`,
      `- 相談・質問・アイデア出しにはふつうに答え、利用者が頼んだとき（「反映して」「まとめて」など）にノートを書き換えてください。頼まれていないのに大きく書き換えないでください。`,
      `- 利用者が引用（> で始まる行）を送ってきたら、ノートのその部分についての話です。`,
      `- ノートのパス（\` \` の中）には空白が入ることがあります。Read / Edit / Write にはそのまま渡し、シェルのコマンドで使うときは引用符で囲んでください。`,
    ],
  };
}

/**
 * ノートの contributor。ノートのフォルダ（ノートのタブで最初のノートを作るのと同じ場所）を読み書きできる場所に足し、どのチャットでも「ノート」が「ノート」タブのノートのことだと伝える
 * （入力欄にノートを添付して続きを頼む・「ノートに書いて」と頼めるように）。ノートのチャットは、どのノートについての会話かも伝える（作業場所はプロジェクトのまま。コードも読める）
 */
export function noteTurnParts(d: { dirOf(project: Project): string; publish(event: BusEvent): void }): TurnContributor {
  return {
    name: "notes",
    order: 60,
    contribute({ chat, project }) {
      const dir = ensureDir(d.dirOf(project));
      if (!dir) return null;
      return {
        readableDirs: [dir],
        writableDirs: [dir],
        promptSections: [noteSection({ dir, file: chat.note_path ? path.join(dir, chat.note_path) : null })],
        // ノートのチャットでツールの結果が届いたら（AI がノートを書き換えたかもしれない）、ノートが変わったと知らせる（開いているノートは、書きかけでなければ読み直す）
        ...(chat.note_path ? { onRecord: (event) => void (event.type === "tool_result" && d.publish({ type: "notes", project_id: chat.project_id, path: null })) } : {}),
      };
    },
  };
}
