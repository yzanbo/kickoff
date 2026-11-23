import { useEffect, useState } from "react";
import type { LoginItemState } from "@shared/foundation/ipc";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { saveSettings, useAppSettings } from "@/features/settings/ui";
import { confirm } from "@/foundation/ui/kit/ask";
import { loginItemState, setLoginItem as saveLoginItem } from "@/features/devices/ui/native";

/** バッテリーの様子（Chromium の Battery Status API。型は lib.dom にないので、使う所だけ書く） */
type BatteryManager = EventTarget & { charging: boolean };
type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryManager> };

/** いまバッテリーで動いているか（分からなければ false。電源をつなぐ・外すとその場で変わる） */
function useOnBattery(): boolean {
  const [onBattery, setOnBattery] = useState(false);
  useEffect(() => {
    let battery: BatteryManager | undefined;
    const update = () => battery && setOnBattery(!battery.charging);
    void (navigator as NavigatorWithBattery)
      .getBattery?.()
      .then((b) => {
        battery = b;
        update();
        b.addEventListener("chargingchange", update);
      })
      .catch(() => {});
    return () => battery?.removeEventListener("chargingchange", update);
  }, []);
  return onBattery;
}

/**
 * 設定の「スマホ連携」のいちばん上の 2 つ: スマホからつなぐ（設定の mobile_enabled）とログイン時に起動（Mac のアプリだけ。IPC の loginItem）。
 * スマホからつなぐをオンにしたとき、ログイン時に起動がオフなら、あわせてオンにするかを聞く（提案だけで、勝手にはオンにしない）
 */
export function useMobileSwitches() {
  const settings = useAppSettings().data;
  const [loginItem, setLoginItem] = useState<LoginItemState | null>(null);
  const onBattery = useOnBattery();
  const action = useAction<"mobile" | "login">();

  useEffect(() => {
    void loginItemState().then(setLoginItem);
  }, []);

  const setLogin = (open: boolean) => action.run("login", async () => setLoginItem(await saveLoginItem(open)));

  const setMobile = async (on: boolean) => {
    const ok = await action.run("mobile", () => saveSettings({ mobile_enabled: on }));
    if (!ok || !on || !loginItem?.available || loginItem.openAtLogin) return;
    const also = await confirm({
      title: "ログイン時に Kickoff を起動しますか？",
      message: "オフのままだと、Mac を再起動したあとは Kickoff を開くまでスマホから届きません。オンにすると、ログインしたときに窓を出さずに裏で起動します。",
      confirmLabel: "オンにする",
    });
    if (also) await setLogin(true);
  };

  return { mobileEnabled: settings?.mobile_enabled ?? false, loginItem, onBattery, action, setMobile, setLogin };
}
