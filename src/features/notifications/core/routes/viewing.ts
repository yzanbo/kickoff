import type { Hono } from "hono";
import { z } from "zod";
import type { ViewingBody } from "@shared/notifications/types";
import { callerOf } from "@/foundation/core/http/caller";
import { jsonBody } from "@/foundation/core/http/input";
import type { ViewingRegistry } from "@/features/notifications/core/viewing";

const viewingSchema = z.object({ chat_id: z.number().int().positive().nullable(), ci_project_id: z.number().int().positive().nullable() }) satisfies z.ZodType<ViewingBody>;

/** いま見ているもの（この Mac の画面も端末も。だれかが見ているチャット・CI のタブの知らせは通知しない = center.ts） */
export function viewingRoutes(app: Hono, { viewing }: { viewing: ViewingRegistry }) {
  app.put("/api/viewing", async (c) => {
    viewing.report(callerOf(c), viewingSchema.parse(await jsonBody(c)));
    return c.body(null, 204);
  });
}
