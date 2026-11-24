// 送信待ちの機能の API の呼び手（起動したときの再開の確かめ。取り決めは @shared/queue/contract.ts）
import { queueContract } from "@shared/queue/contract";
import { client } from "@/foundation/ui/api/client";

export const queueApi = client(queueContract);
