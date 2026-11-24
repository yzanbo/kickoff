// ポートを使っているプロセスの受け口（取り決め @shared/ports/contract.ts。端末には開かない）
import { z } from "zod";
import { portsContract } from "@shared/ports/contract";
import type { PortStopBody } from "@shared/ports/types";
import { implement } from "@/foundation/core/http/implement";
import { flag } from "@/foundation/core/http/zodParts";
import type { PortWatch } from "@/features/ports/core/watch";

const stopBody = z.object({
  pid: z.number().int().positive(),
  command: z.string().max(100_000),
  force: z.boolean().optional(),
}) satisfies z.ZodType<PortStopBody>;

export function portsRoutes({ ports }: { ports: PortWatch }) {
  return implement(portsContract, {
    context: {},
    // 調べる（窓を開いた・↻。調べたら SSE の ports_changed でほかの窓に知らせる）。?cached=1 は最後に調べた一覧（知らせを受けた・起動したとき）
    "GET /api/ports": {
      query: z.object({ cached: flag.optional() }),
      run: async ({ query }) => ({ processes: query.cached === "1" ? await ports.latest() : await ports.check() }),
    },
    // 止める（SIGTERM。force なら SIGKILL）。少し待って終わったかを返す
    "POST /api/ports/stop": {
      body: stopBody,
      run: async ({ body }) => ({ stopped: await ports.stop(body.pid, body.command, body.force ?? false) }),
    },
  });
}
