// AI のブラウザ操作で、埋め込みブラウザのページの中で動かす JavaScript（executeJavaScript に渡す文）。
// 関数を文字列にすると束ねるときに手が入ることがあるので、文のまま書く。押せる要素には data-kickoff-ref の番号を付け、押す・打つはその番号で探す

/** 番号の付いた要素を探す式 */
const findRef = (ref: number) => `document.querySelector('[data-kickoff-ref="${ref}"]')`;

/** 見えている大きさ（0 なら、まだ並べられていない） */
export const VIEWPORT_SCRIPT = "innerWidth * innerHeight";

/** 押せる・入力できる要素に番号を振り、ページの読み取り（PageSnapshot の形）を返す */
export const SNAPSHOT_SCRIPT = `(() => {
  const MAX = 300;
  document.querySelectorAll('[data-kickoff-ref]').forEach((e) => e.removeAttribute('data-kickoff-ref'));
  const selector = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=textbox],[role=combobox],[contenteditable=""],[contenteditable=true],[onclick]';
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
  };
  const label = (el) => el.getAttribute('aria-label') || el.getAttribute('title') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('name');
  const elements = [];
  for (const el of document.querySelectorAll(selector)) {
    if (elements.length >= MAX) break;
    if (el.disabled || !shown(el)) continue;
    const ref = elements.length + 1;
    el.setAttribute('data-kickoff-ref', String(ref));
    const tag = el.tagName.toLowerCase();
    const field = tag === 'input' || tag === 'textarea' || tag === 'select';
    const type = tag === 'input' ? (el.type || 'text') : el.getAttribute('role');
    const parts = [field ? label(el) : (label(el) || el.innerText || el.value)];
    if (field && el.type !== 'password' && el.value) parts.push('値: ' + el.value);
    if ((el.type === 'checkbox' || el.type === 'radio') && el.checked) parts.push('チェック済み');
    elements.push({ ref, tag, type: type || null, name: clean(parts.filter(Boolean).join(' / ')), href: tag === 'a' ? el.href : null });
  }
  const root = document.scrollingElement || document.documentElement;
  return {
    url: location.href,
    title: document.title,
    elements,
    text: (document.body ? document.body.innerText : '').slice(0, 50000),
    scroll: { y: root.scrollTop, height: root.scrollHeight, viewport: innerHeight },
  };
})()`;

/** 要素を見える位置までスクロールし、真ん中の位置と名前を返す（なければ null） */
export const pointScript = (ref: number) => `(() => {
  const el = ${findRef(ref)};
  if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  const name = String(el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('placeholder') || el.innerText || el.value || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: innerWidth, height: innerHeight, name, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el || el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
})()`;

/** 要素を JavaScript で押す（位置で押せないとき） */
export const clickScript = (ref: number) => `(() => {
  const el = ${findRef(ref)};
  if (!el) return false;
  el.focus();
  el.click();
  return true;
})()`;

/**
 * 入力欄の中身を置き換える（React などの入力欄にも届くよう、値の setter を通して input・change を起こす）。
 * submit ならフォームを送る。結果: "missing" = 要素がない / "submitted" = フォームを送った / "typed" = 入れた（送るならキーで）
 */
export const typeScript = (ref: number, text: string, submit: boolean) => `(() => {
  const el = ${findRef(ref)};
  if (!el) return 'missing';
  const text = ${JSON.stringify(text)};
  el.scrollIntoView({ block: 'center' });
  el.focus();
  if (el.isContentEditable) {
    document.getSelection().selectAllChildren(el);
    document.execCommand('insertText', false, text);
  } else {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (${submit} && el.form && el.form.requestSubmit) {
    el.form.requestSubmit();
    return 'submitted';
  }
  return 'typed';
})()`;

/** スクロールする（ページが動かなければ、見えている中でいちばん大きいスクロールできる要素を動かす）。動いたあとの位置の文を返す */
export const scrollScript = (direction: "up" | "down" | "top" | "bottom") => `(() => {
  const direction = ${JSON.stringify(direction)};
  const page = document.scrollingElement || document.documentElement;
  const scrollable = (el) => el.scrollHeight > el.clientHeight + 1;
  let target = page;
  if (!scrollable(page)) {
    let best = 0;
    for (const el of document.querySelectorAll('*')) {
      if (!scrollable(el)) continue;
      const s = getComputedStyle(el).overflowY;
      if (s !== 'auto' && s !== 'scroll') continue;
      const r = el.getBoundingClientRect();
      const area = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (area > best) { best = area; target = el; }
    }
  }
  const view = target === page ? innerHeight : target.clientHeight;
  const top = direction === 'top' ? 0 : direction === 'bottom' ? target.scrollHeight : target.scrollTop + (direction === 'down' ? 0.85 : -0.85) * view;
  target.scrollTo({ top, behavior: 'instant' });
  return 'スクロール: ' + Math.round(target.scrollTop) + ' / ' + Math.max(0, Math.round(target.scrollHeight - view)) + 'px';
})()`;
