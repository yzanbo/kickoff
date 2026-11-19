import { askApproval, isAllowed, type ApprovalContext } from "@/features/ai/core/providers/guardedApproval";

/**
 * Cursor の ACP の独自の頼み（Cursor の説明の「Cursor extension methods」。答えを待つもの）を Kickoff のカードに写す:
 * cursor/ask_question = AI からの質問（AskUserQuestion の形の質問カード）、cursor/create_plan = 計画の承認（承認カード）。
 * 知らせだけのもの（cursor/update_todos・cursor/task・cursor/generate_image）は答えが要らないので読み飛ばす
 */

interface AskQuestionRequest {
  toolCallId: string;
  title?: string;
  questions: { id: string; prompt: string; options: { id: string; label: string }[]; allowMultiple?: boolean }[];
}

interface CreatePlanRequest {
  toolCallId: string;
  name?: string;
  overview?: string;
  plan: string;
}

async function askQuestion(ctx: ApprovalContext, p: AskQuestionRequest): Promise<unknown> {
  const questions = p.questions.map((q) => ({ question: q.prompt, header: (p.title ?? "質問").slice(0, 12), options: q.options.map((o) => ({ label: o.label, description: "" })), multiSelect: Boolean(q.allowMultiple) }));
  const decision = await askApproval(ctx, { kind: "question", toolName: "AskUserQuestion", input: { questions }, canRemember: false, toolUseId: p.toolCallId });
  if (ctx.signal.aborted) return { outcome: { outcome: "cancelled" } };
  if (decision.action !== "answer") return { outcome: { outcome: "skipped", reason: decision.action === "deny" ? decision.message || "利用者が答えませんでした" : "利用者が答えませんでした" } };
  const answers = p.questions.map((q) => {
    const answer = decision.answers[q.prompt];
    const labels = answer === undefined ? [] : Array.isArray(answer) ? answer : [answer];
    return { questionId: q.id, selectedOptionIds: q.options.filter((o) => labels.includes(o.label)).map((o) => o.id) };
  });
  return { outcome: { outcome: "answered", answers } };
}

async function createPlan(ctx: ApprovalContext, p: CreatePlanRequest): Promise<unknown> {
  const decision = await askApproval(ctx, {
    kind: "permission",
    toolName: "ExitPlanMode",
    input: { plan: p.plan },
    title: p.name ? `計画「${p.name}」を進めてよいですか` : "この計画で進めてよいですか",
    ...(p.overview ? { description: p.overview } : {}),
    canRemember: false,
    toolUseId: p.toolCallId,
  });
  if (ctx.signal.aborted) return { outcome: { outcome: "cancelled" } };
  if (isAllowed(decision)) return { outcome: { outcome: "accepted" } };
  return { outcome: { outcome: "rejected", ...(decision.action === "deny" && decision.message ? { reason: decision.message } : {}) } };
}

/** Cursor の独自の頼みに答える（知らない頼みは undefined = 断る） */
export function cursorExtension(method: string, params: unknown, ctx: ApprovalContext): Promise<unknown> | undefined {
  if (method === "cursor/ask_question") return askQuestion(ctx, params as AskQuestionRequest);
  if (method === "cursor/create_plan") return createPlan(ctx, params as CreatePlanRequest);
  return undefined;
}
