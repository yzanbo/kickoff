// チャットの AI がノートを開く・名前を変える／移すツール（kickoff_chat の open_note・move_note）と、ノートが 1 回の実行に足すもの（contributor "notes"）。
// 開く・動かすだけで消さないので、聞かずに行う（権限モード・Auto mode によらず承認カードを出さない。ノートは利用者がいつでも戻せる）。
// open_note は確かめてから SSE の open_view で画面に頼む（開けたかは待たない）。move_note は上書きしない（つながりの付け替えは NoteService.move）
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defineAiTool, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import { isInside, realPathOrSelf, relativeApiPath } from "@/foundation/core/system/paths";
import type { BusEvent } from "@shared/foundation/contract";
import { noteExtensionOf } from "@shared/notes/kinds";
import { OPEN_PLACE_LABELS } from "@shared/chat/openView";
import { lineageOf, openPlaceInput, toolChat, type ChatStoreDeps } from "@/features/chat/core/index";
import type { Project } from "@shared/projects/types";
import type { CommonNotes } from "./commonNotes";
import type { NoteDirs } from "./noteDir";
import type { NoteService } from "./service";

/**
 * AI が渡したパスを、ノートのフォルダからの相対パス（「/」区切り）にする。絶対パスはノートのフォルダの中だけ（リンクを解いた形でも比べる）。
 * 外を指す・フォルダそのもの・「.」で始まる名前は throw
 */
export function notePathIn(dir: string, given: string): string {
  const raw = given.trim();
  if (!raw) throw new Error("path が空です。ノートのフォルダからの相対パスか、ノートのフォルダの中の絶対パスを渡してください");
  const abs = path.isAbsolute(raw) ? raw : path.join(dir, raw);
  const base = [dir, realPathOrSelf(dir)].find((d) => isInside(d, abs) || isInside(d, realPathOrSelf(abs)));
  if (!base) throw new Error(`${raw} はこのプロジェクトのノートのフォルダ（${dir}）の外です。開けるのはノートのフォルダの中のノートだけです`);
  const rel = relativeApiPath(base, isInside(base, abs) ? abs : realPathOrSelf(abs));
  if (!rel) throw new Error("ノートのフォルダそのものは開けません。ノートのファイルを指してください");
  if (rel.split("/").some((part) => part.startsWith("."))) throw new Error("「.」で始まる名前のファイル・フォルダは、ノートとして扱いません");
  return rel;
}

/** ノートの欄（呼んだチャットのプロジェクトのノートか、共通のノートか） */
const NOTE_SCOPES = ["project", "common"] as const;
type NoteScope = (typeof NOTE_SCOPES)[number];

interface NoteToolDeps {
  /** チャットの店（chat はノートより先に作る） */
  store: Pick<ChatStoreDeps, "chats" | "settings" | "projects" | "snippets">;
  notes: Pick<NoteDirs, "dirOf"> & Pick<NoteService, "move">;
  /** 共通のノート（使えなければ project が null で、理由は unavailable） */
  common: Pick<CommonNotes, "project" | "unavailable">;
  /** 画面に頼む（SSE） */
  publish: (event: BusEvent) => void;
}

/** AI が渡したパスが指すノート（持ち主のプロジェクト・ノートのフォルダ・そこからの相対パス） */
interface NoteTarget {
  project: Project;
  dir: string;
  rel: string;
}

/**
 * パスと scope から、どの欄のノートかを決める。共通のノートのフォルダの中の絶対パスは、scope によらず共通のノート
 * （AI がフォルダの場所で指したときに、プロジェクトのノートの外と断らないように）。scope を省けば呼んだチャットのプロジェクト
 */
function noteTarget(d: NoteToolDeps, chatId: number, scope: NoteScope | undefined, given: string, verb: string): NoteTarget {
  const self = toolChat(d.store.chats, chatId).self();
  const common = d.common.project();
  const commonDir = common ? d.notes.dirOf(common) : null;
  const inCommon = commonDir !== null && path.isAbsolute(given.trim()) && [commonDir, realPathOrSelf(commonDir)].some((dir) => isInside(dir, given.trim()) || isInside(dir, realPathOrSelf(given.trim())));
  if (inCommon || scope === "common") {
    if (!common || !commonDir) throw new Error(`共通のノートを使えないため、ノートを${verb}（${d.common.unavailable()?.message ?? "共通のノートをまだ用意していません"}）`);
    return { project: common, dir: commonDir, rel: notePathIn(commonDir, given) };
  }
  const project = d.store.projects.get(self.project_id);
  if (!project) throw new Error(`このプロジェクトのノートのフォルダが分からないため、ノートを${verb}`);
  const dir = d.notes.dirOf(project);
  return { project, dir, rel: notePathIn(dir, given) };
}

/** scope の引数（AI が読む説明つき） */
const scopeInput = () => z.enum(NOTE_SCOPES).optional().describe("どのノートか: project（このプロジェクトのノート。省いたとき）か common（共通のノート。どのプロジェクトにも属さないノート）。共通のノートのフォルダの中の絶対パスなら、省いても共通のノート");

/** ノートを開くツールの組（kickoff_chat の開く組の先頭 = order 40。開く組は持ち主ごとに分け、並びの値で前と同じ順に並べる） */
export function openNoteToolGroup(d: NoteToolDeps): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 40,
    instructions: ["open_note は、このプロジェクトのノート（ノートのフォルダの .md・.html）か、共通のノート（scope: common）を Kickoff の画面に開く。path はノートのフォルダ（共通のノートなら共通のノートのフォルダ）からの相対パスか、その中の絶対パス。"],
    open: ({ chatId }) => [
      defineAiTool({
        server: "kickoff_chat",
        name: "open_note",
        description: "このプロジェクトのノート・共通のノートを Kickoff の画面（右の欄・別ウィンドウ）に開く（開くだけ）",
        input: { path: z.string().min(1).describe("ノートのフォルダからの相対パス（「機能の仕様/図.html」）か、ノートのフォルダの中の絶対パス"), scope: scopeInput(), place: openPlaceInput() },
        async run(input) {
          const self = toolChat(d.store.chats, chatId).self();
          const { project, dir, rel } = noteTarget(d, chatId, input.scope, input.path, "開けません");
          if (!noteExtensionOf(rel)) throw new Error(`${rel} はノート（.md・.markdown・.html・.htm）ではありません`);
          const stat = await fs.stat(path.join(dir, rel)).catch(() => null);
          if (!stat?.isFile()) throw new Error(`ノート ${rel} が見つかりません（ノートのフォルダ: ${dir}）`);
          d.publish({ type: "open_view", request: { kind: "note", project_id: project.id, path: rel, place: input.place ?? null, lineage: lineageOf(d.store.chats, self) } });
          return `ノート「${rel}」を${input.place ? OPEN_PLACE_LABELS[input.place] : "設定の「チャットからノートを開く場所」の場所"}で開くよう、画面に頼みました（開けたかは返りません）。`;
        },
      }),
    ],
  };
}

/** ノートの名前を変える・移すツールの組（kickoff_chat のプロジェクトの組 = 定型文（60）の次） */
export function moveNoteToolGroup(d: NoteToolDeps): AiToolGroup {
  const notePath = z.string().min(1);
  return {
    server: "kickoff_chat",
    order: 61,
    instructions: ["move_note は、このプロジェクトのノート（ノートのフォルダの .md・.html とフォルダ）か、共通のノート（scope: common）の名前を変える・同じノートのフォルダの中の別のフォルダへ移す。行き先に同じ名前があれば断る（上書きしない）。拡張子は変えられない。ノートの名前の変更・移動は Bash の mv ではなく必ずこれを使う（mv だとノートのチャットとのつながりが切れる）。"],
    open: ({ chatId }) => [
      defineAiTool({
        server: "kickoff_chat",
        name: "move_note",
        description: "このプロジェクトのノート・共通のノート（ファイル・フォルダ）の名前を変える・移す（上書きしない）",
        input: {
          from: notePath.describe("いまのノートのパス（ノートのフォルダからの相対パスか、ノートのフォルダの中の絶対パス）"),
          to: notePath.describe("新しいパス（同じ形。途中のフォルダはなければ作る）"),
          scope: scopeInput(),
        },
        async run(input) {
          const source = noteTarget(d, chatId, input.scope, input.from, "動かせません");
          // to が相対パスで scope を省いたら、from と同じ欄（共通のノートの絶対パスから相対パスへ名前を変えるとき）
          const dest = noteTarget(d, chatId, input.scope ?? (source.project.id === d.common.project()?.id ? "common" : undefined), input.to, "動かせません");
          // いまは同じ欄の中だけ（欄をまたぐとノートのチャットも別のプロジェクトへ移すことになる）
          if (source.project.id !== dest.project.id) throw new Error("共通のノートとプロジェクトのノートの間では動かせません。同じノートのフォルダの中で名前と場所を変えてください");
          const { project } = source;
          const from = source.rel;
          const to = dest.rel;
          // ファイルの種類（Markdown / HTML）が変わらないよう、拡張子は変えさせない（フォルダは拡張子なし同士）
          if (path.extname(from).toLowerCase() !== path.extname(to).toLowerCase()) {
            throw new Error(`拡張子は変えられません（${path.extname(from) || "なし"} → ${path.extname(to) || "なし"}）。名前と場所だけを変えてください`);
          }
          if (from === to) return `ノート「${from}」は、もともとその名前です。`;
          await d.notes.move(project, from, to);
          return `ノート「${from}」を「${to}」に動かしました（ノートのチャットなどのつながりも付け替えました）。`;
        },
      }),
    ],
  };
}
