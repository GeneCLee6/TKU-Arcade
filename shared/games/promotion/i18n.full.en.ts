// The full edition's words in English, the source: the end of a game and each seat's line, and
// everything the full board's screen says. Loaded with that screen, and only in the language the
// page shows (src/games/promotion/full/fullStrings.ts); the names of cells and departments come from
// boardFull.ts, which only that screen loads. The option's labels are in i18n.ts, as the waiting room
// shows them. check-i18n and `npm run play` find both languages through i18n.full.ts and
// shared/games/screenMessages.ts.
const en = {
  'games.promotion.full.result.oneLeft':
    'After {rounds} rounds one official is left in office: ranks are compared and the pot is shared.',
  'games.promotion.full.result.turnLimit':
    'The {rounds} rounds are up: ranks are compared as they stand and the pot is shared.',
  'games.promotion.full.note.dahe': 'Retired to grand congratulations after {rolls} rolls, {money} silver.',
  'games.promotion.full.note.retired': 'Retired after {rolls} rolls, {money} silver.',
  'games.promotion.full.note.out': 'Exiled to the frontier after {rolls} rolls, {money} silver.',
  'games.promotion.full.note.active': 'Still in office after {rolls} rolls, {money} silver.',

  'games.promotion.full.ui.roll': 'Roll',
  'games.promotion.full.ui.fullscreen': 'Full screen',
  'games.promotion.full.ui.exitFullscreen': 'Exit full screen',
  'games.promotion.full.ui.sidewaysTip': 'Small names? Turn sideways, then Full screen, or zoom in.',
  'games.promotion.full.ui.zoomIn': 'Zoom in',
  'games.promotion.full.ui.zoomOut': 'Zoom out',
  'games.promotion.full.ui.zoomFit': 'Fit',
  'games.promotion.full.ui.soundOn': 'Sound on',
  'games.promotion.full.ui.soundOff': 'Sound off',
  'games.promotion.full.ui.seats': 'Players: pick one to see their office',
  'games.promotion.full.ui.knob': 'Hat button (illustrative): {knob}',
  'games.promotion.full.ui.hat': 'Watermark (illustrative): the hat of this stage of a career',
  'games.promotion.full.knob.ruby': 'ruby',
  'games.promotion.full.knob.coral': 'coral',
  'games.promotion.full.knob.sapphire': 'sapphire',
  'games.promotion.full.knob.lapis': 'lapis lazuli',
  'games.promotion.full.knob.crystal': 'crystal',
  'games.promotion.full.knob.shell': 'white shell',
  'games.promotion.full.knob.gold': 'plain gold',
  'games.promotion.full.knob.engravedGold': 'engraved gold',
  'games.promotion.full.boardLabel': 'Full promotion board of {count} offices in {depts} departments',
  'games.promotion.full.silver': '{amount} silver',
  'games.promotion.full.bank': 'Pot',
  'games.promotion.full.round': 'Round {round} of {limit}',
  'games.promotion.full.ledger': 'Ledger',
  'games.promotion.full.ledgerTitle': 'Silver in the last turn',
  'games.promotion.full.ledgerEmpty': 'No silver changed hands in the last turn.',
  'games.promotion.full.seatInfo': '{office} · {degree} · born {origin}, {household} · {money} silver',
  'games.promotion.full.notBorn': 'Not yet born: the first roll decides',

  'games.promotion.full.face.de': 'Virtue',
  'games.promotion.full.face.cai': 'Talent',
  'games.promotion.full.face.gong': 'Merit',
  'games.promotion.full.face.liang': 'Good conduct',
  'games.promotion.full.face.rou': 'Mediocrity',
  'games.promotion.full.face.zang': 'Graft',

  'games.promotion.full.combo.pair': 'A pair of {face}: one move',
  'games.promotion.full.combo.three': 'Three {face}: two moves',
  'games.promotion.full.combo.pairs': 'Plain two pairs: {face}, then {second}',
  'games.promotion.full.combo.redPairs': 'Red two pairs: two Virtue moves',
  'games.promotion.full.combo.run': 'Straight: one Virtue move, 10 from the pot',
  'games.promotion.full.combo.four': 'Four of a kind: ennobled, or three Virtue moves',
  'games.promotion.full.combo.allGraft': 'Four Graft: dismissed',
  'games.promotion.full.combo.cancel': 'Virtue over Graft: void, throw again',
  'games.promotion.full.combo.none': 'No combination: throw again',
  'games.promotion.full.combo.birth': 'Birth roll',
  'games.promotion.full.combo.stuck': 'Three throws, no combination: stays put',

  'games.promotion.full.rolling': '{name} throws…',
  'games.promotion.full.yourTurn': 'Your turn',
  'games.promotion.full.yourBirth': 'Your turn: roll for your birth',
  'games.promotion.full.turnOf': "{name}'s turn",
  'games.promotion.full.gameOver': 'Game over',
  'games.promotion.full.born': '{name} is born {origin}, {household}',
  'games.promotion.full.moved': '{name}: {from} → {to}',
  'games.promotion.full.movedVia': '{name}: {from} → {via} → {to}',
  'games.promotion.full.stayed': '{name} stays at {from}',
  'games.promotion.full.degreeEarned': '{name} earns the degree: {degree}',
  'games.promotion.full.mostSilver': '{names} ended with the most silver',

  'games.promotion.full.why.courtesy': 'courtesy call',
  'games.promotion.full.why.reward': 'reward or side post',
  'games.promotion.full.why.fee': 'purchase or fine',
  'games.promotion.full.why.congrats': 'retirement gift',
  'games.promotion.full.why.run': 'straight reward',
  'games.promotion.full.why.rank': 'rank comparison',
  'games.promotion.full.why.share': 'share of the pot',
  'games.promotion.full.transfer': '{from} → {to}: {amount} silver, {why}',

  'games.promotion.full.status.active': 'In office',
  'games.promotion.full.status.retired': 'Retired',
  'games.promotion.full.status.out': 'Exiled',
  'games.promotion.full.degree.0': 'no degree',
  'games.promotion.full.degree.1': 'regular route',
  'games.promotion.full.degree.2': 'juren',
  'games.promotion.full.degree.3': 'jinshi',
  'games.promotion.full.degreeShort.1': 'Reg',
  'games.promotion.full.degreeShort.2': 'Ju',
  'games.promotion.full.degreeShort.3': 'Jin',
  'games.promotion.full.wu': 'military jinshi',
  'games.promotion.full.banner': 'Banner household',
  'games.promotion.full.civilian': 'Civilian household',
  'games.promotion.full.bannerShort': 'Banner',
  'games.promotion.full.civilianShort': 'Civilian',

  'games.promotion.full.settlement': 'Settlement',

  'games.promotion.full.req.zhengtu': 'Needs the regular route (a tribute degree or better)',
  'games.promotion.full.req.juren': 'Needs the juren degree',
  'games.promotion.full.req.jinshi': 'Needs the jinshi degree',
  'games.promotion.full.req.banner': 'Banner households only',
  'games.promotion.full.req.guard': 'Banner household or military jinshi',
  'games.promotion.full.req.instead': 'Otherwise: {cell}',
  'games.promotion.full.tag.congrats': '+{amount} each',
  'games.promotion.full.tag.zhengtu': 'Reg',
  'games.promotion.full.tag.juren': 'Ju',
  'games.promotion.full.tag.jinshi': 'Jin',
  'games.promotion.full.tag.banner': 'Bnr',
  'games.promotion.full.tag.guard': 'Grd',
  // C8: the players' choices, events, restoration, and the money changes
  'games.promotion.full.result.dahe':
    'Grand congratulations after {rounds} rounds ends the game: ranks are compared and the pot is shared.',
  'games.promotion.full.loading': 'Drawing the board…',
  'games.promotion.full.yourChoice': 'Your choice: answer on the board',
  'games.promotion.full.deciding': '{name} is deciding…',
  'games.promotion.full.promptLabel': 'A decision',
  'games.promotion.full.countdown': 'Time left to decide',
  'games.promotion.full.offer.title': 'Accept the post of {cell}?',
  'games.promotion.full.offer.explain':
    'Accept: move to {cell}; {route}. Decline: stay at {from} and roll as usual next turn.',
  'games.promotion.full.offer.accept': 'Accept',
  'games.promotion.full.offer.decline': 'Decline',
  'games.promotion.full.route.tenglu':
    'after service there, commendation (議敘) leads into a low regular post',
  'games.promotion.full.route.jiaoxi': 'teaching there leads to a county magistracy or an instructor post',
  'games.promotion.full.route.zhaoshi': 'the special examination leads to a drafter’s post at court',
  'games.promotion.full.buy.title': 'Buy an office instead of {cell}?',
  'games.promotion.full.buy.explain':
    'The dice make you {cell}, a minor technical post. You may pay the pot 5 silver a rank step above it for a regular office instead; a bought office is the irregular route, which some posts refuse. You have {money} silver.',
  'games.promotion.full.buy.price': '{price} silver',
  'games.promotion.full.buy.separator': ' · ',
  'games.promotion.full.buy.skip': 'Take {cell}',
  'games.promotion.full.default.offer': 'If time runs out: decline',
  'games.promotion.full.default.buy': 'If time runs out: take the post',
  'games.promotion.full.watching.offer': '{name} is deciding whether to accept {cell}',
  'games.promotion.full.watching.buy': '{name} is deciding whether to buy an office instead of {cell}',
  'games.promotion.full.decided.accept': '{name} accepts the post of {cell}',
  'games.promotion.full.decided.decline': '{name} declines {cell} and stays at {from}',
  'games.promotion.full.decided.skip': '{name} takes the post of {cell}',
  'games.promotion.full.decided.buy': '{name} buys {cell} for {price} silver',
  'games.promotion.full.decided.timedOut': '{sentence} (time ran out)',
  'games.promotion.full.waits': '{name} waits at {cell}',
  'games.promotion.full.combo.noMove': 'No combination: no move, next player',
  'games.promotion.full.combo.cancelStay': 'Virtue over Graft: void, no move, next player',
  'games.promotion.full.combo.event': '{zone}: {face}, {outcome}',
  'games.promotion.full.combo.eventWait': '{zone}: no combination, waits for the next turn',
  'games.promotion.full.combo.eventAgain': '{zone}: no combination, throw again',
  'games.promotion.full.go.up2': 'up two steps',
  'games.promotion.full.go.up1': 'up a step',
  'games.promotion.full.go.stay': 'back to the post',
  'games.promotion.full.go.down': 'down',
  'games.promotion.full.go.dismiss': 'dismissed',
  'games.promotion.full.go.money': '{amount} silver from the pot',
  'games.promotion.full.go.title': 'an honorary title',
  'games.promotion.full.restore.de': 'restored to the post',
  'games.promotion.full.restore.cai': 'restored a grade lower',
  'games.promotion.full.restore.exile': 'exiled to the frontier',
  'games.promotion.full.restore.wait': 'still under review',
  'games.promotion.full.why.fine': 'commission fine',
  'games.promotion.full.why.buy': 'office bought',
  'games.promotion.full.tag.offer': 'Off',
  'games.promotion.full.tag.minor': 'Buy',
  'games.promotion.full.tag.event': 'Evt',
  'games.promotion.full.titlesShort': '{count} title(s)',
  'games.promotion.full.boughtShort': 'Bought',
  'games.promotion.full.gradeTitle': 'Grade {grade} in the final comparison: {name}',
}

/** The dice's six results, Chinese in both languages: it is the board's own look */
const GLYPHS = {
  'games.promotion.full.glyph.de': '德',
  'games.promotion.full.glyph.cai': '才',
  'games.promotion.full.glyph.gong': '功',
  'games.promotion.full.glyph.liang': '良',
  'games.promotion.full.glyph.rou': '柔',
  'games.promotion.full.glyph.zang': '贓',
}

const ORDINAL = ['', 'st', 'nd', 'rd']
const PEERS = ['Baron', 'Viscount', 'Earl', 'Marquis', 'Duke']
const BELOW = ['Commoner', 'Candidate', 'Licentiate', 'Tribute student', 'Juren', 'Jinshi', 'Unclassed']
const BELOW_SEALS = ['None', 'Cand', 'Lic', 'Trib', 'Juren', 'Jinshi', 'Uncl']

/**
 * The full board's ranks, 0 to 30 (boardFull.ts): their names for the details, and the short text of
 * the red seal in a cell's corner. i18n.full.zh-TW.ts counts them the same way
 */
function ranks(): Record<string, string> {
  const entries: [string, string][] = []
  for (let rank = 0; rank <= 30; rank++) {
    let name: string
    let seal: string
    if (rank <= 6) {
      name = BELOW[rank]
      seal = BELOW_SEALS[rank]
    } else if (rank <= 24) {
      const grade = 9 - Math.floor((rank - 7) / 2)
      const senior = rank % 2 === 0
      name = `${senior ? 'Senior' : 'Junior'} ${grade}${ORDINAL[grade] ?? 'th'} grade`
      seal = `${senior ? 'Sr' : 'Jr'} ${grade}`
    } else if (rank <= 29) {
      name = PEERS[rank - 25]
      seal = name
    } else {
      name = 'Grand congratulations'
      seal = 'Top'
    }
    entries.push([`games.promotion.full.rank.${rank}`, name], [`games.promotion.full.seal.${rank}`, seal])
  }
  return Object.fromEntries(entries)
}

/**
 * Each department's plaque: a short label turned on its side, the full name being in the details.
 * Chinese stands its own name upright (i18n.full.zh-TW.ts; boardFull.ts has the same)
 */
export const PLAQUES = {
  origin: 'Origins',
  exam: 'Exams',
  wuke: 'Mil. Exams',
  ying: 'Green Std',
  zhen: 'Generals',
  shiwei: 'Guard',
  qiying: 'Banners',
  qitong: 'Banner Cmd',
  xian: 'County',
  zhou: 'Dept.',
  fu: 'Prefecture',
  jiaozhi: 'Education',
  dao: 'Circuits',
  sansi: 'Province',
  dufu: 'Governors',
  guozijian: 'Directorate',
  hanlin: 'Hanlin',
  zhanshifu: 'Household',
  neige: 'Secretariat',
  junji: 'Council',
  personnel: 'Personnel',
  revenue: 'Revenue',
  rites: 'Rites',
  war: 'War',
  justice: 'Justice',
  works: 'Works',
  duchayuan: 'Censorate',
  dalisi: 'Revision',
  taichangsi: 'Sacrifices',
  guanglusi: 'Banquets',
  taipusi: 'Stud',
  honglusi: 'Ceremonial',
  tongzhengsi: 'Transmission',
  daxueshi: 'Grand Secs',
  gongxian: 'Titles',
  jue: 'Peerage',
  end: 'Endings',
  // C8
  zongrenfu: 'Clan Court',
  neiwufu: 'Household',
  neiting: 'Inner Court',
  zhongshuke: 'Drafting',
  qintianjian: 'Astronomy',
  taiyiyuan: 'Medicine',
  luanyiwei: 'Equipage',
  wucheng: 'Wards',
  cangchang: 'Granaries',
  xueyuan: 'Examiners',
  yanyuan: 'Salt',
  heyuan: 'Rivers',
  caoyuan: 'Grain',
  tenglu: 'Copyists',
  kaoji: 'Events',
  juanna: 'Bought',
  ladder: 'Grades',
} as const

/** The grades of the final comparison (品級考, boardFull.ts `gradeOf`), for the ladder on the board */
const GRADES = ['None', 'Degree', 'Unclassed', '9th', '8th', '7th', '6th', '5th', '4th', '3rd', '2nd', '1st', 'Peer', 'Top']

export type FullMessageKey = keyof typeof en

export const promotionFullEn: Record<string, string> = {
  ...en,
  ...ranks(),
  ...Object.fromEntries(Object.entries(PLAQUES).map(([id, name]) => [`games.promotion.full.plaque.${id}`, name])),
  ...Object.fromEntries(GRADES.map((name, grade) => [`games.promotion.full.grade.${grade}`, name])),
  ...GLYPHS,
}
