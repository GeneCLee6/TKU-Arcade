// What the kart's menu and its races say of the screens that load their own strings (2026-11-22):
// the driving school's way in and its tips during a race, the challenges' way in, and what /kart shows
// of a shared track. The rest of those screens' strings are registered by their own lazy chunks
// (SchoolView, ChallengeView, EditorPage), so that the menu and a race do not wait for them. Merged
// into KART_MESSAGES (i18n.ts). `en` is the source.
const en = {
  // The driving school (i18n.school.ts): the menu's way in, the invitation, and the tips during a race
  'kart.school.open': 'Driving school',
  'kart.school.loading': 'Loading the lesson…',
  'kart.school.coach': 'Tips during races',
  'kart.school.coachNote': 'A short tip, once each, for a technique you have not used yet.',
  'kart.school.trackCues': 'Track technique cues',
  'kart.school.trackCuesNote': 'Cyan and amber marks at the slots, branches and drift jumps on the tracks to learn by heart.',
  'kart.school.invite': 'New to the kart? The driving school teaches the drift and the instant boost in a few minutes.',
  'kart.school.inviteGo': 'Go to the driving school',
  'kart.school.inviteNo': 'No thanks',
  'kart.school.tip': 'Tip',
  'kart.school.closeTip': 'Close the tip',

  'kart.school.tip.repress': 'After a drift, let go of {throttle} and press it again: an instant boost.',
  'kart.school.tip.deeper':
    'Hold the drift longer and steer into the corner: once the meter under the kart turns gold, an instant boost is yours.',
  'kart.school.tip.perfect':
    'Press {throttle} the moment you let go of {drift}: a perfect instant boost, longer and stronger.',
  'kart.school.tip.fire': 'You have a charge: press {boost} to fire N2O.',
  'kart.school.tip.locked': 'N2O fires one at a time: the next one after this one ends.',
  'kart.school.tip.start': 'Hold {throttle} during the countdown’s “1” for a perfect start.',
  'kart.school.tip.reset': 'Stuck? {reset} puts you back on the road.',

  // The challenges (i18n.challenge.ts): the menu's way in
  'kart.challenge.open': 'Challenges',
  'kart.challenge.loading': 'Loading the challenge…',

  // The track editor (i18n.editor.ts): what /kart shows of a shared track
  'kart.editor.open': 'Track editor',
  'kart.editor.editCopy': 'Edit a copy of this track',
  'kart.editor.badLink':
    'This track link does not work: it may have been cut short or changed. Here is a built-in track instead.',
  'kart.editor.untitled': 'Untitled track',
} as const

export type KartMenuKey = keyof typeof en

const zhTW: Record<KartMenuKey, string> = {
  // The driving school (i18n.school.ts): the menu's way in, the invitation, and the tips during a race
  'kart.school.open': '駕訓班',
  'kart.school.loading': '課程載入中…',
  'kart.school.coach': '比賽中的技巧提示',
  'kart.school.coachNote': '還沒用過的技巧，給一次簡短提示。',
  'kart.school.trackCues': '賽道技術提示',
  'kart.school.trackCuesNote': '背圖賽道上牆縫、岔路與甩尾起跳處的青色與琥珀色標記。',
  'kart.school.invite': '第一次開卡丁車？駕訓班幾分鐘就教會甩尾和瞬間加速。',
  'kart.school.inviteGo': '去駕訓班',
  'kart.school.inviteNo': '不用了',
  'kart.school.tip': '提示',
  'kart.school.closeTip': '關閉提示',

  'kart.school.tip.repress': '甩尾之後放開 {throttle} 再按一下：瞬間加速。',
  'kart.school.tip.deeper': '甩尾按久一點、往彎內打：車子下方的量表變金色，就有瞬間加速。',
  'kart.school.tip.perfect': '放開 {drift} 的同一瞬間按 {throttle}：完美時機，噴得更久更強。',
  'kart.school.tip.fire': '有 N2O 了：按 {boost} 噴出去。',
  'kart.school.tip.locked': 'N2O 一次一個：這一個噴完才能噴下一個。',
  'kart.school.tip.start': '倒數到「1」時按住 {throttle}：完美起跑。',
  'kart.school.tip.reset': '卡住了？{reset} 回到路上。',

  // The challenges (i18n.challenge.ts): the menu's way in
  'kart.challenge.open': '挑戰',
  'kart.challenge.loading': '挑戰載入中…',

  // The track editor (i18n.editor.ts): what /kart shows of a shared track
  'kart.editor.open': '賽道編輯器',
  'kart.editor.editCopy': '複製這條賽道來改',
  'kart.editor.badLink': '這個賽道連結打不開：可能被截斷或改過。先用內建的賽道。',
  'kart.editor.untitled': '未命名賽道',
}

export const KART_MENU_MESSAGES = { en, 'zh-TW': zhTW }
