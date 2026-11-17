// The race room's options as the waiting room shows them: the track and the laps. Not in the first
// load: the room loads this file when it opens a race room (src/i18n/gameDetails.ts). The name and
// summary are the lobby's (shared/games/lobby.en.ts). `en` is the source; a new track in
// shared/kart/tracks/list.ts needs its name here.
const en = {
  'games.kart.option.track': 'Track',
  'games.kart.option.laps': 'Laps',
  'games.kart.option.mode': 'Mode',
  'games.kart.mode.items': 'Item race',
  'games.kart.mode.race': 'Speed race (no items)',
  // Working titles, as on the time trial's course menu
  'games.kart.track.riverside': 'Riverside',
  'games.kart.track.harbour': 'Harbour Hairpins',
  'games.kart.track.tamkang': 'Tamkang Campus',
  'games.kart.track.oldstreet': 'Lantern Old Street',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.kart.option.track': '賽道',
  'games.kart.option.laps': '圈數',
  'games.kart.option.mode': '模式',
  'games.kart.mode.items': '道具賽',
  'games.kart.mode.race': '競速賽（沒有道具）',
  'games.kart.track.riverside': '河畔',
  'games.kart.track.harbour': '漁港髮夾彎',
  'games.kart.track.tamkang': '淡江校園',
  'games.kart.track.oldstreet': '燈籠老街',
}

export const kartMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
