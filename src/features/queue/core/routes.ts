// 送信待ちの受け口（取り決めは @shared/queue/contract.ts）: 起動したときの再開の確かめ（決めるのは chat の殻）
import { z } from "zod";
import { RESTART_RESUME_ACTIONS } from "@shared/chat/chatLive";
import { queueContract } from "@shared/queue/contract";
import { implement } from "@/foundation/core/http/implement";
import type { ChatRunner } from "@/features/chat/core/index";

export function queueRoutes({ runner }: { runner: Pick<ChatRunner, "restartResumes" | "resolveRestartResumes"> }) {
  return implement(queueContract, {
    context: {},
    "GET /api/restart-resumes": { run: () => runner.restartResumes() },
    "POST /api/restart-resumes": {
      body: z.object({ decisions: z.array(z.object({ chat_id: z.number().int().positive(), action: z.enum(RESTART_RESUME_ACTIONS) })).max(500) }),
      run: async ({ body }) => {
        await runner.resolveRestartResumes(body.decisions.map((d) => ({ chatId: d.chat_id, action: d.action })));
        return runner.restartResumes();
      },
    },
  });
}
