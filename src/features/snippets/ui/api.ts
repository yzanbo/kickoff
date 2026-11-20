// 定型文の API の呼び手（取り決めは @shared/snippets/contract.ts）
import { snippetContract } from "@shared/snippets/contract";
import { client } from "@/foundation/ui/api";

export const snippetsApi = client(snippetContract);
