// The full edition's words in Traditional Chinese: the same keys as i18n.full.en.ts, which the type
// keeps. Loaded with the full board's screen when the page is in Chinese
// (src/games/promotion/full/fullStrings.ts).
import type { FullMessageKey, PLAQUES as PLAQUES_EN } from './i18n.full.en.ts'

const zhTW: Record<FullMessageKey, string> = {
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

/** The dice's six results, as in English */
const GLYPHS = {
  'games.promotion.full.glyph.de': '德',
  'games.promotion.full.glyph.cai': '才',
  'games.promotion.full.glyph.gong': '功',
  'games.promotion.full.glyph.liang': '良',
  'games.promotion.full.glyph.rou': '柔',
  'games.promotion.full.glyph.zang': '贓',
}

const GRADE_NUMBERS = '九八七六五四三二一'
const PEERS = '男子伯侯公'
const BELOW = ['白身', '童生', '生員', '貢生', '舉人', '進士', '未入流']

/** The full board's ranks, 0 to 30, counted as in i18n.full.en.ts; a seal says the same as the name */
function ranks(): Record<string, string> {
  const entries: [string, string][] = []
  for (let rank = 0; rank <= 30; rank++) {
    let name: string
    if (rank <= 6) {
      name = BELOW[rank]
    } else if (rank <= 24) {
      const grade = 9 - Math.floor((rank - 7) / 2)
      name = `${rank % 2 === 0 ? '正' : '從'}${GRADE_NUMBERS[9 - grade]}品`
    } else if (rank <= 29) {
      name = `${PEERS[rank - 25]}爵`
    } else {
      name = '大賀'
    }
    entries.push([`games.promotion.full.rank.${rank}`, name], [`games.promotion.full.seal.${rank}`, name])
  }
  return Object.fromEntries(entries)
}

/** Each department's plaque, its own name upright (boardFull.ts has the same) */
const PLAQUES: Record<keyof typeof PLAQUES_EN, string> = {
  origin: '出身',
  exam: '科舉',
  wuke: '武科',
  ying: '綠營弁目',
  zhen: '綠營將領',
  shiwei: '侍衛處',
  qiying: '八旗佐領',
  qitong: '八旗都統',
  xian: '縣',
  zhou: '州',
  fu: '府',
  jiaozhi: '學官',
  dao: '道',
  sansi: '藩臬',
  dufu: '督撫',
  guozijian: '國子監',
  hanlin: '翰林院',
  zhanshifu: '詹事府',
  neige: '內閣',
  junji: '軍機處',
  personnel: '吏部',
  revenue: '戶部',
  rites: '禮部',
  war: '兵部',
  justice: '刑部',
  works: '工部',
  duchayuan: '都察院',
  dalisi: '大理寺',
  taichangsi: '太常寺',
  guanglusi: '光祿寺',
  taipusi: '太僕寺',
  honglusi: '鴻臚寺',
  tongzhengsi: '通政司',
  daxueshi: '殿閣',
  gongxian: '宮銜',
  jue: '封爵',
  end: '歸宿',
  // C8
  zongrenfu: '宗人府',
  neiwufu: '內務府',
  neiting: '內廷',
  zhongshuke: '中書科',
  qintianjian: '欽天監',
  taiyiyuan: '太醫院',
  luanyiwei: '鑾儀衛',
  wucheng: '五城兵馬司',
  cangchang: '倉場',
  xueyuan: '學院',
  yanyuan: '鹽院',
  heyuan: '河院',
  caoyuan: '漕院',
  tenglu: '各館謄錄',
  kaoji: '考績',
  juanna: '捐納',
  ladder: '品級考',
}

/** The grades of the final comparison (品級考) */
const GRADES = ['白身', '功名', '未入流', '九品', '八品', '七品', '六品', '五品', '四品', '三品', '二品', '一品', '封爵', '大賀']

export const promotionFullZhTW: Record<string, string> = {
  ...zhTW,
  ...ranks(),
  ...Object.fromEntries(Object.entries(PLAQUES).map(([id, name]) => [`games.promotion.full.plaque.${id}`, name])),
  ...Object.fromEntries(GRADES.map((name, grade) => [`games.promotion.full.grade.${grade}`, name])),
  ...GLYPHS,
}
