// AI に渡すツールの書き方（プロバイダーに依らない形）。機能は defineAiTool で定義して組（AiToolGroup）にまとめ、
// レジストリ（registry.ts）が実行ごとにサーバーの形（ToolServer）にし、コアの MCP サーバー（host.ts）がどの CLI にも同じに出す
import type { z } from "zod";
import { errorMessage } from "@shared/foundation/errors";
import type { AiToolServer } from "@shared/foundation/aiToolView";

/** ツールの結果の中身（文か画像） */
export type AiToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

/** ツールの結果（MCP の CallToolResult と同じ形） */
export interface ToolResult {
  content: AiToolContent[];
  isError?: boolean;
}

/** ツールの性質の印（MCP の annotations） */
interface ToolAnnotations {
  /** 読むだけで何も変えない */
  readOnlyHint?: boolean;
}

/** MCP の口に出す 1 つのツール（AiToolDef を 1 回の作業の文脈につないだもの） */
export interface ToolDef {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
  annotations?: ToolAnnotations;
}

/** 1 つの MCP サーバーにまとめて出すツール（名前は CLI からの見え方 mcp__<名前>__<ツール>） */
export interface ToolServer {
  name: string;
  /** 使い方（MCP の instructions として AI に渡す） */
  instructions: string;
  tools: ToolDef[];
  /** 利用者に聞かずに使わせるツールの名前（承認と断りはツールの中で行うもの・読むだけのもの。CLI の許可の設定に直すのはプロバイダー） */
  autoAllow: string[];
}

/** 利用者に聞くカード（権限モードによらず聞く。chat が承認の仕組みにつなぐ） */
export interface AiApprovalCard {
  /** カードに出すツールの長い名前（aiToolId）と入力 */
  toolName: string;
  input: Record<string, unknown>;
  title: string;
  description?: string;
  /** 「常に許可」を選べるか */
  canRemember: boolean;
}

export type AiApprovalDecision = { action: "allow" | "allow_always" } | { action: "deny"; message: string | null };

/** 1 回の作業の文脈（chat が作って渡す。土台が知るのは数と文字だけ。チャットの中身は機能が自分の deps で引く） */
export interface AiTurn {
  readonly chatId: number;
  readonly projectId: number;
  readonly provider: string;
  /** そのチャットの作業場所（本体のフォルダかワークツリー） */
  readonly workdir: string;
  /** 作業を止めたら止まる */
  readonly signal: AbortSignal;
  /** 利用者に聞く（作業を止めたら断りで返る） */
  ask(card: AiApprovalCard): Promise<AiApprovalDecision>;
  /** 1 回の作業の中だけの値（回数の数えなど）。同じ key は同じ作業の中で同じ値 */
  perTurn<T>(key: string, init: () => T): T;
}

/** 定義したツール（defineAiTool が作る。結果の包みはここに 1 つ） */
export interface AiToolDef {
  readonly server: AiToolServer;
  /** AI から見える短い名前（"notify_user"）。長い名前は aiToolId */
  readonly name: string;
  /** 表示名（画面とスマホの表の label と同じ値。MCP の title として出すと AI に見える一覧が変わるので、まだ出さない） */
  readonly title?: string;
  readonly description: string;
  readonly input: z.ZodRawShape;
  /** 読むだけで何も変えない（MCP の readOnlyHint） */
  readonly readOnly: boolean;
  /** 利用者に聞かずに使わせる */
  readonly auto: boolean;
  /** この作業で出すか（省けば出す） */
  available?(turn: AiTurn): boolean;
  run(args: Record<string, unknown>, turn: AiTurn): Promise<ToolResult>;
}

/** ツールを定義する（入力の形から中身の引数の型を決める。投げた失敗は理由の文の結果にする） */
export function defineAiTool<S extends z.ZodRawShape>(spec: {
  server: AiToolServer;
  name: string;
  title?: string;
  description: string;
  input: S;
  /** 既定 false */
  readOnly?: boolean;
  /** 既定 true（ブラウザの操作だけ false） */
  auto?: boolean;
  available?(turn: AiTurn): boolean;
  run(args: z.infer<z.ZodObject<S>>, turn: AiTurn): string | AiToolContent[] | Promise<string | AiToolContent[]>;
}): AiToolDef {
  const { run, readOnly = false, auto = true, ...rest } = spec;
  return {
    ...rest,
    readOnly,
    auto,
    async run(args, turn) {
      try {
        const out = await run(args as z.infer<z.ZodObject<S>>, turn);
        return { content: typeof out === "string" ? [{ type: "text", text: out }] : out };
      } catch (e) {
        return { content: [{ type: "text", text: errorMessage(e) }], isError: true };
      }
    },
  };
}

/** 機能が出すツールの組（1 回の作業ごとに open する。作業ごとの回数はその中で数える） */
export interface AiToolGroup {
  readonly server: AiToolServer;
  /** 使い方の文とツールを並べる順（小さいほど先） */
  readonly order: number;
  /** 使い方の文（作業によって足す文があるなら作業ごとに作る関数。open がツールを出したときだけ呼ぶ） */
  readonly instructions: readonly string[] | ((turn: AiTurn) => readonly string[]);
  /** この作業で出すツール（出さないなら null） */
  open(turn: AiTurn): AiToolDef[] | null;
}
