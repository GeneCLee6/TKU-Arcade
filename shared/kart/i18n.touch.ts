// Touch controls (owner 2026-11-17; docs/ARCHITECTURE.md §4.25): the on-screen buttons, their
// settings and how to drive with them. Merged into KART_MESSAGES (i18n.ts), so the same check covers
// them. `en` is the source.
const en = {
  'kart.touch.controls': 'Touch controls',
  'kart.touch.gas': 'Gas',
  'kart.touch.brake': 'Brake',
  'kart.touch.drift': 'Drift',
  'kart.touch.boost': 'Boost',
  'kart.touch.item': 'Item',
  'kart.touch.reset': 'Reset',
  'kart.touch.steer': 'Steer',
  'kart.touch.open': 'Touch controls: settings and how to drive',
  'kart.touch.title': 'Touch controls',
  'kart.touch.close': 'Close',
  'kart.touch.steerStyle': 'Steering',
  'kart.touch.steerButtons': 'Two buttons',
  'kart.touch.steerSlider': 'Slider: drag sideways',
  'kart.touch.autoThrottle': 'Automatic throttle',
  'kart.touch.autoThrottleNote':
    'The engine runs by itself after GO. Gas is then only tapped: for an instant boost out of a drift, or held just before GO for a start boost.',
  'kart.touch.size': 'Button size',
  'kart.touch.opacity': 'Opacity',
  'kart.touch.percent': '{value}%',
  'kart.touch.leftHanded': 'Left-handed: steer on the right',
  'kart.touch.vibrate': 'Vibrate when hit and when a boost fires',
  'kart.touch.notSaved': "This browser won't keep it: it lasts until the page closes.",
  'kart.touch.howTo': 'How to drive by touch',
  'kart.touch.help':
    'Left thumb steers; right thumb drives. To drift, hold Drift and steer: holding Drift keeps the gas on too. Let go of Drift and the kart slides out: steer the other way to pull it straight, then tap Gas for an instant boost (once a drift has earned one, gold sparks, the automatic throttle lets go by itself so that your tap counts; nothing fires until you tap). Tap Drift again right after it and do the same for a double; keep going, even with short drifts on the straights, to chain them. Boost fires a stored boost, Item uses the item, Brake brakes and reverses, Reset puts the kart back on the road. With the automatic throttle the engine runs by itself after GO; hold Gas just before GO for a start boost.',
  'kart.touch.rotate': 'Turn your phone sideways for a better view.',
} as const

export type KartTouchKey = keyof typeof en

const zhTW: Record<KartTouchKey, string> = {
  'kart.touch.controls': '觸控按鍵',
  'kart.touch.gas': '油門',
  'kart.touch.brake': '煞車',
  'kart.touch.drift': '甩尾',
  'kart.touch.boost': '噴射',
  'kart.touch.item': '道具',
  'kart.touch.reset': '復位',
  'kart.touch.steer': '轉向',
  'kart.touch.open': '觸控按鍵：設定與操作說明',
  'kart.touch.title': '觸控按鍵',
  'kart.touch.close': '關閉',
  'kart.touch.steerStyle': '轉向',
  'kart.touch.steerButtons': '左右兩顆鍵',
  'kart.touch.steerSlider': '滑桿：左右拖',
  'kart.touch.autoThrottle': '自動油門',
  'kart.touch.autoThrottleNote':
    'GO 之後引擎自己跑，油門只要「點」：甩尾後要瞬間加速時點一下，或在 GO 前一刻按住拿起步加速。',
  'kart.touch.size': '按鍵大小',
  'kart.touch.opacity': '不透明度',
  'kart.touch.percent': '{value}%',
  'kart.touch.leftHanded': '左手模式：轉向放右邊',
  'kart.touch.vibrate': '被打中與噴射時震動',
  'kart.touch.notSaved': '這個瀏覽器不讓存：關掉頁面前有效。',
  'kart.touch.howTo': '觸控怎麼開',
  'kart.touch.help':
    '左手轉向，右手開車。甩尾：按住「甩尾」再轉向（按住甩尾時油門也一直踩著）。放開「甩尾」車會滑出去：往反方向轉把它拉正，再點一下「油門」才會瞬間加速（甩到出金色火花之後，自動油門會自己鬆開等你點；不點就不會噴）；噴完馬上再點一下甩尾、照做一次是雙收尾，一路接下去（直線上短甩也行）就是連噴。「噴射」放出存好的加速，「道具」用道具，「煞車」煞車與倒車，「復位」回到路上。開著自動油門時，GO 之後引擎自己跑；GO 前一刻按住油門可以起步加速。',
  'kart.touch.rotate': '把手機轉橫，畫面比較好看。',
}

export const KART_TOUCH_MESSAGES = { en, 'zh-TW': zhTW }
