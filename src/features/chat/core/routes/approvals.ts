// 回答待ちの受け口（取り決めは @shared/chat/contract.ts の approvalContract）: ツールの承認依頼・AI からの質問・再開するかの確かめ（一覧と回答）
import { z } from "zod";
import { approvalContract } from "@shared/chat/contract";
import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import type { ChatRouteDeps } from "./deps";
import { implement } from "@/foundation/core/http/implement";
import { attachmentsSchema } from "./schemas";
import { optionalId } from "@/foundation/core/http/zodParts";

const decisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("allow") }),
  z.object({ action: z.literal("allow_always") }),
  z.object({ action: z.literal("deny"), message: z.string().max(5000).optional() }),
  z.object({
    action: z.literal("answer"),
    answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    response: z.string().max(5000).optional(),
    attachments: z.record(z.string(), attachmentsSchema).optional(),
  }),
]);

export function approvalRoutes({ approvals, attachments: files }: Pick<ChatRouteDeps, "approvals" | "attachments">) {
  return implement(approvalContract, {
    context: { approvalId: { parse: (raw: string) => raw } },
    "GET /api/approvals": { query: z.object({ project_id: optionalId }), run: ({ query }) => approvals.list({ projectId: query.project_id }) },
    "POST /api/approvals/:approvalId": {
      body: decisionSchema,
      run: async ({ approvalId, body }) => {
        let decision: ApprovalDecision = body;
        // 「その他」に添えた添付は、回答の文にパスを書き添えてから渡す（Claude Code には文字の回答しか渡せない）
        if (body.action === "answer" && body.attachments) {
          const { attachments, ...rest } = body;
          // AI には添付のパスを書き添えた回答を渡し、チャットの記録には選んだままの回答と添付を残す
          decision = { ...rest, answers: await files.answers(rest.answers, attachments), plain: rest.answers, attachments };
        }
        // もう待っていない（回答済み・中断済み）なら 409。回答した依頼は一覧から消えるので、返すものはない
        approvals.resolve(approvalId, decision);
      },
    },
  });
}
