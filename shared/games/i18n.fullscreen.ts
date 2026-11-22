// 2026-11-22: the full-screen button (src/components/FullscreenButton.tsx) in every room, the race
// room's waiting room and the kart's own menu. Registered by the button's chunk, so not in anyone's
// first load; screenMessages.ts lists them for check-i18n. `en` is the source.
const en = {
  'room.extra.fullscreen.enter': 'Full screen',
  'room.extra.fullscreen.exit': 'Leave full screen',
  'room.extra.fullscreen.focus':
    'This browser cannot go full screen, so the page covers its own bars instead. Esc or the button leaves.',
  'room.extra.fullscreen.ios':
    'On an iPhone the browser keeps its bars. Add TKU Arcade to your Home Screen (Share, then Add to Home Screen) to play without them.',
  'room.extra.fullscreen.auto': 'Full screen when a race starts',
}

const zhTW: Record<keyof typeof en, string> = {
  'room.extra.fullscreen.enter': '全螢幕',
  'room.extra.fullscreen.exit': '離開全螢幕',
  'room.extra.fullscreen.focus': '這個瀏覽器無法全螢幕，改用專注模式蓋住頁面上的其他部分。按 Esc 或再按一次按鈕離開。',
  'room.extra.fullscreen.ios': 'iPhone 的瀏覽器會留著網址列。把淡江遊樂場加到主畫面（分享 → 加入主畫面）後開啟，就能全螢幕玩。',
  'room.extra.fullscreen.auto': '進比賽時自動全螢幕',
}

export const fullscreenMessages = { en, 'zh-TW': zhTW }
