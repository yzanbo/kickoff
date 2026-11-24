// 通知の取り決め（受け口は src/features/notifications/core/routes/viewing.ts）。見ているものの知らせは、この Mac の画面も端末（見るだけの端末も）も使う
import { empty, type Contract } from "@shared/foundation/contract";
import type { ViewingBody } from "./types";

export const notificationsContract = {
  /** いま見ているもの（だれかが見ているチャット・CI のタブの知らせは通知しない） */
  "PUT /api/viewing": empty<ViewingBody>({ access: "deviceRead" }),
} as const satisfies Contract;
