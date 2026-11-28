// チャット欄とノートの外の画像の呼び手（取り決めは @shared/remoteImages/contract.ts。コアの受け口は core/routes/）
import { noteImagesContract, remoteImagesContract } from "@shared/remoteImages/contract";
import { client } from "@/foundation/ui/api/client";

export const remoteImagesApi = client(remoteImagesContract);
export const noteImagesApi = client(noteImagesContract);
