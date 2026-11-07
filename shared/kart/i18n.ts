// The kart's own strings, registered by its lazy chunk (src/i18n/t.ts registerMessages), so that
// they stay out of the first load of the lobby and the board games. Same rules as any catalog:
// en is the source, zh-TW has the same keys, and `npm run check-i18n` compares them.
const en = {
  'kart.spike.title': 'Kart physics test',
  'kart.spike.canvas': 'A box car on a flat plane, seen from behind',
  'kart.spike.keys':
    'Arrows or WASD to drive. Hold Shift while steering to drift. F shows the numbers.',
  'kart.spike.noTouch':
    'No touch controls in this test: driving needs a keyboard. The numbers still work.',
  'kart.spike.noWebgl': "This browser can't run WebGL 2, so the test can't start.",
  'kart.spike.contextLost':
    'The browser took the graphics context away. Reload the page to start again.',
  'kart.spike.back': 'Back to the lobby',
  'kart.spike.showNumbers': 'Show numbers',
  'kart.spike.hideNumbers': 'Hide numbers',
  'kart.spike.fps': 'Frames per second',
  'kart.spike.slowest': 'Slowest frame',
  'kart.spike.ms': '{ms} ms',
  'kart.spike.speed': 'Speed',
  'kart.spike.metresPerSecond': '{speed} m/s',
  'kart.spike.slip': 'Slip angle',
  'kart.spike.degrees': '{degrees}°',
  'kart.spike.drift': 'Drifting',
  'kart.spike.yes': 'Yes',
  'kart.spike.no': 'No',
  'kart.spike.resolution': 'Drawn at',
  'kart.spike.renderer': 'Renderer',
} as const

export type KartMessageKey = keyof typeof en

const zhTW: Record<KartMessageKey, string> = {
  'kart.spike.title': '卡丁車物理測試',
  'kart.spike.canvas': '平地上的一台方塊車，從車後看',
  'kart.spike.keys': '方向鍵或 WASD 駕駛。轉向時按住 Shift 甩尾。按 F 看數字。',
  'kart.spike.noTouch': '這個測試沒有觸控操作，要鍵盤才能開。數字還是看得到。',
  'kart.spike.noWebgl': '這個瀏覽器無法執行 WebGL 2，所以測試無法開始。',
  'kart.spike.contextLost': '瀏覽器收回了繪圖資源。請重新整理頁面再開始。',
  'kart.spike.back': '回大廳',
  'kart.spike.showNumbers': '顯示數字',
  'kart.spike.hideNumbers': '隱藏數字',
  'kart.spike.fps': '每秒影格數',
  'kart.spike.slowest': '最慢的一格',
  'kart.spike.ms': '{ms} 毫秒',
  'kart.spike.speed': '速度',
  'kart.spike.metresPerSecond': '每秒 {speed} 公尺',
  'kart.spike.slip': '側滑角',
  'kart.spike.degrees': '{degrees} 度',
  'kart.spike.drift': '甩尾中',
  'kart.spike.yes': '是',
  'kart.spike.no': '否',
  'kart.spike.resolution': '繪製解析度',
  'kart.spike.renderer': '繪圖器',
}

export const KART_MESSAGES = { en, 'zh-TW': zhTW }
