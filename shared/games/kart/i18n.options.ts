// The race room's options as the waiting room shows them: the track and the laps. Registered by
// the waiting room's lazy chunk (src/i18n/waitingExtras.ts), the only place a room's options are
// set, so that they stay out of everyone's first load; screenMessages.ts lists them for check-i18n.
// `en` is the source; a new track in shared/kart/tracks/list.ts needs its name here.
const en = {
  'games.kart.option.track': 'Track',
  'games.kart.option.laps': 'Laps',
  // Working titles, as on the time trial's course menu
  'games.kart.track.riverside': 'Riverside',
  'games.kart.track.harbour': 'Harbour Hairpins',
  'games.kart.track.tamkang': 'Tamkang Campus',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.kart.option.track': '賽道',
  'games.kart.option.laps': '圈數',
  'games.kart.track.riverside': '河畔',
  'games.kart.track.harbour': '漁港髮夾彎',
  'games.kart.track.tamkang': '淡江校園',
}

export const kartOptionMessages = { en, 'zh-TW': zhTW }
