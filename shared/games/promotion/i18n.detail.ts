// The words of the promotion screen that the board does not draw, so that they stay out of the board
// font's request (boardFont.ts): full screen and the tip to turn a phone (e3-t10), a cell's details
// with its hat button and watermark, both illustrative (e3-t11). Loaded with the screen
// (src/games/promotion/CellDetail.tsx); check-i18n and `npm run play` find them through
// shared/games/screenMessages.ts. `en` is the source.
const en = {
  'games.promotion.ui.fullscreen': 'Full screen',
  'games.promotion.ui.exitFullscreen': 'Exit full screen',
  'games.promotion.ui.sidewaysTip': 'Small names? Turn sideways, then Full screen.',
  'games.promotion.knob.ruby': 'ruby',
  'games.promotion.knob.coral': 'coral',
  'games.promotion.knob.sapphire': 'sapphire',
  'games.promotion.knob.lapis': 'lapis lazuli',
  'games.promotion.knob.crystal': 'crystal',
  'games.promotion.knob.shell': 'white shell',
  'games.promotion.knob.gold': 'plain gold',
  'games.promotion.knob.engravedGold': 'engraved gold',
  'games.promotion.ui.knob': 'Hat button (illustrative): {knob}',
  'games.promotion.ui.hat': 'Watermark (illustrative): the hat of this stage of a career',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.promotion.ui.fullscreen': '全螢幕',
  'games.promotion.ui.exitFullscreen': '離開全螢幕',
  'games.promotion.ui.sidewaysTip': '字太小？轉橫再按全螢幕。',
  'games.promotion.knob.ruby': '紅寶石',
  'games.promotion.knob.coral': '珊瑚',
  'games.promotion.knob.sapphire': '藍寶石',
  'games.promotion.knob.lapis': '青金石',
  'games.promotion.knob.crystal': '水晶',
  'games.promotion.knob.shell': '硨磲',
  'games.promotion.knob.gold': '素金',
  'games.promotion.knob.engravedGold': '鏤花金',
  'games.promotion.ui.knob': '頂戴（示意）：{knob}',
  'games.promotion.ui.hat': '浮水印（示意）：這個階段的帽子',
}

export const promotionDetailMessages = {
  en: en as Record<string, string>,
  'zh-TW': zhTW as Record<string, string>,
}
