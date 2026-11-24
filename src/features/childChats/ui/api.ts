// 子チャットの API の呼び手（取り決めは @shared/childChats/contract.ts）
import { childChatContract } from "@shared/childChats/contract";
import { client } from "@/foundation/ui/api/client";

export const childChatsApi = client(childChatContract);
