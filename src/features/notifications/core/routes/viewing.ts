// 通知の受け口（取り決め @shared/notifications/contract.ts）
import { z } from "zod";
import { notificationsContract } from "@shared/notifications/contract";
import type { ViewingBody } from "@shared/notifications/types";
import { implement } from "@/foundation/core/http/implement";
import type { ViewingRegistry } from "@/features/notifications/core/viewing";

const viewingSchema = z.object({ chat_id: z.number().int().positive().nullable(), ci_project_id: z.number().int().positive().nullable() }) satisfies z.ZodType<ViewingBody>;

/** いま見ているもの（この Mac の画面も端末も。だれかが見ているチャット・CI のタブの知らせは通知しない = center.ts） */
export function viewingRoutes({ viewing }: { viewing: ViewingRegistry }) {
  return implement(notificationsContract, {
    context: {},
    "PUT /api/viewing": {
      body: viewingSchema,
      run: ({ caller, body }) => viewing.report(caller, body),
    },
  });
}
