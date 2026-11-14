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
  'games.promotion.full.result.dahe': '第 {rounds} 回合有人大賀，遊戲結束：對品、分注後結算。',
  'games.promotion.full.loading': '正在畫圖版…',
  'games.promotion.full.yourChoice': '輪到你決定：在圖版上回答',
  'games.promotion.full.deciding': '{name} 正在決定…',
  'games.promotion.full.promptLabel': '抉擇',
  'games.promotion.full.countdown': '剩下的決定時間',
  'games.promotion.full.offer.title': '接受{cell}這個職位嗎？',
  'games.promotion.full.offer.explain': '接受：到{cell}，{route}。不接受：留在{from}，下回合照常擲骰。',
  'games.promotion.full.offer.accept': '接受',
  'games.promotion.full.offer.decline': '不接受',
  'games.promotion.full.route.tenglu': '在館裡當差期滿，經議敘授一個低階正職',
  'games.promotion.full.route.jiaoxi': '教習期滿，可授知縣或教職',
  'games.promotion.full.route.zhaoshi': '召試之後，可授朝中的中書',
  'games.promotion.full.buy.title': '要捐官，不當{cell}嗎？',
  'games.promotion.full.buy.explain':
    '骰子讓你當{cell}，這是雜職。你可以改捐一個正職：比它高一級付公注 5 兩；捐來的官算異途，有些官職不收。你有 {money} 兩。',
  'games.promotion.full.buy.price': '{price} 兩',
  'games.promotion.full.buy.separator': '・',
  'games.promotion.full.buy.skip': '就當{cell}',
  'games.promotion.full.default.offer': '時間到就當作不接受',
  'games.promotion.full.default.buy': '時間到就當作不捐',
  'games.promotion.full.watching.offer': '{name} 正在決定要不要接受{cell}',
  'games.promotion.full.watching.buy': '{name} 正在決定要不要捐官、不當{cell}',
  'games.promotion.full.decided.accept': '{name} 接受{cell}',
  'games.promotion.full.decided.decline': '{name} 不接受{cell}，留在{from}',
  'games.promotion.full.decided.skip': '{name} 就當{cell}',
  'games.promotion.full.decided.buy': '{name} 花 {price} 兩捐了{cell}',
  'games.promotion.full.decided.timedOut': '{sentence}（時間到）',
  'games.promotion.full.waits': '{name} 在{cell}等候',
  'games.promotion.full.combo.noMove': '不成組合：留在原地，換下一位',
  'games.promotion.full.combo.cancelStay': '德壓贓：作廢，留在原地，換下一位',
  'games.promotion.full.combo.event': '{zone}：{face}，{outcome}',
  'games.promotion.full.combo.eventWait': '{zone}：不成組合，等下一回合',
  'games.promotion.full.combo.eventAgain': '{zone}：不成組合，再擲',
  'games.promotion.full.go.up2': '升兩步',
  'games.promotion.full.go.up1': '升一步',
  'games.promotion.full.go.stay': '回原職',
  'games.promotion.full.go.down': '降調',
  'games.promotion.full.go.dismiss': '革職',
  'games.promotion.full.go.money': '公注賞 {amount} 兩',
  'games.promotion.full.go.title': '加一個兼銜',
  'games.promotion.full.restore.de': '開復原職',
  'games.promotion.full.restore.cai': '降一級開復',
  'games.promotion.full.restore.exile': '發往邊疆長戍',
  'games.promotion.full.restore.wait': '仍在查辦',
  'games.promotion.full.why.fine': '差事罰銀',
  'games.promotion.full.why.buy': '捐官',
  'games.promotion.full.tag.offer': '授',
  'games.promotion.full.tag.minor': '捐',
  'games.promotion.full.tag.event': '考',
  'games.promotion.full.titlesShort': '銜{count}',
  'games.promotion.full.boughtShort': '捐',
  'games.promotion.full.gradeTitle': '對品第 {grade} 級：{name}',
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
  // C8
  zongrenfu: ['Clan Court', '宗人府'],
  neiwufu: ['Household', '內務府'],
  neiting: ['Inner Court', '內廷'],
  zhongshuke: ['Drafting', '中書科'],
  qintianjian: ['Astronomy', '欽天監'],
  taiyiyuan: ['Medicine', '太醫院'],
  luanyiwei: ['Equipage', '鑾儀衛'],
  wucheng: ['Wards', '五城兵馬司'],
  cangchang: ['Granaries', '倉場'],
  xueyuan: ['Examiners', '學院'],
  yanyuan: ['Salt', '鹽院'],
  heyuan: ['Rivers', '河院'],
  caoyuan: ['Grain', '漕院'],
  tenglu: ['Copyists', '各館謄錄'],
  kaoji: ['Events', '考績'],
  juanna: ['Bought', '捐納'],
  ladder: ['Grades', '品級考'],
} as const

/** The grades of the final comparison (品級考, boardFull.ts `gradeOf`), for the ladder on the board */
const GRADES_EN = ['None', 'Degree', 'Unclassed', '9th', '8th', '7th', '6th', '5th', '4th', '3rd', '2nd', '1st', 'Peer', 'Top']
const GRADES_ZH = ['白身', '功名', '未入流', '九品', '八品', '七品', '六品', '五品', '四品', '三品', '二品', '一品', '封爵', '大賀']
const grades = (names: readonly string[]) =>
  Object.fromEntries(names.map((name, grade) => [`games.promotion.full.grade.${grade}`, name]))

const plaques = (at: 0 | 1) =>
  Object.fromEntries(
    Object.entries(PLAQUES).map(([id, names]) => [`games.promotion.full.plaque.${id}`, names[at]]),
  )

export const promotionFullMessages = {
  en: { ...en, ...ranks('en'), ...plaques(0), ...grades(GRADES_EN) } as Record<string, string>,
  'zh-TW': { ...zhTW, ...ranks('zh-TW'), ...plaques(1), ...grades(GRADES_ZH) } as Record<string, string>,
}
