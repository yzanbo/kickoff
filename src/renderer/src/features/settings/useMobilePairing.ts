import { useEffect, useState } from "react";
import type { Device, PairingState } from "@shared/types";
import { pairingLink } from "@shared/devices/pairing";
import { api } from "@/api";
import { useServerEvent } from "@/api/events";
import { useAction } from "@/hooks/useAction";
import { useAsync } from "@/hooks/useAsync";
import { confirmDialog } from "@/ui/dialogs";

/** QR の画像（data: の PNG）。qrcode は使うときだけ読み込む */
function useQrImage(text: string | null): string | null {
  const [image, setImage] = useState<{ text: string; url: string } | null>(null);
  useEffect(() => {
    if (!text) return;
    let alive = true;
    void import("qrcode").then(({ toDataURL }) => toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: "M" })).then((url) => alive && setImage({ text, url }));
    return () => {
      alive = false;
    };
  }, [text]);
  return text && image?.text === text ? image.url : null;
}

/**
 * 設定の「スマホ連携」の様子と操作: ペアリング（番号・QR・確かめを待っている頼み）と、つないだ端末の一覧。
 * 様子はサーバーの知らせ（pairing / devices）でその場で直す
 */
export function useMobilePairing() {
  const pairing = useAsync(() => api.pairingState());
  const devices = useAsync(() => api.devices());
  const action = useAction<"start" | "cancel" | "approve" | "deny" | "revoke">();
  const state = pairing.data;

  useServerEvent((e) => {
    if (e.type === "pairing") pairing.setData(e.state);
    if (e.type === "devices") devices.reload();
  });

  const link = state?.code ? pairingLink(state.url, state.code, state.host_id) : null;
  const qr = useQrImage(link);

  const set = (next: PairingState) => pairing.setData(next);
  return {
    state,
    devices: devices.data ?? ([] as Device[]),
    link,
    qr,
    action,
    start: () => action.run("start", async () => set(await api.startPairing())),
    cancel: () => action.run("cancel", async () => set(await api.cancelPairing())),
    approve: (id: string) => action.run("approve", async () => set(await api.approvePairing(id))),
    deny: (id: string) => action.run("deny", async () => set(await api.denyPairing(id))),
    revoke: async (device: Device) => {
      const ok = await confirmDialog({
        title: `「${device.name}」を取り消しますか？`,
        message: "この端末は、もうこの Mac の Kickoff につなげなくなります。もう一度使うときは、つなぎ直してください。",
        confirmLabel: "取り消す",
        danger: true,
      });
      if (ok) await action.run("revoke", () => api.revokeDevice(device.id));
    },
  };
}
