import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import type { ApprovalDecision } from "@shared/types";
import { jsonBody, queryOf } from "../input.js";
import { attachmentSchema, optionalId } from "./schemas.js";
import { answersWithAttachments } from "../../chat/uploads.js";

const decisionSchema: z.ZodType<ApprovalDecision> = z.discriminatedUnion("action", [
  z.object({ action: z.literal("allow") }),
  z.object({ action: z.literal("allow_always") }),
  z.object({ action: z.literal("deny"), message: z.string().max(5000).optional() }),
  z.object({
    action: z.literal("answer"),
    answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
    response: z.string().max(5000).optional(),
    attachments: z.record(z.string(), z.array(attachmentSchema).max(20)).optional(),
  }),
]);

/** 回答待ち: ツールの承認依頼・AI からの質問・再開するかの確かめ（一覧と回答） */
export function approvalRoutes(app: Hono, { approvals, uploads }: ServerDeps) {
  app.get("/api/approvals", (c) => {
    const { project_id } = z.object({ project_id: optionalId }).parse({ project_id: queryOf(c, "project_id") });
    return c.json(approvals.list({ projectId: project_id }));
  });

  app.post("/api/approvals/:id", async (c) => {
    let decision = decisionSchema.parse(await jsonBody(c));
    // 「その他」に添えた添付は、回答の文にパスを書き添えてから渡す（Claude Code には文字の回答しか渡せない）
    if (decision.action === "answer" && decision.attachments) {
      const { attachments, ...rest } = decision;
      // AI には添付のパスを書き添えた回答を渡し、チャットの記録には選んだままの回答と添付を残す
      decision = { ...rest, answers: await answersWithAttachments(uploads, rest.answers, attachments), plain: rest.answers, attachments };
    }
    // もう待っていない（回答済み・中断済み）なら 409
    approvals.resolve(c.req.param("id"), decision);
    return c.json({ ok: true });
  });
}
