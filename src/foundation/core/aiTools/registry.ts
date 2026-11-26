// AI のツールのレジストリ: 機能が出した組（AiToolGroup）を、1 回の作業ごとに MCP サーバーの形（ツール・使い方・聞かずに使わせる名前）にする
import { AI_TOOL_SERVERS, type AiToolServer } from "@shared/foundation/aiToolView";
import type { AiToolDef, AiToolGroup, AiTurn, ToolDef, ToolServer } from "./tool";

/** 1 回の作業の文脈につないだ、MCP の口のツール（読むだけの印は読むだけのツールにだけ付ける） */
function toolDefOf(def: AiToolDef, turn: AiTurn): ToolDef {
  return {
    name: def.name,
    description: def.description,
    shape: def.input,
    handler: (args) => def.run(args, turn),
    ...(def.readOnly ? { annotations: { readOnlyHint: true } } : {}),
  };
}

export class AiToolRegistry {
  /** 並べる順（order。同じなら渡した順） */
  private readonly groups: readonly AiToolGroup[];

  constructor(groups: readonly AiToolGroup[]) {
    this.groups = [...groups].sort((a, b) => a.order - b.order);
  }

  /**
   * 作業ごとに、サーバーごとのツールを作る（組は作業ごとに open するので、作業ごとの回数は組の中で数える）。
   * 使い方は「頭の 1 文 ＋ 出した組の文を順に」、聞かずに使わせる名前は auto のツール。出す組のないサーバーは渡さない
   */
  serversFor(turn: AiTurn, heads: Partial<Record<AiToolServer, string>> = {}): ToolServer[] {
    return AI_TOOL_SERVERS.flatMap((server) => {
      const opened = this.groups.flatMap((group) => {
        const defs = group.server === server ? group.open(turn) : null;
        if (!defs) return [];
        const { instructions } = group;
        return [{ instructions: typeof instructions === "function" ? instructions(turn) : instructions, defs: defs.filter((def) => def.available?.(turn) ?? true) }];
      });
      if (opened.length === 0) return [];
      const head = heads[server];
      const defs = opened.flatMap((o) => o.defs);
      return [
        {
          name: server,
          instructions: [...(head ? [head] : []), ...opened.flatMap((o) => o.instructions)].join("\n"),
          tools: defs.map((def) => toolDefOf(def, turn)),
          autoAllow: defs.filter((def) => def.auto).map((def) => def.name),
        },
      ];
    });
  }
}
