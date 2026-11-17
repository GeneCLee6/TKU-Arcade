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
  // 2026-11-17: computer karts in a race room (ARCHITECTURE §4.21). Their names are working titles,
  // the same as the race against the computer's (shared/kart/i18n.bots.ts)
  'games.kart.bot.tag': '{name} (CPU)',
  'games.kart.bot.title': 'Computer karts',
  'games.kart.bot.level': 'Level',
  'games.kart.bot.level.easy': 'Easy',
  'games.kart.bot.level.normal': 'Normal',
  'games.kart.bot.level.hard': 'Hard',
  'games.kart.bot.add': 'Add a computer kart',
  'games.kart.bot.full': 'Every seat is taken.',
  'games.kart.bot.note':
    'They take free seats. Your browser drives them in the race, so keep this tab open and in front. If you lose the connection or hand over the host, they drop out.',
  'games.kart.bot.remove': 'Remove',
  'games.kart.bot.removeNamed': 'Remove {name}',
  'games.kart.bot.name.pepper': 'Pepper',
  'games.kart.bot.name.mochi': 'Mochi',
  'games.kart.bot.name.typhoon': 'Typhoon',
  'games.kart.bot.name.boba': 'Boba',
  'games.kart.bot.name.scooter': 'Scooter',
  'games.kart.bot.name.sunset': 'Sunset',
  'games.kart.bot.name.ferry': 'Ferry',
  'games.kart.bot.name.kite': 'Kite',
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
  'games.kart.bot.tag': '{name}（電腦）',
  'games.kart.bot.title': '電腦車',
  'games.kart.bot.level': '難度',
  'games.kart.bot.level.easy': '簡單',
  'games.kart.bot.level.normal': '普通',
  'games.kart.bot.level.hard': '困難',
  'games.kart.bot.add': '加一台電腦車',
  'games.kart.bot.full': '座位都滿了。',
  'games.kart.bot.note':
    '電腦車坐空的座位。比賽時由你的瀏覽器替它們開，請讓這個分頁開著、放在前面。你斷線或把房主交給別人，電腦車就退賽。',
  'games.kart.bot.remove': '移除',
  'games.kart.bot.removeNamed': '移除{name}',
  'games.kart.bot.name.pepper': '胡椒',
  'games.kart.bot.name.mochi': '麻糬',
  'games.kart.bot.name.typhoon': '颱風',
  'games.kart.bot.name.boba': '珍奶',
  'games.kart.bot.name.scooter': '小綿羊',
  'games.kart.bot.name.sunset': '夕陽',
  'games.kart.bot.name.ferry': '渡輪',
  'games.kart.bot.name.kite': '風箏',
}

export const kartMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
