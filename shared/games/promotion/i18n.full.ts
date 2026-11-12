// The full edition's words (C6, C7): the end of a game and each seat's line, and everything the full
// board's screen says. They load with that screen (src/games/promotion/full/), never with the site or
// the simple edition's screen; the names of cells and departments come from boardFull.ts, which only
// that screen loads. The option's labels are in i18n.ts, as the waiting room shows them. check-i18n
// and `npm run play` find this file through shared/games/screenMessages.ts. `en` is the source; the
// type makes zh-TW keep the same keys.

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

  'games.promotion.full.glyph.de': '德',
  'games.promotion.full.glyph.cai': '才',
  'games.promotion.full.glyph.gong': '功',
  'games.promotion.full.glyph.liang': '良',
  'games.promotion.full.glyph.rou': '柔',
  'games.promotion.full.glyph.zang': '贓',
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
  'games.promotion.full.settle.before': 'Before',
  'games.promotion.full.settle.grade': 'Grade',
  'games.promotion.full.settle.duipin': 'Ranks compared',
  'games.promotion.full.settle.share': 'Pot shared',
  'games.promotion.full.settle.after': 'Final',
  'games.promotion.full.settle.player': 'Player',
  'games.promotion.full.settle.explain':
    'Every two players compare grades: the lower pays the higher 5 silver a grade. Then the pot is split evenly.',
  'games.promotion.full.settle.remainder': '{name}, the poorest, takes the odd {amount} silver.',
  'games.promotion.full.settle.next': 'Next step',
  'games.promotion.full.settle.close': 'Close',

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
  'games.promotion.full.detail.reward': 'On landing: the pot pays {amount} silver',
  'games.promotion.full.detail.fee': 'On landing: pay the pot {amount} silver',
  'games.promotion.full.detail.retire': 'Retire here: everyone still in office pays {amount} silver',
  'games.promotion.full.detail.keepRank': 'Keeps the rank held before for the final comparison',
  'games.promotion.full.detail.out': 'Out of the game: compared at nothing',
  'games.promotion.full.detail.degree': 'Gives the degree: {degree}',
  'games.promotion.full.detail.wu': 'Makes a military jinshi',
  'games.promotion.full.detail.fengjue': 'Four of a kind: {cell}',
  'games.promotion.full.detail.banner': 'Banner household, {face}: {cell}',
  'games.promotion.full.detail.here': 'Here: {names}',
  'games.promotion.full.detail.note':
    'Real Qing offices arranged for this game after the traditional one; the moves and silver are reconstructions.',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.promotion.full.result.oneLeft': '第 {rounds} 回合只剩一人在任：對品、分注後結算。',
  'games.promotion.full.result.turnLimit': '{rounds} 回合已到：照目前的官階對品、分注後結算。',
  'games.promotion.full.note.dahe': '擲了 {rolls} 次，大賀榮歸，銀 {money} 兩。',
  'games.promotion.full.note.retired': '擲了 {rolls} 次，致仕歸鄉，銀 {money} 兩。',
  'games.promotion.full.note.out': '擲了 {rolls} 次，發往邊疆長戍，銀 {money} 兩。',
  'games.promotion.full.note.active': '擲了 {rolls} 次，仍在任上，銀 {money} 兩。',

  'games.promotion.full.ui.roll': '擲骰',
  'games.promotion.full.ui.fullscreen': '全螢幕',
  'games.promotion.full.ui.exitFullscreen': '離開全螢幕',
  'games.promotion.full.ui.sidewaysTip': '字太小？轉橫再按全螢幕，或放大。',
  'games.promotion.full.ui.zoomIn': '放大',
  'games.promotion.full.ui.zoomOut': '縮小',
  'games.promotion.full.ui.zoomFit': '還原',
  'games.promotion.full.ui.soundOn': '音效開',
  'games.promotion.full.ui.soundOff': '音效關',
  'games.promotion.full.ui.seats': '玩家：點一位看他的官職',
  'games.promotion.full.ui.knob': '頂戴（示意）：{knob}',
  'games.promotion.full.ui.hat': '浮水印（示意）：這個階段的帽子',
  'games.promotion.full.knob.ruby': '紅寶石',
  'games.promotion.full.knob.coral': '珊瑚',
  'games.promotion.full.knob.sapphire': '藍寶石',
  'games.promotion.full.knob.lapis': '青金石',
  'games.promotion.full.knob.crystal': '水晶',
  'games.promotion.full.knob.shell': '硨磲',
  'games.promotion.full.knob.gold': '素金',
  'games.promotion.full.knob.engravedGold': '鏤花金',
  'games.promotion.full.boardLabel': '陞官圖完整版圖版，{depts} 個部門共 {count} 格',
  'games.promotion.full.silver': '{amount} 兩',
  'games.promotion.full.bank': '公注',
  'games.promotion.full.round': '第 {round} 回合，上限 {limit}',
  'games.promotion.full.ledger': '帳簿',
  'games.promotion.full.ledgerTitle': '上一回合的銀兩',
  'games.promotion.full.ledgerEmpty': '上一回合沒有銀兩往來。',
  'games.promotion.full.seatInfo': '{office}・{degree}・{origin}出身，{household}・銀 {money} 兩',
  'games.promotion.full.notBorn': '還沒擲出身：第一擲決定',

  'games.promotion.full.glyph.de': '德',
  'games.promotion.full.glyph.cai': '才',
  'games.promotion.full.glyph.gong': '功',
  'games.promotion.full.glyph.liang': '良',
  'games.promotion.full.glyph.rou': '柔',
  'games.promotion.full.glyph.zang': '贓',
  'games.promotion.full.face.de': '德',
  'games.promotion.full.face.cai': '才',
  'games.promotion.full.face.gong': '功',
  'games.promotion.full.face.liang': '良',
  'games.promotion.full.face.rou': '柔',
  'games.promotion.full.face.zang': '贓',

  'games.promotion.full.combo.pair': '{face}一對：走一步',
  'games.promotion.full.combo.three': '三個{face}：走兩步',
  'games.promotion.full.combo.pairs': '素二對：先{face}後{second}',
  'games.promotion.full.combo.redPairs': '紅二對：走兩步德',
  'games.promotion.full.combo.run': '穿花：走一步德，公注賞 10 兩',
  'games.promotion.full.combo.four': '四同：封爵，或走三步德',
  'games.promotion.full.combo.allGraft': '全贓：革職',
  'games.promotion.full.combo.cancel': '德壓贓：作廢，再擲',
  'games.promotion.full.combo.none': '不成組合：再擲',
  'games.promotion.full.combo.birth': '擲出身',
  'games.promotion.full.combo.stuck': '三擲都不成組合：留在原地',

  'games.promotion.full.rolling': '{name} 擲骰中…',
  'games.promotion.full.yourTurn': '輪到你',
  'games.promotion.full.yourBirth': '輪到你：擲出身',
  'games.promotion.full.turnOf': '輪到 {name}',
  'games.promotion.full.gameOver': '遊戲結束',
  'games.promotion.full.born': '{name} 出身{origin}，{household}',
  'games.promotion.full.moved': '{name}：{from} → {to}',
  'games.promotion.full.movedVia': '{name}：{from} → {via} → {to}',
  'games.promotion.full.stayed': '{name} 留在{from}',
  'games.promotion.full.degreeEarned': '{name} 取得功名：{degree}',
  'games.promotion.full.mostSilver': '{names} 銀兩最多',

  'games.promotion.full.why.courtesy': '參見',
  'games.promotion.full.why.reward': '賞銀或兼差',
  'games.promotion.full.why.fee': '捐納或罰銀',
  'games.promotion.full.why.congrats': '賀儀',
  'games.promotion.full.why.run': '穿花賞銀',
  'games.promotion.full.why.rank': '對品',
  'games.promotion.full.why.share': '分注',
  'games.promotion.full.transfer': '{from} → {to}：{amount} 兩，{why}',

  'games.promotion.full.status.active': '在任',
  'games.promotion.full.status.retired': '退休',
  'games.promotion.full.status.out': '長戍',
  'games.promotion.full.degree.0': '沒有功名',
  'games.promotion.full.degree.1': '正途',
  'games.promotion.full.degree.2': '舉人',
  'games.promotion.full.degree.3': '進士',
  'games.promotion.full.degreeShort.1': '貢',
  'games.promotion.full.degreeShort.2': '舉',
  'games.promotion.full.degreeShort.3': '進',
  'games.promotion.full.wu': '武進士',
  'games.promotion.full.banner': '旗籍',
  'games.promotion.full.civilian': '民籍',
  'games.promotion.full.bannerShort': '旗',
  'games.promotion.full.civilianShort': '民',

  'games.promotion.full.settlement': '結算',
  'games.promotion.full.settle.before': '結算前',
  'games.promotion.full.settle.grade': '級數',
  'games.promotion.full.settle.duipin': '對品',
  'games.promotion.full.settle.share': '分注',
  'games.promotion.full.settle.after': '最後',
  'games.promotion.full.settle.player': '玩家',
  'games.promotion.full.settle.explain': '每兩個人比級數，每差一級，低的付高的 5 兩；之後公注平分給所有人。',
  'games.promotion.full.settle.remainder': '{name} 最窮，拿走除不盡的 {amount} 兩。',
  'games.promotion.full.settle.next': '下一步',
  'games.promotion.full.settle.close': '關閉',

  'games.promotion.full.req.zhengtu': '要正途（貢生以上的功名）',
  'games.promotion.full.req.juren': '要舉人',
  'games.promotion.full.req.jinshi': '要進士',
  'games.promotion.full.req.banner': '限旗籍',
  'games.promotion.full.req.guard': '要旗籍或武進士',
  'games.promotion.full.req.instead': '不夠就落到：{cell}',
  'games.promotion.full.tag.congrats': '賀{amount}',
  'games.promotion.full.tag.zhengtu': '正',
  'games.promotion.full.tag.juren': '舉',
  'games.promotion.full.tag.jinshi': '進',
  'games.promotion.full.tag.banner': '旗',
  'games.promotion.full.tag.guard': '侍',
  'games.promotion.full.detail.reward': '落在這裡：公注付 {amount} 兩',
  'games.promotion.full.detail.fee': '落在這裡：付公注 {amount} 兩',
  'games.promotion.full.detail.retire': '在這裡退休：每個還在任的人付 {amount} 兩賀儀',
  'games.promotion.full.detail.keepRank': '結算時保留原來的品級',
  'games.promotion.full.detail.out': '出局：結算時級數算 0',
  'games.promotion.full.detail.degree': '取得功名：{degree}',
  'games.promotion.full.detail.wu': '成為武進士',
  'games.promotion.full.detail.fengjue': '四同：到{cell}',
  'games.promotion.full.detail.banner': '旗籍擲到{face}：到{cell}',
  'games.promotion.full.detail.here': '在這裡：{names}',
  'games.promotion.full.detail.note': '依清代真實官制、照傳統玩法自行整理；去向與銀兩是重建的。',
}

const GRADES = '九八七六五四三二一'
const ORDINAL = ['', 'st', 'nd', 'rd']
const PEERS_EN = ['Baron', 'Viscount', 'Earl', 'Marquis', 'Duke']
const PEERS_ZH = '男子伯侯公'
const BELOW_EN = ['Commoner', 'Candidate', 'Licentiate', 'Tribute student', 'Juren', 'Jinshi', 'Unclassed']
const BELOW_ZH = ['白身', '童生', '生員', '貢生', '舉人', '進士', '未入流']
const SEAL_EN = ['None', 'Cand', 'Lic', 'Trib', 'Juren', 'Jinshi', 'Uncl']

/**
 * The full board's ranks, 0 to 30 (boardFull.ts): their names for the details, and the short text of
 * the red seal in a cell's corner
 */
function ranks(locale: 'en' | 'zh-TW'): Record<string, string> {
  const zh = locale === 'zh-TW'
  const entries: [string, string][] = []
  for (let rank = 0; rank <= 30; rank++) {
    let name: string
    let seal: string
    if (rank <= 6) {
      name = zh ? BELOW_ZH[rank] : BELOW_EN[rank]
      seal = zh ? BELOW_ZH[rank] : SEAL_EN[rank]
    } else if (rank <= 24) {
      const grade = 9 - Math.floor((rank - 7) / 2)
      const senior = rank % 2 === 0
      const zhName = `${senior ? '正' : '從'}${GRADES[9 - grade]}品`
      name = zh ? zhName : `${senior ? 'Senior' : 'Junior'} ${grade}${ORDINAL[grade] ?? 'th'} grade`
      seal = zh ? zhName : `${senior ? 'Sr' : 'Jr'} ${grade}`
    } else if (rank <= 29) {
      name = zh ? `${PEERS_ZH[rank - 25]}爵` : PEERS_EN[rank - 25]
      seal = name
    } else {
      name = zh ? '大賀' : 'Grand congratulations'
      seal = zh ? '大賀' : 'Top'
    }
    entries.push([`games.promotion.full.rank.${rank}`, name], [`games.promotion.full.seal.${rank}`, seal])
  }
  return Object.fromEntries(entries)
}

/**
 * Each department's plaque. Chinese stands its own name upright (boardFull.ts has the same); English
 * has a short label turned on its side, the full name being in the details
 */
const PLAQUES = {
  origin: ['Origins', '出身'],
  exam: ['Exams', '科舉'],
  wuke: ['Mil. Exams', '武科'],
  ying: ['Green Std', '綠營弁目'],
  zhen: ['Generals', '綠營將領'],
  shiwei: ['Guard', '侍衛處'],
  qiying: ['Banners', '八旗佐領'],
  qitong: ['Banner Cmd', '八旗都統'],
  xian: ['County', '縣'],
  zhou: ['Dept.', '州'],
  fu: ['Prefecture', '府'],
  jiaozhi: ['Education', '學官'],
  dao: ['Circuits', '道'],
  sansi: ['Province', '藩臬'],
  dufu: ['Governors', '督撫'],
  guozijian: ['Directorate', '國子監'],
  hanlin: ['Hanlin', '翰林院'],
  zhanshifu: ['Household', '詹事府'],
  neige: ['Secretariat', '內閣'],
  junji: ['Council', '軍機處'],
  personnel: ['Personnel', '吏部'],
  revenue: ['Revenue', '戶部'],
  rites: ['Rites', '禮部'],
  war: ['War', '兵部'],
  justice: ['Justice', '刑部'],
  works: ['Works', '工部'],
  duchayuan: ['Censorate', '都察院'],
  dalisi: ['Revision', '大理寺'],
  taichangsi: ['Sacrifices', '太常寺'],
  guanglusi: ['Banquets', '光祿寺'],
  taipusi: ['Stud', '太僕寺'],
  honglusi: ['Ceremonial', '鴻臚寺'],
  tongzhengsi: ['Transmission', '通政司'],
  daxueshi: ['Grand Secs', '殿閣'],
  gongxian: ['Titles', '宮銜'],
  jue: ['Peerage', '封爵'],
  end: ['Endings', '歸宿'],
} as const

const plaques = (at: 0 | 1) =>
  Object.fromEntries(
    Object.entries(PLAQUES).map(([id, names]) => [`games.promotion.full.plaque.${id}`, names[at]]),
  )

export const promotionFullMessages = {
  en: { ...en, ...ranks('en'), ...plaques(0) } as Record<string, string>,
  'zh-TW': { ...zhTW, ...ranks('zh-TW'), ...plaques(1) } as Record<string, string>,
}
