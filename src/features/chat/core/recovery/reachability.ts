/** AI の API（url）に届くか（返事があれば届いている。HTTPS の証明書で確かめるので、公衆 Wi-Fi のログイン画面に横取りされているときは false） */
export async function canReachApi(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}
