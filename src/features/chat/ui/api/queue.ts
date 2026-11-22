// 送信待ちの API の呼び手（取り決めは @shared/chat/contract.ts の chatQueueContract。送信待ちの画面と圧縮の予約の取り消しが読む）
import { chatQueueContract } from "@shared/chat/contract";
import { client } from "@/foundation/ui/api";

export const chatQueueApi = client(chatQueueContract);
