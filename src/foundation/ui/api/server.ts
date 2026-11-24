// 土台の口（接続の状態）の呼び手（取り決めは @shared/foundation/serverContract.ts。左下の接続の詳細・起動のときの DB の ID が読む）
import { serverContract } from "@shared/foundation/serverContract";
import { client } from "./client";

export const serverApi = client(serverContract);
