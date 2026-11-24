// ゴミ箱の API の呼び手（取り決めは @shared/trash/contract.ts。コアの受け口は core/routes/trash.ts）
import { trashContract } from "@shared/trash/contract";
import { client } from "@/foundation/ui/api/client";

export const trashApi = client(trashContract);
