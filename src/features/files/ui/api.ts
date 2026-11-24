// ファイルの API の呼び手（取り決めは @shared/files/contract.ts。作業場所は @/foundation/ui/api/workdir の workdirInput で渡す）
import { filesContract } from "@shared/files/contract";
import { client } from "@/foundation/ui/api/client";

export const filesApi = client(filesContract);
