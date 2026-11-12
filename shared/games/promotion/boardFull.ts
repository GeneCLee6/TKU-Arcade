// The full edition's board (e3-t13, C8): pure data, walked by rulesFull.ts. Two boards: the first
// (C6) for games started before C8, the second (C8) for every game since; see `fullBoard` at the
// bottom. The browser loads this file only after a full edition's first screen, by a dynamic import
// in src/games/promotion/full/fullData.ts (tests/games/catalog.test.ts holds it to that).
//
// Our own compilation from public-domain history: real Qing titles and grades (mid to late Qing, one
// post per title), sorted into departments a player can find their way around. Which office leads
// where is a reconstruction of how the traditional game plays, not a chart of real careers, and not
// copied from any modern edition's board (docs/PRD/01-legal-ip-analysis.md §2.1).
//
// The six results of a roll, from best to worst: de (virtue, pip 4), cai (talent, 6), gong (merit,
// 5), liang (good conduct, 3), rou (mediocre, 2), zang (graft, 1). Every cell says where each one
// leads; how a roll of four dice becomes moves is in rulesFull.ts. The tests hold every cell to the
// rules written next to `FullCell`, and to more: every destination exists, every cell can be reached
// from every origin, no cell traps a player, money is conserved.
//
// Cell ids are stored in running games: rename or remove one and live rooms break, so add instead.
// Any change to a move also changes what an old replay (seed + actions) plays out to.

import { FULL_FACES, type FullFace } from './fullFaces.ts'

export { DISMISSED, FULL_FACES, FULL_START, FULL_TOP, PIP_FACE, type FullFace } from './fullFaces.ts'

/**
 * Seniority. 0 to 5 are people without a post (commoner, candidate, licentiate, tribute student,
 * graduate, palace candidate), 6 is a post below the nine grades, 7 to 24 are the eighteen grades
 * from junior ninth to senior first, 25 to 29 the five peerages, and 30 the grand congratulations at
 * the top of the board.
 */
const NONE = 0
const TONG = 1
const SHENG = 2
const GONG = 3
const JU = 4
const JIN = 5
const UNCLASSED = 6
const J9 = 7
const S9 = 8
const J8 = 9
const S8 = 10
const J7 = 11
const S7 = 12
const J6 = 13
const S6 = 14
const J5 = 15
const S5 = 16
const J4 = 17
const S4 = 18
const J3 = 19
const S3 = 20
const J2 = 21
const S2 = 22
const J1 = 23
const S1 = 24
const BARON = 25
const VISCOUNT = 26
const EARL = 27
const MARQUIS = 28
const DUKE = 29
const TOP = 30
export const FULL_MAX_RANK = TOP

/**
 * The step rank comparison (對品) counts in: a whole grade, senior and junior alike. 0 commoner,
 * 1 examination standing, 2 unclassed post, 3 to 11 the ninth grade to the first, 12 a peer, 13 the
 * top of the board.
 */
export function gradeOf(rank: number): number {
  if (rank <= NONE) return 0
  if (rank < UNCLASSED) return 1
  if (rank === UNCLASSED) return 2
  if (rank <= S1) return 3 + Math.floor((rank - J9) / 2)
  if (rank < TOP) return 12
  return 13
}

/**
 * What a cell is, which says which of the tests' rules it keeps:
 *
 * - `office`: a post. de, cai and gong never lead lower, de at least as high as cai and cai at least
 *   as high as gong; liang never leads lower; zang always leads strictly lower.
 * - `origin`, `exam`: before a post. de, cai and gong never lead lower; zang strictly lower, except
 *   on the very bottom.
 * - `palace`: the palace examination, which failed nobody: every result is a pass, zang the lowest.
 * - `appoint`: a first appointment: every result is a post.
 * - `penalty`: dismissal, from which a player buys their way back, starts over, or is exiled.
 * - `end`: a career is over (retired or exiled). Never rolled from.
 */
export type CellKind = 'origin' | 'exam' | 'palace' | 'appoint' | 'office' | 'penalty' | 'end' | 'event'

/**
 * Where an event's outcome sends a player, from the post they held when they came to it (C8): two
 * steps up (that post's de), one (its cai), back to it, down (its `demote`, else its zang), or
 * dismissed. `money` comes from the bank; `title` is a concurrent honorary title (兼銜).
 */
export type EventGo = 'up2' | 'up1' | 'stay' | 'down' | 'dismiss'
export type EventOutcome = { go: EventGo; money: number; title: boolean }

/**
 * What a player must hold to land on a cell; one who does not lands on its `instead`.
 * `zhengtu` is the regular route (a tribute student or better), `juren` and `jinshi` the two
 * examination degrees, `banner` a Banner household, `guard` a Banner household or a military jinshi.
 */
export type Requirement = 'zhengtu' | 'juren' | 'jinshi' | 'banner' | 'guard'

/**
 * The watermark a cell gets on the C7 screen, after src/games/promotion/rankArt.ts: the hat tells the
 * stage of a career. `peer` (a peerage), `gate` (retirement) and `exile` have no drawing yet: C7
 * draws them.
 */
export type FullArt =
  | 'cap'
  | 'scholar'
  | 'laureate'
  | 'official1'
  | 'official2'
  | 'official3'
  | 'court'
  | 'helmet1'
  | 'helmet2'
  | 'helmet3'
  | 'guard1'
  | 'guard2'
  | 'peer'
  | 'gate'
  | 'exile'

export type FullCell = {
  /** Stable forever: see the top of this file */
  id: string
  /** The title; English is a transliteration with a short gloss */
  name: { 'zh-TW': string; en: string }
  rank: number
  /** The office a cell belongs to (FULL_DEPARTMENTS): juniors pay seniors who share one */
  dept: FullDeptId
  kind: CellKind
  art: FullArt
  /** Where each result leads from here */
  moves: Record<FullFace, string>
  /** Where four of a kind leads; null: three de moves instead */
  fengjue: string | null
  requires: Requirement | null
  /** Where a player who lacks `requires` lands instead; null when nothing is required */
  instead: string | null
  /** The examination standing landing here gives: 1 regular route, 2 juren, 3 jinshi */
  degree: 0 | 1 | 2 | 3
  /** Landing here makes a military jinshi */
  wu: boolean
  /** On landing: positive, the bank pays (a reward or a side post); negative, the player pays the bank */
  money: number
  /** A retirement: what every player still in the game pays the one who lands here; null if not */
  retire: number | null
  /** Landing here puts a player out of the game */
  out: boolean
  /** Retiring here keeps the rank held before (rather than this cell's own) */
  keepRank: boolean
  /** Moves that differ for a Banner household */
  banner: Partial<Record<FullFace, string>> | null
  // ── C8, read by the second rules (rulesVersion 2) only ──
  /** An offered post (謄錄, 教習, a special summons): a player not already on one may decline */
  offer: boolean
  /** A minor technical post (天文生, 醫士): a player with standing may buy a regular office instead */
  minor: boolean
  /** A commission (差事): rolling graft while holding it costs this fine to the bank; 0 for none */
  fine: number
  /** An event zone (京察, 大計, ...): a second throw decides, by face, what happens to the post held */
  event: Readonly<Record<FullFace, EventOutcome>> | null
  /** Where an event's `down` leads from here, when zang leads to an event (處分); null: zang */
  demote: string | null
  /** Landing here gives a concurrent honorary title (兼銜) */
  title: boolean
}

type Extra = Partial<
  Pick<
    FullCell,
    | 'kind'
    | 'fengjue'
    | 'requires'
    | 'instead'
    | 'degree'
    | 'wu'
    | 'money'
    | 'retire'
    | 'out'
    | 'keepRank'
    | 'banner'
    | 'offer'
    | 'minor'
    | 'fine'
    | 'event'
    | 'demote'
    | 'title'
  >
>

function cell(
  id: string,
  zh: string,
  en: string,
  rank: number,
  dept: FullDeptId,
  art: FullArt,
  moves: string,
  extra: Extra = {},
): FullCell {
  const [de, cai, gong, liang, rou, zang] = moves.split(' ')
  return {
    id,
    name: { 'zh-TW': zh, en },
    rank,
    dept,
    kind: 'office',
    art,
    moves: { de, cai, gong, liang, rou, zang },
    fengjue: null,
    requires: null,
    instead: null,
    degree: 0,
    wu: false,
    money: 0,
    retire: null,
    out: false,
    keepRank: false,
    banner: null,
    offer: false,
    minor: false,
    fine: 0,
    event: null,
    demote: null,
    title: false,
    ...extra,
  }
}

/**
 * The departments, each in a section of the board (for the C7 screen). `courtesy`: whether a junior
 * landing where a senior already serves pays the senior (參見); not among commoners, candidates,
 * or those whose career is over.
 */
export const FULL_SECTIONS = ['start', 'military', 'provinces', 'capital', 'summit'] as const
export type FullSection = (typeof FULL_SECTIONS)[number]

const DEPTS = {
  origin: { 'zh-TW': '出身', en: 'Origins', section: 'start', courtesy: false },
  exam: { 'zh-TW': '科舉', en: 'Civil Examinations', section: 'start', courtesy: false },
  wuke: { 'zh-TW': '武科', en: 'Military Examinations', section: 'military', courtesy: false },
  ying: { 'zh-TW': '綠營弁目', en: 'Green Standard Ranks', section: 'military', courtesy: true },
  zhen: { 'zh-TW': '綠營將領', en: 'Green Standard Officers', section: 'military', courtesy: true },
  shiwei: { 'zh-TW': '侍衛處', en: 'Imperial Guard', section: 'military', courtesy: true },
  qiying: { 'zh-TW': '八旗佐領', en: 'Banner Companies', section: 'military', courtesy: true },
  qitong: { 'zh-TW': '八旗都統', en: 'Banner Command', section: 'military', courtesy: true },
  xian: { 'zh-TW': '縣', en: 'County', section: 'provinces', courtesy: true },
  zhou: { 'zh-TW': '州', en: 'Department', section: 'provinces', courtesy: true },
  fu: { 'zh-TW': '府', en: 'Prefecture', section: 'provinces', courtesy: true },
  jiaozhi: { 'zh-TW': '學官', en: 'Education Officials', section: 'provinces', courtesy: true },
  dao: { 'zh-TW': '道', en: 'Circuits', section: 'provinces', courtesy: true },
  sansi: { 'zh-TW': '藩臬', en: 'Provincial Commissioners', section: 'provinces', courtesy: true },
  dufu: { 'zh-TW': '督撫', en: 'Governors', section: 'provinces', courtesy: true },
  guozijian: { 'zh-TW': '國子監', en: 'Directorate of Education', section: 'capital', courtesy: true },
  hanlin: { 'zh-TW': '翰林院', en: 'Hanlin Academy', section: 'capital', courtesy: true },
  zhanshifu: { 'zh-TW': '詹事府', en: "Heir's Household", section: 'capital', courtesy: true },
  neige: { 'zh-TW': '內閣', en: 'Grand Secretariat', section: 'capital', courtesy: true },
  junji: { 'zh-TW': '軍機處', en: 'Grand Council', section: 'capital', courtesy: true },
  personnel: { 'zh-TW': '吏部', en: 'Ministry of Personnel', section: 'capital', courtesy: true },
  revenue: { 'zh-TW': '戶部', en: 'Ministry of Revenue', section: 'capital', courtesy: true },
  rites: { 'zh-TW': '禮部', en: 'Ministry of Rites', section: 'capital', courtesy: true },
  war: { 'zh-TW': '兵部', en: 'Ministry of War', section: 'capital', courtesy: true },
  justice: { 'zh-TW': '刑部', en: 'Ministry of Justice', section: 'capital', courtesy: true },
  works: { 'zh-TW': '工部', en: 'Ministry of Works', section: 'capital', courtesy: true },
  duchayuan: { 'zh-TW': '都察院', en: 'Censorate', section: 'capital', courtesy: true },
  dalisi: { 'zh-TW': '大理寺', en: 'Court of Revision', section: 'capital', courtesy: true },
  taichangsi: { 'zh-TW': '太常寺', en: 'Court of Sacrifices', section: 'capital', courtesy: true },
  guanglusi: { 'zh-TW': '光祿寺', en: 'Court of Banquets', section: 'capital', courtesy: true },
  taipusi: { 'zh-TW': '太僕寺', en: 'Court of the Imperial Stud', section: 'capital', courtesy: true },
  honglusi: { 'zh-TW': '鴻臚寺', en: 'Court of State Ceremonial', section: 'capital', courtesy: true },
  tongzhengsi: { 'zh-TW': '通政司', en: 'Office of Transmission', section: 'capital', courtesy: true },
  daxueshi: { 'zh-TW': '殿閣', en: 'Grand Secretaries', section: 'summit', courtesy: true },
  gongxian: { 'zh-TW': '宮銜', en: 'Palace Titles', section: 'summit', courtesy: true },
  jue: { 'zh-TW': '封爵', en: 'Peerage', section: 'summit', courtesy: true },
  end: { 'zh-TW': '歸宿', en: 'Ends of a Career', section: 'summit', courtesy: false },
  // ── C8: the second board's departments (BOARD_FULL_V2); the first board has no cells in them ──
  zongrenfu: { 'zh-TW': '宗人府', en: 'Imperial Clan Court', section: 'capital', courtesy: true },
  neiwufu: { 'zh-TW': '內務府', en: 'Imperial Household Department', section: 'capital', courtesy: true },
  neiting: { 'zh-TW': '內廷', en: 'Inner Court', section: 'capital', courtesy: true },
  zhongshuke: { 'zh-TW': '中書科', en: 'Drafting Office', section: 'capital', courtesy: true },
  qintianjian: { 'zh-TW': '欽天監', en: 'Directorate of Astronomy', section: 'capital', courtesy: true },
  taiyiyuan: { 'zh-TW': '太醫院', en: 'Imperial Academy of Medicine', section: 'capital', courtesy: true },
  luanyiwei: { 'zh-TW': '鑾儀衛', en: 'Imperial Equipage Guard', section: 'military', courtesy: true },
  wucheng: { 'zh-TW': '五城兵馬司', en: 'Capital Wards Police', section: 'capital', courtesy: true },
  cangchang: { 'zh-TW': '倉場', en: 'Capital Granaries', section: 'capital', courtesy: true },
  xueyuan: { 'zh-TW': '學院', en: 'Examination Commissions', section: 'provinces', courtesy: true },
  yanyuan: { 'zh-TW': '鹽院', en: 'Salt Administration', section: 'provinces', courtesy: true },
  heyuan: { 'zh-TW': '河院', en: 'River Conservancy', section: 'provinces', courtesy: true },
  caoyuan: { 'zh-TW': '漕院', en: 'Grain Transport', section: 'provinces', courtesy: true },
  tenglu: { 'zh-TW': '各館謄錄', en: 'Copyists of the Compilation Offices', section: 'start', courtesy: false },
  kaoji: { 'zh-TW': '考績', en: 'Evaluations and Events', section: 'summit', courtesy: false },
  juanna: { 'zh-TW': '捐納', en: 'Office by Purchase', section: 'start', courtesy: false },
} as const satisfies Record<
  string,
  { 'zh-TW': string; en: string; section: FullSection; courtesy: boolean }
>

export type FullDeptId = keyof typeof DEPTS
export const FULL_DEPARTMENTS: Readonly<
  Record<FullDeptId, { 'zh-TW': string; en: string; section: FullSection; courtesy: boolean }>
> = DEPTS

/** Where the birth roll may place a player (rulesFull.ts), and where everyone stands before it */
export const FULL_ORIGINS = ['baiding', 'tongsheng', 'jiansheng', 'shengyuan', 'yinsheng'] as const


export const BOARD_FULL: readonly FullCell[] = [
  // ── origin ──
  cell('baiding', '白丁', 'Baiding (Commoner)', NONE, 'origin', 'cap', 'shengyuan jiansheng tongsheng wutong shuli baiding', { kind: 'origin', banner: { liang: 'pijia' } }),
  cell('shuli', '書吏', 'Shuli (Yamen Clerk)', TONG, 'origin', 'cap', 'xunjian dianshi yicheng tongsheng shuli baiding', { kind: 'origin' }),
  cell('tongsheng', '童生', 'Tongsheng (Exam Candidate)', TONG, 'origin', 'cap', 'shengyuan shengyuan jiansheng wutong tongsheng baiding', { kind: 'origin' }),
  cell('jiansheng', '監生', 'Jiansheng (Purchased Studentship)', SHENG, 'origin', 'scholar', 'xiangshi xiangshi juanban xiangshi jiansheng tongsheng', { kind: 'origin', money: -10 }),
  cell('yinsheng', '蔭生', 'Yinsheng (Hereditary Student)', SHENG, 'origin', 'scholar', 'revenue-zhushi tongpan zhongshu xiangshi yinsheng baiding', { kind: 'origin' }),
  cell('juanban', '捐班', 'Juanban (Office by Purchase)', UNCLASSED, 'origin', 'official1', 'tongzhi zhixian xiancheng zhoutong juanban jiansheng', { kind: 'origin', money: -20 }),
  // ── exam ──
  cell('shengyuan', '生員', 'Shengyuan (County Scholar)', SHENG, 'exam', 'scholar', 'bagong xiangshi xiangshi suigong shengyuan tongsheng', { kind: 'exam' }),
  cell('xiangshi', '鄉試', 'Xiangshi (Provincial Examination)', SHENG, 'exam', 'scholar', 'jieyuan juren juren fubang shengyuan tongsheng', { kind: 'exam' }),
  cell('fubang', '副榜', 'Fubang (Provincial Exam Runner-up)', GONG, 'exam', 'scholar', 'juren jiaoyu xundao zhoupan fubang shengyuan', { kind: 'exam', degree: 1 }),
  cell('bagong', '拔貢', 'Bagong (Selected Tribute Student)', GONG, 'exam', 'scholar', 'zhixian juren jiaoyu xundao bagong shengyuan', { kind: 'exam', degree: 1 }),
  cell('suigong', '歲貢', 'Suigong (Senior Tribute Student)', GONG, 'exam', 'scholar', 'jiaoyu xundao xundao limu suigong shengyuan', { kind: 'exam', degree: 1 }),
  cell('juren', '舉人', 'Juren (Provincial Graduate)', JU, 'exam', 'scholar', 'huishi huishi huishi zhongshu datiao shengyuan', { kind: 'exam', degree: 2 }),
  cell('jieyuan', '解元', 'Jieyuan (Top Provincial Graduate)', JU, 'exam', 'laureate', 'huiyuan huishi huishi zhongshu datiao shengyuan', { kind: 'exam', degree: 2, money: 10 }),
  cell('huishi', '會試', 'Huishi (Metropolitan Examination)', JU, 'exam', 'scholar', 'huiyuan gongshi gongshi datiao juren shengyuan', { kind: 'exam' }),
  cell('datiao', '大挑', 'Datiao (Selection of Graduates)', JU, 'exam', 'scholar', 'zhixian zhixian jiaoyu jiaoyu xundao shengyuan', { kind: 'exam' }),
  cell('gongshi', '貢士', 'Gongshi (Palace Exam Candidate)', JIN, 'exam', 'scholar', 'zhuangyuan tanhua erjia erjia sanjia sanjia', { kind: 'palace', fengjue: 'zhuangyuan' }),
  cell('huiyuan', '會元', 'Huiyuan (Top Metropolitan Graduate)', JIN, 'exam', 'laureate', 'zhuangyuan bangyan tanhua erjia erjia sanjia', { kind: 'palace', fengjue: 'zhuangyuan', money: 10 }),
  cell('zhuangyuan', '狀元', 'Zhuangyuan (Top Scholar)', JIN, 'exam', 'laureate', 'shidu xiuzhuan xiuzhuan xiuzhuan xiuzhuan bianxiu', { kind: 'appoint', degree: 3, money: 20 }),
  cell('bangyan', '榜眼', 'Bangyan (Second Scholar)', JIN, 'exam', 'laureate', 'xiuzhuan bianxiu bianxiu bianxiu bianxiu jiantao', { kind: 'appoint', degree: 3, money: 10 }),
  cell('tanhua', '探花', 'Tanhua (Third Scholar)', JIN, 'exam', 'laureate', 'xiuzhuan bianxiu bianxiu bianxiu bianxiu jiantao', { kind: 'appoint', degree: 3, money: 10 }),
  cell('erjia', '二甲進士', 'Erjia Jinshi (Second-Class Graduate)', JIN, 'exam', 'laureate', 'shujishi shujishi revenue-zhushi rites-zhushi zhixian zhixian', { kind: 'appoint', degree: 3 }),
  cell('sanjia', '三甲進士', 'Sanjia Jinshi (Third-Class Graduate)', JIN, 'exam', 'laureate', 'shujishi justice-zhushi works-zhushi zhixian zhixian jiaoshou', { kind: 'appoint', degree: 3 }),
  // ── wuke ──
  cell('wutong', '武童', 'Wutong (Military Candidate)', TONG, 'wuke', 'cap', 'wusheng wusheng wusheng ewaiwaiwei wutong baiding', { kind: 'exam' }),
  cell('wusheng', '武生', 'Wusheng (Military Licentiate)', SHENG, 'wuke', 'scholar', 'wuju wuju ewaiwaiwei waiweibazong wusheng wutong', { kind: 'exam' }),
  cell('wuju', '武舉', 'Wuju (Military Provincial Graduate)', JU, 'wuke', 'scholar', 'wujinshi wujinshi waiweiqianzong bazong wuju wusheng', { kind: 'exam' }),
  cell('wujinshi', '武進士', 'Wu Jinshi (Military Metropolitan Graduate)', JIN, 'wuke', 'laureate', 'wuzhuangyuan wubangyan wutanhua lanling shoubei qianzong', { kind: 'palace', fengjue: 'wuzhuangyuan', wu: true }),
  cell('wuzhuangyuan', '武狀元', 'Wu Zhuangyuan (Top Military Graduate)', JIN, 'wuke', 'laureate', 'yideng yideng yideng canjiang youji erdeng', { kind: 'appoint', wu: true, money: 10 }),
  cell('wubangyan', '武榜眼', 'Wu Bangyan (Second Military Graduate)', JIN, 'wuke', 'laureate', 'erdeng erdeng erdeng youji dusi sandeng', { kind: 'appoint', wu: true, money: 5 }),
  cell('wutanhua', '武探花', 'Wu Tanhua (Third Military Graduate)', JIN, 'wuke', 'laureate', 'erdeng erdeng erdeng youji dusi sandeng', { kind: 'appoint', wu: true, money: 5 }),
  // ── ying ──
  cell('ewaiwaiwei', '額外外委', 'Ewai Waiwei (Supernumerary Corporal)', J9, 'ying', 'helmet1', 'waiweiqianzong waiweibazong waiweibazong ewaiwaiwei ewaiwaiwei wutong'),
  cell('waiweibazong', '外委把總', 'Waiwei Bazong (Acting Sergeant)', S9, 'ying', 'helmet1', 'bazong waiweiqianzong waiweiqianzong waiweibazong waiweibazong wutong'),
  cell('waiweiqianzong', '外委千總', 'Waiwei Qianzong (Acting Lieutenant)', S8, 'ying', 'helmet1', 'qianzong bazong bazong waiweiqianzong waiweiqianzong ewaiwaiwei'),
  cell('bazong', '把總', 'Bazong (Sergeant)', S7, 'ying', 'helmet1', 'shoubei qianzong qianzong bazong bazong ewaiwaiwei'),
  cell('qianzong', '千總', 'Qianzong (Lieutenant)', S6, 'ying', 'helmet2', 'dusi shoubei shoubei xiaoqixiao qianzong waiweibazong'),
  // ── zhen ──
  cell('shoubei', '守備', 'Shoubei (Captain)', S5, 'zhen', 'helmet2', 'youji dusi dusi fangyu shoubei waiweiqianzong'),
  cell('dusi', '都司', 'Dusi (Major)', S4, 'zhen', 'helmet2', 'canjiang youji youji zuoling dusi bazong'),
  cell('youji', '游擊', 'Youji (Lieutenant Colonel)', J3, 'zhen', 'helmet2', 'fujiang canjiang canjiang youji youji qianzong', { fengjue: 'nan' }),
  cell('canjiang', '參將', 'Canjiang (Colonel)', S3, 'zhen', 'helmet3', 'zongbing fujiang fujiang canling canjiang shoubei', { fengjue: 'nan' }),
  cell('fujiang', '副將', 'Fujiang (Brigade Vice-General)', J2, 'zhen', 'helmet3', 'tidu zongbing zongbing taizishaobao zhishi dusi', { fengjue: 'nan' }),
  cell('zongbing', '總兵', 'Zongbing (Brigade General)', S2, 'zhen', 'helmet3', 'taizitaibao tidu tidu fudutong zhishi youji', { fengjue: 'nan' }),
  cell('tidu', '提督', 'Tidu (Provincial Commander-in-Chief)', J1, 'zhen', 'helmet3', 'shaobao taizitaibao taizitaibao jiangjun zhishi canjiang', { fengjue: 'nan' }),
  // ── shiwei ──
  cell('lanling', '藍翎侍衛', 'Lanling Shiwei (Blue-Plume Guard)', S6, 'shiwei', 'guard1', 'erdeng sandeng sandeng lanling lanling bazong', { requires: 'guard', instead: 'qianzong' }),
  cell('sandeng', '三等侍衛', 'Sandeng Shiwei (Guard, Third Class)', S5, 'shiwei', 'guard2', 'yideng erdeng erdeng sandeng sandeng qianzong', { requires: 'guard', instead: 'shoubei' }),
  cell('erdeng', '二等侍衛', 'Erdeng Shiwei (Guard, Second Class)', S4, 'shiwei', 'guard2', 'sanzhi yideng yideng erdeng erdeng lanling', { requires: 'guard', instead: 'dusi' }),
  cell('yideng', '一等侍衛', 'Yideng Shiwei (Guard, First Class)', S3, 'shiwei', 'guard2', 'neidachen sanzhi sanzhi yideng yideng lanling', { fengjue: 'nan', requires: 'guard', instead: 'canjiang' }),
  cell('sanzhi', '散秩大臣', 'Sanzhi Dachen (Guard Minister)', J2, 'shiwei', 'guard2', 'lingshiwei neidachen neidachen sanzhi zhishi sandeng', { fengjue: 'nan', requires: 'guard', instead: 'fujiang' }),
  cell('neidachen', '內大臣', 'Nei Dachen (Palace Minister)', J1, 'shiwei', 'court', 'taibao lingshiwei lingshiwei neidachen zhishi erdeng', { fengjue: 'nan', requires: 'guard', instead: 'tidu' }),
  cell('lingshiwei', '領侍衛內大臣', 'Ling Shiwei Nei Dachen (Chief of the Guard)', S1, 'shiwei', 'court', 'taifu taibao taibao lingshiwei yugao yideng', { fengjue: 'nan', requires: 'guard', instead: 'tidu' }),
  // ── qiying ──
  cell('pijia', '披甲', 'Pijia (Banner Soldier)', TONG, 'qiying', 'cap', 'lanling lingcui lingcui bitieshi pijia baiding', { kind: 'origin', requires: 'banner', instead: 'wutong' }),
  cell('lingcui', '領催', 'Lingcui (Banner Corporal)', UNCLASSED, 'qiying', 'helmet1', 'fangyu xiaoqixiao xiaoqixiao bitieshi lingcui pijia', { requires: 'banner', instead: 'ewaiwaiwei' }),
  cell('bitieshi', '筆帖式', 'Bitieshi (Banner Clerk)', J8, 'qiying', 'official1', 'personnel-yuanwailang personnel-zhushi personnel-zhushi bitieshi bitieshi pijia', { requires: 'banner', instead: 'dianshi' }),
  cell('xiaoqixiao', '驍騎校', 'Xiaoqixiao (Banner Lieutenant)', S6, 'qiying', 'helmet2', 'zuoling fangyu fangyu xiaoqixiao xiaoqixiao pijia', { requires: 'banner', instead: 'qianzong' }),
  cell('fangyu', '防禦', 'Fangyu (Garrison Captain)', S5, 'qiying', 'helmet2', 'canling zuoling zuoling fangyu fangyu lingcui', { requires: 'banner', instead: 'shoubei' }),
  cell('zuoling', '佐領', 'Zuoling (Company Captain)', S4, 'qiying', 'helmet2', 'fudutong canling canling zuoling zuoling lingcui', { requires: 'banner', instead: 'dusi' }),
  // ── qitong ──
  cell('canling', '參領', 'Canling (Regiment Colonel)', S3, 'qitong', 'helmet3', 'dutong fudutong fudutong canling canling xiaoqixiao', { fengjue: 'nan', requires: 'banner', instead: 'canjiang' }),
  cell('fudutong', '副都統', 'Fu Dutong (Banner Vice-Commander)', S2, 'qitong', 'helmet3', 'jiangjun dutong dutong fudutong zhishi fangyu', { fengjue: 'nan', requires: 'banner', instead: 'zongbing' }),
  cell('dutong', '都統', 'Dutong (Banner Commander)', J1, 'qitong', 'helmet3', 'nan jiangjun jiangjun dutong zhishi zuoling', { fengjue: 'nan', requires: 'banner', instead: 'tidu' }),
  cell('jiangjun', '將軍', 'Jiangjun (Garrison General)', J1, 'qitong', 'helmet3', 'zi nan nan dutong zhishi fudutong', { fengjue: 'nan', requires: 'banner', instead: 'tidu' }),
  // ── xian ──
  cell('yicheng', '驛丞', 'Yicheng (Post Station Master)', UNCLASSED, 'xian', 'official1', 'zhubu xunjian xunjian honglu-mingzan yicheng shuli'),
  cell('dianshi', '典史', 'Dianshi (Jail Warden)', UNCLASSED, 'xian', 'official1', 'zhubu xunjian xunjian limu dianshi shuli'),
  cell('xunjian', '巡檢', 'Xunjian (Police Inspector)', J9, 'xian', 'official1', 'xiancheng zhubu zhubu limu xunjian shuli'),
  cell('zhubu', '主簿', 'Zhubu (County Registrar)', S9, 'xian', 'official1', 'zhixian xiancheng xiancheng taichang-boshi zhubu shuli'),
  cell('xiancheng', '縣丞', 'Xiancheng (Assistant Magistrate)', S8, 'xian', 'official1', 'zhizhou zhixian zhixian jingli xiancheng yicheng'),
  cell('zhixian', '知縣', 'Zhixian (County Magistrate)', S7, 'xian', 'official2', 'zhifu zhizhou zhizhou tongpan zhixian xunjian'),
  // ── zhou ──
  cell('limu', '吏目', 'Limu (Department Registrar)', J9, 'zhou', 'official1', 'zhoutong zhoupan zhoupan limu limu shuli'),
  cell('zhoupan', '州判', 'Zhoupan (Department Assistant)', J7, 'zhou', 'official1', 'zhizhou zhoutong zhoutong zhoupan zhoupan xunjian'),
  cell('zhoutong', '州同', 'Zhoutong (Department Vice-Magistrate)', J6, 'zhou', 'official2', 'zhifu zhizhou zhizhou zhoutong zhoutong limu'),
  cell('zhizhou', '知州', 'Zhizhou (Department Magistrate)', J5, 'zhou', 'official2', 'fenxundao zhifu zhifu tongzhi zhizhou limu'),
  // ── fu ──
  cell('jingli', '經歷', 'Jingli (Prefecture Secretary)', S8, 'fu', 'official1', 'tongzhi tongpan tongpan jingli jingli xunjian'),
  cell('tongpan', '通判', 'Tongpan (Prefecture Assistant)', S6, 'fu', 'official2', 'zhifu tongzhi tongzhi tongpan tongpan xiancheng'),
  cell('tongzhi', '同知', 'Tongzhi (Vice-Prefect)', S5, 'fu', 'official2', 'fenxundao zhifu zhifu tongzhi tongzhi jingli'),
  cell('zhifu', '知府', 'Zhifu (Prefect)', J4, 'fu', 'official2', 'anchashi fenxundao fenxundao fenshoudao zhifu jingli'),
  // ── jiaozhi ──
  cell('xundao', '訓導', 'Xundao (Assistant Instructor)', J8, 'jiaozhi', 'official1', 'jiaoshou jiaoyu jiaoyu xundao xundao shengyuan', { requires: 'zhengtu', instead: 'zhubu' }),
  cell('jiaoyu', '教諭', 'Jiaoyu (County Instructor)', S8, 'jiaozhi', 'official1', 'guozi-siye jiaoshou jiaoshou guozi-zhujiao jiaoyu shengyuan', { requires: 'zhengtu', instead: 'xiancheng' }),
  cell('jiaoshou', '教授', 'Jiaoshou (Prefecture Instructor)', S7, 'jiaozhi', 'official2', 'guozi-jijiu guozi-siye guozi-siye dali-pingshi jiaoshou xundao', { requires: 'zhengtu', instead: 'zhixian' }),
  cell('xuezheng', '學政', 'Xuezheng (Provincial Education Commissioner)', S4, 'jiaozhi', 'official3', 'zhanshi shaozhanshi shaozhanshi xuezheng xuezheng bianxiu', { requires: 'jinshi', instead: 'jiaoshou', money: 10 }),
  // ── guozijian ──
  cell('guozi-zhujiao', '國子監助教', 'Guozijian Zhujiao (Directorate Tutor)', J7, 'guozijian', 'official1', 'guozi-jijiu guozi-siye guozi-siye guozi-zhujiao guozi-zhujiao xundao'),
  cell('guozi-siye', '國子監司業', 'Guozijian Siye (Directorate Vice-Chancellor)', S6, 'guozijian', 'official2', 'tongzheng-fushi guozi-jijiu guozi-jijiu guozi-siye guozi-siye jiaoyu'),
  cell('guozi-jijiu', '國子監祭酒', 'Guozijian Jijiu (Directorate Chancellor)', J4, 'guozijian', 'official2', 'tongzhengshi tongzheng-fushi tongzheng-fushi shiduxueshi guozi-jijiu honglu-mingzan'),
  // ── dao ──
  cell('fenxundao', '分巡道', 'Fenxun Dao (Circuit Intendant)', S4, 'dao', 'official3', 'buzhengshi anchashi anchashi fenshoudao fenxundao tongpan'),
  cell('fenshoudao', '分守道', 'Fenshou Dao (Circuit Intendant, Revenue)', S4, 'dao', 'official3', 'anchashi yanyunshi yanyunshi fenxundao fenshoudao tongzhi'),
  cell('yanyunshi', '鹽運使', 'Yanyunshi (Salt Controller)', J3, 'dao', 'official3', 'buzhengshi anchashi anchashi yanyunshi yanyunshi geizhi', { fengjue: 'nan', money: 10 }),
  // ── sansi ──
  cell('anchashi', '按察使', 'Anchashi (Provincial Judge)', S3, 'sansi', 'official3', 'xunfu buzhengshi buzhengshi fuduyushi anchashi tongzhi', { fengjue: 'nan' }),
  cell('buzhengshi', '布政使', 'Buzhengshi (Provincial Treasurer)', J2, 'sansi', 'official3', 'zongdu xunfu xunfu buzhengshi buzhengshi zhifu', { fengjue: 'nan' }),
  // ── dufu ──
  cell('xunfu', '巡撫', 'Xunfu (Provincial Governor)', J2, 'dufu', 'official3', 'xieban zongdu zongdu hedu xunfu anchashi', { fengjue: 'nan' }),
  cell('zongdu', '總督', 'Zongdu (Governor-General)', S2, 'dufu', 'official3', 'tirenge xieban xieban caoyun zongdu buzhengshi', { fengjue: 'nan' }),
  cell('hedu', '河道總督', 'Hedao Zongdu (Director-General of the River)', S2, 'dufu', 'official3', 'xieban works-shangshu works-shangshu caoyun hedu geizhi', { fengjue: 'nan', money: 10 }),
  cell('caoyun', '漕運總督', 'Caoyun Zongdu (Director-General of Grain Transport)', S2, 'dufu', 'official3', 'xieban revenue-shangshu revenue-shangshu hedu caoyun geizhi', { fengjue: 'nan', money: 10 }),
  // ── hanlin ──
  cell('shujishi', '庶吉士', 'Shujishi (Hanlin Bachelor)', J7, 'hanlin', 'scholar', 'bianxiu bianxiu jiantao personnel-zhushi zhixian jiaoyu', { requires: 'jinshi', instead: 'zhixian' }),
  cell('jiantao', '檢討', 'Jiantao (Hanlin Corrector)', J7, 'hanlin', 'official1', 'xiuzhuan bianxiu bianxiu zanshan jiantao jiaoyu', { requires: 'jinshi', instead: 'zhongshu' }),
  cell('bianxiu', '編修', 'Bianxiu (Hanlin Compiler)', S7, 'hanlin', 'official2', 'zhongyun xiuzhuan xiuzhuan xuezheng bianxiu jiaoyu', { requires: 'jinshi', instead: 'dali-pingshi' }),
  cell('xiuzhuan', '修撰', 'Xiuzhuan (Hanlin First Compiler)', J6, 'hanlin', 'official2', 'shijiang zhongyun zhongyun zanshan xiuzhuan jiantao', { requires: 'jinshi', instead: 'guanglu-shuzheng' }),
  cell('shijiang', '侍講', 'Shijiang (Hanlin Lecturer)', J5, 'hanlin', 'official2', 'shuzi shidu shidu xuezheng shijiang zanshan', { requires: 'jinshi', instead: 'jianchayushi' }),
  cell('shidu', '侍讀', 'Shidu (Hanlin Reader)', J5, 'hanlin', 'official2', 'shijiangxueshi shuzi shuzi xuezheng shidu xiuzhuan', { requires: 'jinshi', instead: 'jianchayushi' }),
  cell('shijiangxueshi', '侍講學士', 'Shijiang Xueshi (Hanlin Chancellor-Lecturer)', J4, 'hanlin', 'official2', 'shaozhanshi shiduxueshi shiduxueshi shijiangxueshi shijiangxueshi shidu', { requires: 'jinshi', instead: 'guozi-jijiu' }),
  cell('shiduxueshi', '侍讀學士', 'Shidu Xueshi (Hanlin Chancellor-Reader)', J4, 'hanlin', 'official2', 'zhanshi shaozhanshi shaozhanshi shiduxueshi shiduxueshi shijiang', { requires: 'jinshi', instead: 'guozi-jijiu' }),
  cell('zhangyuan', '掌院學士', 'Zhangyuan Xueshi (Chancellor of the Hanlin)', J2, 'hanlin', 'official3', 'xieban rites-shangshu rites-shangshu zhangyuan zhangyuan shaozhanshi', { fengjue: 'nan', requires: 'jinshi', instead: 'neigexueshi' }),
  // ── zhanshifu ──
  cell('zanshan', '贊善', 'Zanshan (Supervisorate Admonisher)', J6, 'zhanshifu', 'official2', 'shijiang zhongyun zhongyun xiuzhuan zanshan jiantao', { requires: 'jinshi', instead: 'guanglu-shuzheng' }),
  cell('zhongyun', '中允', 'Zhongyun (Supervisorate Mentor)', S6, 'zhanshifu', 'official2', 'shidu shijiang shijiang rites-zhushi zhongyun zanshan', { requires: 'jinshi', instead: 'rites-zhushi' }),
  cell('shuzi', '庶子', 'Shuzi (Supervisorate Secretary)', S5, 'zhanshifu', 'official2', 'shiduxueshi shijiangxueshi shijiangxueshi shuzi shuzi shidu', { requires: 'jinshi', instead: 'jishizhong' }),
  cell('shaozhanshi', '少詹事', 'Shao Zhanshi (Vice-Supervisor of the Household)', S4, 'zhanshifu', 'official3', 'neigexueshi zhanshi zhanshi shaozhanshi shaozhanshi shiduxueshi', { requires: 'jinshi', instead: 'taichang-shaoqing' }),
  cell('zhanshi', '詹事', 'Zhanshi (Supervisor of the Household)', S3, 'zhanshifu', 'official3', 'rites-shilang neigexueshi neigexueshi zhangyuan zhanshi shiduxueshi', { fengjue: 'nan', requires: 'jinshi', instead: 'taichang-qing' }),
  // ── neige ──
  cell('zhongshu', '內閣中書', 'Neige Zhongshu (Grand Secretariat Drafter)', J7, 'neige', 'official1', 'honglu-shaoqing neigeshidu neigeshidu junjizhangjing zhongshu jiaoyu'),
  cell('neigeshidu', '內閣侍讀', 'Neige Shidu (Grand Secretariat Reader)', S6, 'neige', 'official2', 'honglu-qing honglu-shaoqing honglu-shaoqing junjizhangjing neigeshidu zhongshu'),
  cell('neigexueshi', '內閣學士', 'Neige Xueshi (Sub-Chancellor)', J2, 'neige', 'official3', 'rites-shangshu rites-shilang rites-shilang zhangyuan neigexueshi shaozhanshi', { fengjue: 'nan' }),
  // ── junji ──
  cell('junjizhangjing', '軍機章京', 'Junji Zhangjing (Grand Council Secretary)', J5, 'junji', 'official2', 'dali-shaoqing war-langzhong war-langzhong junjizhangjing junjizhangjing zhongshu', { money: 5 }),
  cell('junjidachen', '軍機大臣', 'Junji Dachen (Grand Councillor)', J1, 'junji', 'court', 'taibao lingban lingban junjidachen junjidachen war-shilang', { fengjue: 'nan', money: 10 }),
  cell('lingban', '領班軍機大臣', 'Lingban Junji Dachen (Chief Grand Councillor)', S1, 'junji', 'court', 'taifu taibao taibao lingban yugao junjidachen', { fengjue: 'nan', money: 10 }),
  // ── daxueshi ──
  cell('xieban', '協辦大學士', 'Xieban Daxueshi (Assistant Grand Secretary)', J1, 'daxueshi', 'court', 'wenyuange tirenge tirenge xieban xieban buzhengshi', { fengjue: 'nan', requires: 'juren', instead: 'taizitaibao' }),
  cell('tirenge', '體仁閣大學士', 'Tirenge Daxueshi (Grand Secretary, Tiren Hall)', S1, 'daxueshi', 'court', 'wuyingdian wenyuange wenyuange tirenge yugao xieban', { fengjue: 'nan', requires: 'jinshi', instead: 'taizitaibao' }),
  cell('wenyuange', '文淵閣大學士', 'Wenyuange Daxueshi (Grand Secretary, Wenyuan Hall)', S1, 'daxueshi', 'court', 'wenhuadian wuyingdian wuyingdian wenyuange yugao xieban', { fengjue: 'nan', requires: 'jinshi', instead: 'taizitaibao' }),
  cell('wuyingdian', '武英殿大學士', 'Wuyingdian Daxueshi (Grand Secretary, Wuying Hall)', S1, 'daxueshi', 'court', 'baohedian wenhuadian wenhuadian wuyingdian yugao xieban', { fengjue: 'nan', requires: 'jinshi', instead: 'taizitaibao' }),
  cell('wenhuadian', '文華殿大學士', 'Wenhuadian Daxueshi (Grand Secretary, Wenhua Hall)', S1, 'daxueshi', 'court', 'taibao baohedian baohedian wenhuadian yugao xieban', { fengjue: 'nan', requires: 'jinshi', instead: 'taizitaibao' }),
  cell('baohedian', '保和殿大學士', 'Baohedian Daxueshi (Grand Secretary, Baohe Hall)', S1, 'daxueshi', 'court', 'taifu taibao taibao baohedian yugao xieban', { fengjue: 'nan', requires: 'jinshi', instead: 'taizitaibao' }),
  // ── personnel ──
  cell('personnel-zhushi', '吏部主事', 'Libu Zhushi (Secretary, Ministry of Personnel)', S6, 'personnel', 'official2', 'personnel-langzhong personnel-yuanwailang personnel-yuanwailang revenue-zhushi personnel-zhushi xiancheng'),
  cell('personnel-yuanwailang', '吏部員外郎', 'Libu Yuanwailang (Vice-Director, Ministry of Personnel)', J5, 'personnel', 'official2', 'taichang-shaoqing personnel-langzhong personnel-langzhong jianchayushi personnel-yuanwailang zhixian'),
  cell('personnel-langzhong', '吏部郎中', 'Libu Langzhong (Director, Ministry of Personnel)', S5, 'personnel', 'official2', 'taichang-qing taichang-shaoqing taichang-shaoqing zhifu personnel-langzhong bitieshi'),
  cell('personnel-shilang', '吏部侍郎', 'Libu Shilang (Vice-Minister of Personnel)', S2, 'personnel', 'official3', 'xieban personnel-shangshu personnel-shangshu junjidachen personnel-shilang personnel-langzhong', { fengjue: 'nan' }),
  cell('personnel-shangshu', '吏部尚書', 'Libu Shangshu (Minister of Personnel)', J1, 'personnel', 'court', 'tirenge xieban xieban junjidachen personnel-shangshu personnel-shilang', { fengjue: 'nan' }),
  // ── revenue ──
  cell('revenue-zhushi', '戶部主事', 'Hubu Zhushi (Secretary, Ministry of Revenue)', S6, 'revenue', 'official2', 'revenue-langzhong revenue-yuanwailang revenue-yuanwailang rites-zhushi revenue-zhushi xiancheng'),
  cell('revenue-yuanwailang', '戶部員外郎', 'Hubu Yuanwailang (Vice-Director, Ministry of Revenue)', J5, 'revenue', 'official2', 'taipu-shaoqing revenue-langzhong revenue-langzhong jianchayushi revenue-yuanwailang zhixian'),
  cell('revenue-langzhong', '戶部郎中', 'Hubu Langzhong (Director, Ministry of Revenue)', S5, 'revenue', 'official2', 'taipu-qing taipu-shaoqing taipu-shaoqing zhifu revenue-langzhong revenue-zhushi'),
  cell('revenue-shilang', '戶部侍郎', 'Hubu Shilang (Vice-Minister of Revenue)', S2, 'revenue', 'official3', 'xieban revenue-shangshu revenue-shangshu junjidachen revenue-shilang revenue-langzhong', { fengjue: 'nan' }),
  cell('revenue-shangshu', '戶部尚書', 'Hubu Shangshu (Minister of Revenue)', J1, 'revenue', 'court', 'tirenge xieban xieban junjidachen revenue-shangshu revenue-shilang', { fengjue: 'nan' }),
  // ── rites ──
  cell('rites-zhushi', '禮部主事', 'Libu Zhushi (Secretary, Ministry of Rites)', S6, 'rites', 'official2', 'rites-langzhong rites-yuanwailang rites-yuanwailang war-zhushi rites-zhushi xiancheng'),
  cell('rites-yuanwailang', '禮部員外郎', 'Libu Yuanwailang (Vice-Director, Ministry of Rites)', J5, 'rites', 'official2', 'tongzheng-canyi rites-langzhong rites-langzhong jianchayushi rites-yuanwailang zhixian'),
  cell('rites-langzhong', '禮部郎中', 'Libu Langzhong (Director, Ministry of Rites)', S5, 'rites', 'official2', 'tongzheng-fushi tongzheng-canyi tongzheng-canyi zhifu rites-langzhong rites-zhushi'),
  cell('rites-shilang', '禮部侍郎', 'Libu Shilang (Vice-Minister of Rites)', S2, 'rites', 'official3', 'xieban rites-shangshu rites-shangshu junjidachen rites-shilang shaozhanshi', { fengjue: 'nan' }),
  cell('rites-shangshu', '禮部尚書', 'Libu Shangshu (Minister of Rites)', J1, 'rites', 'court', 'tirenge xieban xieban junjidachen rites-shangshu rites-shilang', { fengjue: 'nan' }),
  // ── war ──
  cell('war-zhushi', '兵部主事', 'Bingbu Zhushi (Secretary, Ministry of War)', S6, 'war', 'official2', 'war-langzhong war-yuanwailang war-yuanwailang justice-zhushi war-zhushi xiancheng'),
  cell('war-yuanwailang', '兵部員外郎', 'Bingbu Yuanwailang (Vice-Director, Ministry of War)', J5, 'war', 'official2', 'dali-shaoqing war-langzhong war-langzhong jianchayushi war-yuanwailang zhixian'),
  cell('war-langzhong', '兵部郎中', 'Bingbu Langzhong (Director, Ministry of War)', S5, 'war', 'official2', 'dali-qing dali-shaoqing dali-shaoqing zhifu war-langzhong war-zhushi'),
  cell('war-shilang', '兵部侍郎', 'Bingbu Shilang (Vice-Minister of War)', S2, 'war', 'official3', 'xieban war-shangshu war-shangshu junjidachen war-shilang dali-sicheng', { fengjue: 'nan' }),
  cell('war-shangshu', '兵部尚書', 'Bingbu Shangshu (Minister of War)', J1, 'war', 'court', 'tirenge xieban xieban junjidachen war-shangshu war-shilang', { fengjue: 'nan' }),
  // ── justice ──
  cell('justice-zhushi', '刑部主事', 'Xingbu Zhushi (Secretary, Ministry of Justice)', S6, 'justice', 'official2', 'justice-langzhong justice-yuanwailang justice-yuanwailang works-zhushi justice-zhushi xiancheng'),
  cell('justice-yuanwailang', '刑部員外郎', 'Xingbu Yuanwailang (Vice-Director, Ministry of Justice)', J5, 'justice', 'official2', 'jishizhong justice-langzhong justice-langzhong jianchayushi justice-yuanwailang zhixian'),
  cell('justice-langzhong', '刑部郎中', 'Xingbu Langzhong (Director, Ministry of Justice)', S5, 'justice', 'official2', 'fuduyushi jishizhong jishizhong zhifu justice-langzhong justice-zhushi'),
  cell('justice-shilang', '刑部侍郎', 'Xingbu Shilang (Vice-Minister of Justice)', S2, 'justice', 'official3', 'xieban justice-shangshu justice-shangshu junjidachen justice-shilang jianchayushi', { fengjue: 'nan' }),
  cell('justice-shangshu', '刑部尚書', 'Xingbu Shangshu (Minister of Justice)', J1, 'justice', 'court', 'tirenge xieban xieban zuoduyushi justice-shangshu justice-shilang', { fengjue: 'nan' }),
  // ── works ──
  cell('works-zhushi', '工部主事', 'Gongbu Zhushi (Secretary, Ministry of Works)', S6, 'works', 'official2', 'works-langzhong works-yuanwailang works-yuanwailang personnel-zhushi works-zhushi xiancheng'),
  cell('works-yuanwailang', '工部員外郎', 'Gongbu Yuanwailang (Vice-Director, Ministry of Works)', J5, 'works', 'official2', 'guanglu-shaoqing works-langzhong works-langzhong jianchayushi works-yuanwailang zhixian'),
  cell('works-langzhong', '工部郎中', 'Gongbu Langzhong (Director, Ministry of Works)', S5, 'works', 'official2', 'guanglu-qing guanglu-shaoqing guanglu-shaoqing zhifu works-langzhong works-zhushi'),
  cell('works-shilang', '工部侍郎', 'Gongbu Shilang (Vice-Minister of Works)', S2, 'works', 'official3', 'xieban works-shangshu works-shangshu junjidachen works-shilang guanglu-shuzheng', { fengjue: 'nan' }),
  cell('works-shangshu', '工部尚書', 'Gongbu Shangshu (Minister of Works)', J1, 'works', 'court', 'tirenge xieban xieban junjidachen works-shangshu works-shilang', { fengjue: 'nan' }),
  // ── duchayuan ──
  cell('jianchayushi', '監察御史', 'Jiancha Yushi (Investigating Censor)', J5, 'duchayuan', 'official2', 'fuduyushi jishizhong jishizhong jianchayushi jianchayushi zhixian', { requires: 'zhengtu', instead: 'personnel-yuanwailang' }),
  cell('jishizhong', '給事中', 'Jishizhong (Supervising Censor)', S5, 'duchayuan', 'official2', 'justice-shilang fuduyushi fuduyushi jishizhong jishizhong zhixian', { requires: 'zhengtu', instead: 'personnel-langzhong' }),
  cell('fuduyushi', '左副都御史', 'Zuo Fu Duyushi (Vice Censor-in-Chief)', S3, 'duchayuan', 'official3', 'justice-shangshu justice-shilang justice-shilang xunfu fuduyushi jianchayushi', { fengjue: 'nan' }),
  cell('zuoduyushi', '左都御史', 'Zuo Duyushi (Censor-in-Chief)', J1, 'duchayuan', 'court', 'tirenge xieban xieban junjidachen zuoduyushi fuduyushi', { fengjue: 'nan' }),
  // ── dalisi ──
  cell('dali-pingshi', '大理寺評事', 'Dalisi Pingshi (Court of Revision Case Reviewer)', S7, 'dalisi', 'official2', 'dali-shaoqing dali-sicheng dali-sicheng dali-pingshi dali-pingshi xiancheng'),
  cell('dali-sicheng', '大理寺丞', 'Dalisi Sicheng (Court of Revision Assistant)', S6, 'dalisi', 'official2', 'dali-qing dali-shaoqing dali-shaoqing dali-sicheng dali-sicheng xiancheng'),
  cell('dali-shaoqing', '大理寺少卿', 'Dalisi Shaoqing (Court of Revision Vice-Minister)', S4, 'dalisi', 'official3', 'war-shilang dali-qing dali-qing dali-shaoqing dali-shaoqing dali-pingshi'),
  cell('dali-qing', '大理寺卿', 'Dalisi Qing (Chief Minister, Court of Revision)', S3, 'dalisi', 'official3', 'war-shangshu war-shilang war-shilang dali-qing dali-qing dali-pingshi', { fengjue: 'nan' }),
  // ── taichangsi ──
  cell('taichang-boshi', '太常寺博士', 'Taichangsi Boshi (Court of Sacrifices Erudite)', S7, 'taichangsi', 'official2', 'guanglu-shaoqing guanglu-shuzheng guanglu-shuzheng taichang-boshi taichang-boshi zhubu'),
  cell('taichang-shaoqing', '太常寺少卿', 'Taichangsi Shaoqing (Court of Sacrifices Vice-Minister)', S4, 'taichangsi', 'official3', 'personnel-shilang taichang-qing taichang-qing taichang-shaoqing taichang-shaoqing personnel-zhushi'),
  cell('taichang-qing', '太常寺卿', 'Taichangsi Qing (Chief Minister, Court of Sacrifices)', S3, 'taichangsi', 'official3', 'personnel-shangshu personnel-shilang personnel-shilang taichang-qing taichang-qing personnel-yuanwailang', { fengjue: 'nan' }),
  // ── guanglusi ──
  cell('guanglu-shuzheng', '光祿寺署正', 'Guanglusi Shuzheng (Banquets Office Director)', J6, 'guanglusi', 'official2', 'guanglu-qing guanglu-shaoqing guanglu-shaoqing guanglu-shuzheng guanglu-shuzheng xiancheng'),
  cell('guanglu-shaoqing', '光祿寺少卿', 'Guanglusi Shaoqing (Court of Banquets Vice-Minister)', S5, 'guanglusi', 'official2', 'works-shilang guanglu-qing guanglu-qing guanglu-shaoqing guanglu-shaoqing taichang-boshi'),
  cell('guanglu-qing', '光祿寺卿', 'Guanglusi Qing (Chief Minister, Court of Banquets)', J3, 'guanglusi', 'official3', 'works-shangshu works-shilang works-shilang guanglu-qing guanglu-qing taichang-boshi', { fengjue: 'nan' }),
  // ── taipusi ──
  cell('taipu-shaoqing', '太僕寺少卿', 'Taipusi Shaoqing (Court of the Imperial Stud Vice-Minister)', S4, 'taipusi', 'official3', 'revenue-shilang taipu-qing taipu-qing taipu-shaoqing taipu-shaoqing revenue-yuanwailang'),
  cell('taipu-qing', '太僕寺卿', 'Taipusi Qing (Chief Minister, Imperial Stud)', J3, 'taipusi', 'official3', 'revenue-shangshu revenue-shilang revenue-shilang taipu-qing taipu-qing revenue-langzhong', { fengjue: 'nan' }),
  // ── honglusi ──
  cell('honglu-mingzan', '鴻臚寺鳴贊', 'Honglusi Mingzan (Herald)', J9, 'honglusi', 'official1', 'guozi-siye guozi-zhujiao guozi-zhujiao honglu-mingzan honglu-mingzan shuli'),
  cell('honglu-shaoqing', '鴻臚寺少卿', 'Honglusi Shaoqing (Court of State Ceremonial Vice-Minister)', J5, 'honglusi', 'official2', 'guanglu-qing honglu-qing honglu-qing honglu-shaoqing honglu-shaoqing zhongshu'),
  cell('honglu-qing', '鴻臚寺卿', 'Honglusi Qing (Chief Minister, State Ceremonial)', S4, 'honglusi', 'official3', 'works-shilang guanglu-qing guanglu-qing honglu-qing honglu-qing zhongshu'),
  // ── tongzhengsi ──
  cell('tongzheng-canyi', '通政司參議', 'Tongzhengsi Canyi (Transmission Office Adviser)', S5, 'tongzhengsi', 'official2', 'tongzhengshi tongzheng-fushi tongzheng-fushi tongzheng-canyi tongzheng-canyi rites-yuanwailang'),
  cell('tongzheng-fushi', '通政司副使', 'Tongzhengsi Fushi (Vice Commissioner of Transmission)', S4, 'tongzhengsi', 'official3', 'rites-shilang tongzhengshi tongzhengshi tongzheng-fushi tongzheng-fushi tongzheng-canyi'),
  cell('tongzhengshi', '通政使', 'Tongzhengshi (Commissioner of Transmission)', S3, 'tongzhengsi', 'official3', 'rites-shangshu rites-shilang rites-shilang tongzhengshi tongzhengshi tongzheng-canyi', { fengjue: 'nan' }),
  // ── gongxian ──
  cell('taizishaobao', '太子少保', 'Taizi Shaobao (Junior Guardian of the Heir)', J2, 'gongxian', 'court', 'shaobao taizitaibao taizitaibao taizishaobao taizishaobao canjiang', { fengjue: 'nan' }),
  cell('taizitaibao', '太子太保', 'Taizi Taibao (Grand Guardian of the Heir)', J1, 'gongxian', 'court', 'taibao shaobao shaobao taizitaibao taizitaibao zongbing', { fengjue: 'nan' }),
  cell('shaobao', '少保', 'Shaobao (Junior Guardian)', J1, 'gongxian', 'court', 'taifu taibao taibao shaobao shaobao zongbing', { fengjue: 'nan' }),
  cell('taibao', '太保', 'Taibao (Grand Guardian)', S1, 'gongxian', 'court', 'taishi taifu taifu taibao yugao taizitaibao', { fengjue: 'nan' }),
  cell('taifu', '太傅', 'Taifu (Grand Tutor)', S1, 'gongxian', 'court', 'dahe taishi taishi taifu yugao taizitaibao', { fengjue: 'nan' }),
  cell('taishi', '太師', 'Taishi (Grand Preceptor)', S1, 'gongxian', 'court', 'dahe dahe dahe taishi yugao shaobao', { fengjue: 'nan' }),
  // ── jue ──
  cell('nan', '男爵', 'Nanjue (Baron)', BARON, 'jue', 'peer', 'bo zi zi nan yugao taizitaibao', { fengjue: 'zi' }),
  cell('zi', '子爵', 'Zijue (Viscount)', VISCOUNT, 'jue', 'peer', 'hou bo bo zi yugao taizitaibao', { fengjue: 'bo' }),
  cell('bo', '伯爵', 'Bojue (Earl)', EARL, 'jue', 'peer', 'gongjue hou hou bo yugao nan', { fengjue: 'hou' }),
  cell('hou', '侯爵', 'Houjue (Marquis)', MARQUIS, 'jue', 'peer', 'dahe gongjue gongjue hou yugao zi', { fengjue: 'gongjue' }),
  cell('gongjue', '公爵', 'Gongjue (Duke)', DUKE, 'jue', 'peer', 'dahe dahe dahe gongjue yugao bo', { fengjue: 'dahe' }),
  // ── end ──
  cell('geizhi', '革職', 'Gezhi (Dismissed from Office)', NONE, 'end', 'cap', 'juanban dianshi shuli baiding geizhi changshu', { kind: 'penalty', money: -10 }),
  cell('zhishi', '致仕', 'Zhishi (Retired)', NONE, 'end', 'gate', 'zhishi zhishi zhishi zhishi zhishi zhishi', { kind: 'end', retire: 5, keepRank: true }),
  cell('yugao', '予告榮歸', 'Yugao Ronggui (Retired with Honours)', NONE, 'end', 'gate', 'yugao yugao yugao yugao yugao yugao', { kind: 'end', retire: 10, keepRank: true }),
  cell('dahe', '大賀', 'Dahe (Grand Congratulations)', TOP, 'end', 'gate', 'dahe dahe dahe dahe dahe dahe', { kind: 'end', retire: 20 }),
  cell('changshu', '長戍', 'Changshu (Exiled to the Frontier)', NONE, 'end', 'exile', 'changshu changshu changshu changshu changshu changshu', { kind: 'end', out: true }),
]

// ── The second board (C8, rulesVersion 2) ─────────────────────────────────────────────────────
//
// The first board above is frozen: a game started before C8 keeps playing on it (rulesVersion 1, see
// rulesFull.ts). The second board is the first one with some moves changed (`V2_CHANGES`), four cells
// moved into departments of their own (`V2_DEPT`), and new cells (`NEW_CELLS`): more capital and
// provincial offices, the copyists' offices and other offered posts, minor technical posts,
// commissions and the event zones. Like the first, its ids are stored in running games: only add.

/** An event's six outcomes, best face first: `up2`, `up1+10t` (10 from the bank and a title), ... */
function outcomes(text: string): Record<FullFace, EventOutcome> {
  const parts = text.split(' ').map((part): EventOutcome => {
    const [, go, money, title] = /^([a-z0-9]+)(?:\+(\d+))?(t)?$/.exec(part) as RegExpExecArray
    return { go: go as EventGo, money: Number(money ?? 0), title: title === 't' }
  })
  return Object.fromEntries(FULL_FACES.map((face, at) => [face, parts[at]])) as Record<
    FullFace,
    EventOutcome
  >
}

const EVENT = { kind: 'event', keepRank: true } as const

const NEW_CELLS: readonly FullCell[] = [
  // ── exam: two more offered posts ──
  cell('jiaoxi', '官學教習', 'Guanxue Jiaoxi (Banner School Teacher)', UNCLASSED, 'exam', 'scholar', 'zhixian zhixian jiaoyu zhongshuke-sheren jiaoxi suigong', { offer: true }),
  cell('zhaoshi', '召試', 'Zhaoshi (Special Examination by Summons)', GONG, 'exam', 'laureate', 'zhongshu zhongshuke-sheren jiaoxi jiaoyu zhaoshi shengyuan', { kind: 'exam', offer: true }),
  // ── tenglu: the copyists of the compilation offices, then commendation into a post ──
  cell('guoshi-tenglu', '國史館謄錄', 'Guoshiguan Tenglu (Copyist, State History Office)', UNCLASSED, 'tenglu', 'scholar', 'yixu yixu fanglue-tenglu huidian-tenglu guoshi-tenglu shengyuan', { offer: true }),
  cell('fanglue-tenglu', '方略館謄錄', 'Fanglueguan Tenglu (Copyist, Military Annals Office)', UNCLASSED, 'tenglu', 'scholar', 'yixu yixu huidian-tenglu guoshi-tenglu fanglue-tenglu shengyuan', { offer: true }),
  cell('huidian-tenglu', '會典館謄錄', 'Huidianguan Tenglu (Copyist, Statutes Office)', UNCLASSED, 'tenglu', 'scholar', 'yixu yixu guoshi-tenglu fanglue-tenglu huidian-tenglu shengyuan', { offer: true }),
  cell('yixu', '議敘', 'Yixu (Commendation for Service)', UNCLASSED, 'tenglu', 'official1', 'zhixian zhoupan xiancheng zhubu xunjian dianshi', { kind: 'appoint' }),
  // ── kaoji: the event zones ──
  cell('jingcha', '京察', 'Jingcha (Capital Evaluation)', NONE, 'kaoji', 'official2', 'jingcha jingcha jingcha jingcha jingcha jingcha', { ...EVENT, event: outcomes('up1 stay+5 stay stay stay down') }),
  cell('daji', '大計', 'Daji (Provincial Evaluation)', NONE, 'kaoji', 'official2', 'daji daji daji daji daji daji', { ...EVENT, event: outcomes('up1 stay+5 stay stay stay down') }),
  cell('dakao', '大考', 'Dakao (Hanlin Grand Examination)', NONE, 'kaoji', 'laureate', 'dakao dakao dakao dakao dakao dakao', { ...EVENT, event: outcomes('up1 stay+5 stay stay down down') }),
  cell('jungong', '軍功', 'Jungong (Military Merit)', NONE, 'kaoji', 'helmet3', 'jungong jungong jungong jungong jungong jungong', { ...EVENT, event: outcomes('up1+10 stay+5 stay stay stay down') }),
  cell('chufen', '處分', 'Chufen (Disciplinary Review)', NONE, 'kaoji', 'official1', 'chufen chufen chufen chufen chufen chufen', { ...EVENT, event: outcomes('stay stay down down down dismiss') }),
  cell('kuangdian', '曠典', 'Kuangdian (Imperial Favour)', NONE, 'kaoji', 'court', 'kuangdian kuangdian kuangdian kuangdian kuangdian kuangdian', { ...EVENT, event: outcomes('up1+20t stay+10t stay+10 stay+5 stay stay') }),
  // ── luanyiwei ──
  cell('zhengyiwei', '整儀尉', 'Zhengyiwei (Equipage Lieutenant)', S6, 'luanyiwei', 'guard1', 'yunhuishi zhiyizheng zhiyizheng lanling jungong bazong', { requires: 'guard', instead: 'qianzong' }),
  cell('zhiyizheng', '治儀正', 'Zhiyizheng (Equipage Captain)', S5, 'luanyiwei', 'guard2', 'guanjunshi yunhuishi yunhuishi sandeng jungong zhengyiwei', { requires: 'guard', instead: 'shoubei' }),
  cell('yunhuishi', '雲麾使', 'Yunhuishi (Equipage Commander)', S4, 'luanyiwei', 'guard2', 'luanyishi guanjunshi guanjunshi erdeng jungong zhiyizheng', { requires: 'guard', instead: 'dusi' }),
  cell('guanjunshi', '冠軍使', 'Guanjunshi (Equipage Senior Commander)', S3, 'luanyiwei', 'guard2', 'neidachen luanyishi luanyishi yideng guanjunshi yunhuishi', { fengjue: 'nan', requires: 'guard', instead: 'canjiang' }),
  cell('luanyishi', '鑾儀使', 'Luanyishi (Commissioner of the Imperial Equipage)', S2, 'luanyiwei', 'court', 'taizitaibao neidachen neidachen zongbing zhishi guanjunshi', { fengjue: 'nan', requires: 'guard', instead: 'zongbing' }),
  // ── xueyuan: the examination commissions (學政 moves in) ──
  cell('fukaoguan', '鄉試副考官', 'Xiangshi Fu Kaoguan (Associate Provincial Examiner)', J5, 'xueyuan', 'official2', 'xuezheng zhengkaoguan zhengkaoguan shidu fukaoguan bianxiu', { requires: 'jinshi', instead: 'jiaoshou', money: 10, fine: 15 }),
  cell('zhengkaoguan', '鄉試正考官', 'Xiangshi Zheng Kaoguan (Chief Provincial Examiner)', J4, 'xueyuan', 'official3', 'shaozhanshi xuezheng shiduxueshi shijiangxueshi zhengkaoguan shidu', { requires: 'jinshi', instead: 'jiaoshou', money: 10, fine: 15 }),
  // ── yanyuan: salt (鹽運使 moves in) ──
  cell('yanke-dashi', '鹽課大使', 'Yanke Dashi (Salt Tax Collector)', S8, 'yanyuan', 'official1', 'yanyun-tongzhi xunyanyushi zhixian jingli yanke-dashi xunjian'),
  cell('xunyanyushi', '巡鹽御史', 'Xunyan Yushi (Salt Censor)', J5, 'yanyuan', 'official2', 'yanyunshi yanyun-tongzhi yanyun-tongzhi jianchayushi xunyanyushi zhixian', { requires: 'zhengtu', instead: 'tongzhi', money: 10, fine: 10 }),
  cell('yanyun-tongzhi', '鹽運同知', 'Yanyun Tongzhi (Salt Vice-Controller)', J4, 'yanyuan', 'official2', 'anchashi yanyunshi fenshoudao zhifu yanyun-tongzhi tongpan'),
  // ── heyuan: rivers (河道總督 moves in) ──
  cell('guanhe-tongzhi', '管河同知', 'Guanhe Tongzhi (River Sub-Prefect)', S5, 'heyuan', 'official2', 'hedao hedao tongzhi tongzhi daji tongpan'),
  cell('hedao', '管河道', 'Guanhe Dao (River Intendant)', S4, 'heyuan', 'official3', 'anchashi yanyunshi fenxundao fenshoudao daji guanhe-tongzhi'),
  // ── caoyuan: grain transport (漕運總督 moves in) ──
  cell('wei-qianzong', '衛千總', 'Wei Qianzong (Grain Fleet Lieutenant)', S6, 'caoyuan', 'helmet2', 'liangdao tongzhi tongpan qianzong wei-qianzong bazong'),
  cell('liangdao', '督糧道', 'Duliang Dao (Grain Intendant)', S4, 'caoyuan', 'official3', 'buzhengshi anchashi fenxundao fenshoudao daji tongzhi'),
  // ── zongrenfu ──
  cell('zongren-zhushi', '宗人府主事', 'Zongrenfu Zhushi (Secretary, Imperial Clan Court)', S6, 'zongrenfu', 'official2', 'zongren-lishiguan zongren-lishiguan personnel-yuanwailang revenue-zhushi jingcha xiancheng'),
  cell('zongren-lishiguan', '宗人府理事官', 'Zongrenfu Lishiguan (Clan Court Administrator)', S5, 'zongrenfu', 'official2', 'zongren-fucheng taichang-shaoqing taichang-shaoqing personnel-langzhong jingcha zongren-zhushi', { requires: 'banner', instead: 'personnel-langzhong' }),
  cell('zongren-fucheng', '宗人府府丞', 'Zongrenfu Fucheng (Clan Court Assistant Director)', S3, 'zongrenfu', 'official3', 'personnel-shilang personnel-shilang taichang-qing fuduyushi zongren-fucheng zongren-lishiguan', { fengjue: 'nan' }),
  // ── neiwufu: Banner households only ──
  cell('neiwu-zhushi', '內務府主事', 'Neiwufu Zhushi (Secretary, Imperial Household)', S6, 'neiwufu', 'official2', 'neiwu-langzhong neiwu-yuanwailang neiwu-yuanwailang revenue-zhushi jingcha bitieshi', { requires: 'banner', instead: 'revenue-zhushi' }),
  cell('neiwu-yuanwailang', '內務府員外郎', 'Neiwufu Yuanwailang (Vice-Director, Imperial Household)', J5, 'neiwufu', 'official2', 'taipu-shaoqing neiwu-langzhong neiwu-langzhong revenue-yuanwailang jingcha neiwu-zhushi', { requires: 'banner', instead: 'revenue-yuanwailang' }),
  cell('neiwu-langzhong', '內務府郎中', 'Neiwufu Langzhong (Director, Imperial Household)', S5, 'neiwufu', 'official2', 'neiwu-dachen taipu-qing taipu-shaoqing revenue-langzhong jingcha neiwu-yuanwailang', { requires: 'banner', instead: 'revenue-langzhong' }),
  cell('neiwu-dachen', '總管內務府大臣', 'Zongguan Neiwufu Dachen (Minister of the Imperial Household)', S2, 'neiwufu', 'court', 'xieban revenue-shangshu revenue-shangshu junjidachen neiwu-dachen neiwu-langzhong', { fengjue: 'nan', requires: 'banner', instead: 'revenue-shilang' }),
  // ── neiting: the inner court's duties, held by jinshi ──
  cell('qijuzhu', '起居注官', 'Qijuzhu Guan (Diarist of the Court)', J5, 'neiting', 'official2', 'nanshufang shijiangxueshi shidu kuangdian qijuzhu xiuzhuan', { requires: 'jinshi', instead: 'zhongshu', money: 5, fine: 10 }),
  cell('nanshufang', '南書房行走', 'Nanshufang Xingzou (Southern Study Attendant)', S4, 'neiting', 'official3', 'neigexueshi shangshufang shangshufang kuangdian nanshufang shidu', { requires: 'jinshi', instead: 'neigeshidu', money: 5, fine: 10 }),
  cell('shangshufang', '上書房師傅', 'Shangshufang Shifu (Tutor to the Princes)', J3, 'neiting', 'official3', 'rites-shilang neigexueshi zhanshi kuangdian shangshufang nanshufang', { fengjue: 'nan', requires: 'jinshi', instead: 'tongzheng-fushi', money: 5, fine: 10 }),
  // ── zhongshuke ──
  cell('zhongshuke-sheren', '中書科中書舍人', 'Zhongshuke Sheren (Drafter, Drafting Office)', J7, 'zhongshuke', 'official1', 'neigeshidu zhongshuke-zhangyin zhongshuke-zhangyin zhongshu zhongshuke-sheren honglu-mingzan'),
  cell('zhongshuke-zhangyin', '中書科掌印中書', 'Zhongshuke Zhangyin (Seal-Keeping Drafter)', S7, 'zhongshuke', 'official2', 'honglu-shaoqing neigeshidu neigeshidu dali-pingshi zhongshuke-zhangyin zhongshuke-sheren'),
  // ── qintianjian: two minor technical posts at the bottom ──
  cell('tianwensheng', '天文生', 'Tianwensheng (Astronomy Student)', UNCLASSED, 'qintianjian', 'cap', 'wuguanzheng qintian-boshi qintian-boshi yicheng tianwensheng geizhi', { minor: true }),
  cell('qintian-boshi', '欽天監博士', 'Qintianjian Boshi (Astronomy Erudite)', J9, 'qintianjian', 'official1', 'jianfu wuguanzheng wuguanzheng xunjian qintian-boshi tianwensheng', { minor: true }),
  cell('wuguanzheng', '五官正', 'Wuguanzheng (Astronomer of the Five Offices)', J6, 'qintianjian', 'official2', 'jianzheng jianfu jianfu guanglu-shuzheng wuguanzheng qintian-boshi'),
  cell('jianfu', '欽天監監副', 'Qintianjian Jianfu (Vice-Director of Astronomy)', S6, 'qintianjian', 'official2', 'jianzheng jianzheng jianzheng dali-sicheng jianfu wuguanzheng'),
  cell('jianzheng', '欽天監監正', 'Qintianjian Jianzheng (Director of Astronomy)', S5, 'qintianjian', 'official2', 'taichang-shaoqing honglu-qing guanglu-shaoqing tongzheng-canyi jianzheng jianfu'),
  // ── taiyiyuan: two minor technical posts at the bottom ──
  cell('yishi', '醫士', 'Yishi (Court Physician Assistant)', UNCLASSED, 'taiyiyuan', 'cap', 'yuyi taiyi-limu taiyi-limu yicheng yishi geizhi', { minor: true }),
  cell('taiyi-limu', '太醫院吏目', 'Taiyiyuan Limu (Medical Registrar)', J9, 'taiyiyuan', 'official1', 'yuyi yuyi yuyi xunjian taiyi-limu yishi', { minor: true }),
  cell('yuyi', '御醫', 'Yuyi (Imperial Physician)', S8, 'taiyiyuan', 'official1', 'yuanshi yuanpan yuanpan jingli yuyi taiyi-limu'),
  cell('yuanpan', '太醫院院判', 'Taiyiyuan Yuanpan (Vice-Director of Medicine)', S6, 'taiyiyuan', 'official2', 'yuanshi yuanshi yuanshi dali-sicheng yuanpan yuyi'),
  cell('yuanshi', '太醫院院使', 'Taiyiyuan Yuanshi (Director of Medicine)', S5, 'taiyiyuan', 'official2', 'guanglu-qing guanglu-shaoqing guanglu-shaoqing tongzheng-canyi yuanshi yuanpan'),
  // ── wucheng ──
  cell('wucheng-limu', '兵馬司吏目', 'Bingmasi Limu (Ward Registrar)', J9, 'wucheng', 'official1', 'fuzhihui xiancheng zhubu xunjian wucheng-limu dianshi'),
  cell('fuzhihui', '兵馬司副指揮', 'Bingmasi Fu Zhihui (Ward Vice-Commander)', S7, 'wucheng', 'official1', 'zhihui zhihui zhihui zhixian fuzhihui wucheng-limu'),
  cell('zhihui', '兵馬司指揮', 'Bingmasi Zhihui (Ward Commander)', S6, 'wucheng', 'official2', 'tongzhi xunchengyushi xunchengyushi dali-sicheng zhihui fuzhihui'),
  cell('xunchengyushi', '巡城御史', 'Xuncheng Yushi (Ward Censor)', J5, 'wucheng', 'official2', 'dali-shaoqing jishizhong jishizhong jianchayushi xunchengyushi zhihui', { requires: 'zhengtu', instead: 'zhihui', money: 5, fine: 10 }),
  // ── cangchang ──
  cell('cang-jiandu', '倉監督', 'Cang Jiandu (Granary Superintendent)', J5, 'cangchang', 'official2', 'taipu-shaoqing zuoliangting zuoliangting revenue-yuanwailang cang-jiandu revenue-zhushi', { requires: 'zhengtu', instead: 'revenue-yuanwailang', money: 10, fine: 10 }),
  cell('zuoliangting', '坐糧廳', 'Zuoliangting (Grain Receiving Office)', S5, 'cangchang', 'official2', 'taipu-qing taipu-shaoqing taipu-shaoqing revenue-langzhong zuoliangting cang-jiandu'),
  cell('cangchang-shilang', '倉場侍郎', 'Cangchang Shilang (Vice-Minister of the Granaries)', S2, 'cangchang', 'official3', 'xieban revenue-shangshu revenue-shangshu caoyun cangchang-shilang zuoliangting', { fengjue: 'nan' }),
]

/** Cells of the first board that the second puts in a department of their own */
const V2_DEPT: Readonly<Record<string, FullDeptId>> = {
  xuezheng: 'xueyuan',
  yanyunshi: 'yanyuan',
  hedu: 'heyuan',
  caoyun: 'caoyuan',
  // A purchased office is a post, not a birth: out of the origins (no move leads back to those)
  juanban: 'juanna',
}

/**
 * Cells of the first board the second leaves out. The yamen clerk (書吏) was a place to fall back to
 * from the lowest posts; on the second board nothing leads back to the origins (擁有者 2026-11-12),
 * and no birth places anyone there, so nothing would reach it
 */
const V2_DROPPED: ReadonlySet<string> = new Set(['shuli'])

type Change = Partial<Record<FullFace, string>> & {
  fine?: number
  title?: boolean
  kind?: CellKind
  retire?: number
}

const MINISTRIES = ['personnel', 'revenue', 'rites', 'war', 'justice', 'works']
const each = (ids: readonly string[], change: Change): Record<string, Change> =>
  Object.fromEntries(ids.map((id) => [id, change]))

/**
 * The second board's changes to the first board's cells. Mostly mediocrity (柔), which on the first
 * board stays in place, leads to an evaluation instead; graft of a high civil post leads to a
 * disciplinary review (處分) whose `down` is where graft led before; some lateral moves (良) lead
 * into the new departments, to offered posts and to minor posts. Later entries add to earlier ones.
 */
const V2_CHANGES: Readonly<Record<string, Change>> = merge(
  // Capital evaluation (京察), provincial evaluation (大計), the Hanlin's (大考), military merit (軍功)
  each(
    MINISTRIES.flatMap((m) => ['zhushi', 'yuanwailang', 'langzhong'].map((post) => `${m}-${post}`)),
    { rou: 'jingcha' },
  ),
  each(['jianchayushi', 'jishizhong', 'dali-pingshi', 'dali-sicheng'], { rou: 'jingcha' }),
  each(
    ['xiancheng', 'zhixian', 'zhoupan', 'zhoutong', 'zhizhou', 'tongpan', 'tongzhi', 'zhifu', 'fenxundao', 'fenshoudao'],
    { rou: 'daji' },
  ),
  each(['jiantao', 'bianxiu', 'xiuzhuan', 'shijiang', 'shidu', 'shijiangxueshi', 'shiduxueshi'], { rou: 'dakao' }),
  each(['bazong', 'qianzong', 'shoubei', 'dusi', 'youji', 'canjiang', 'xiaoqixiao', 'fangyu', 'zuoling'], {
    rou: 'jungong',
  }),
  // Disciplinary review (處分) for the highest civil posts
  each(
    [
      ...MINISTRIES.flatMap((m) => [`${m}-shilang`, `${m}-shangshu`]),
      'anchashi',
      'buzhengshi',
      'xunfu',
      'zongdu',
      'fuduyushi',
      'zuoduyushi',
      'fenxundao',
    ],
    { zang: 'chufen' },
  ),
  // Imperial favour (曠典) for the palace titles and the assistant grand secretary
  each(['taizishaobao', 'taizitaibao', 'shaobao', 'xieban'], { liang: 'kuangdian' }),
  // The lowest posts' graft is dismissal now: nothing leads back to the origins (擁有者 2026-11-12)
  each(['yicheng', 'dianshi', 'xunjian', 'zhubu', 'limu', 'honglu-mingzan'], {
    zang: 'geizhi',
  }),
  {
    // The origins are where the birth roll places a seat and nowhere a move leads: a commoner moves on
    // to study, the military examinations or a post station; a fall from an origin or the first
    // examinations stays where it is
    baiding: { cai: 'wutong', gong: 'wutong', rou: 'baiding' },
    tongsheng: { gong: 'wusheng', rou: 'guoshi-tenglu', zang: 'tongsheng' },
    jiansheng: { zang: 'jiansheng' },
    yinsheng: { zang: 'yinsheng' },
    shengyuan: { zang: 'shengyuan' },
    xiangshi: { zang: 'shengyuan' },
    wutong: { zang: 'wutong' },
    pijia: { zang: 'pijia' },
    juanban: { kind: 'office', zang: 'geizhi' },
    // The grand congratulations: 30 from everyone, as tradition has it
    dahe: { retire: 30 },
    // Dismissal waits for restoration (開復) or exile: rulesFull.ts throws for it, not these moves
    geizhi: { de: 'geizhi', cai: 'geizhi', gong: 'geizhi', liang: 'geizhi', rou: 'geizhi', zang: 'changshu' },
  },
  {
    // Offered posts and minor posts, from below
    jiansheng: { liang: 'huidian-tenglu', rou: 'tianwensheng' },
    'personnel-zhushi': { liang: 'zongren-zhushi' },
    'honglu-mingzan': { liang: 'qintian-boshi' },
    'taichang-qing': { liang: 'zongren-fucheng' },
    'dali-qing': { liang: 'zongren-fucheng' },
    shengyuan: { liang: 'yishi', rou: 'fanglue-tenglu' },
    fubang: { liang: 'guoshi-tenglu', rou: 'juanban' },
    suigong: { liang: 'taiyi-limu', rou: 'jiaoxi' },
    juren: { liang: 'jiaoxi' },
    jieyuan: { liang: 'zhaoshi' },
    bagong: { liang: 'zhaoshi', rou: 'jiaoxi' },
    datiao: { rou: 'jiaoxi' },
    yicheng: { liang: 'tianwensheng' },
    yinsheng: { rou: 'yishi' },
    dianshi: { liang: 'yishi' },
    xunjian: { liang: 'wucheng-limu' },
    limu: { liang: 'qintian-boshi' },
    // Into the new departments
    bitieshi: { liang: 'neiwu-zhushi' },
    xiaoqixiao: { liang: 'neiwu-zhushi' },
    lanling: { liang: 'zhengyiwei' },
    sandeng: { liang: 'zhiyizheng' },
    xiuzhuan: { liang: 'qijuzhu' },
    shijiangxueshi: { liang: 'nanshufang' },
    shiduxueshi: { liang: 'nanshufang' },
    jiantao: { liang: 'fukaoguan' },
    shidu: { liang: 'zhengkaoguan' },
    jianchayushi: { liang: 'xunchengyushi' },
    jingli: { liang: 'yanke-dashi' },
    tongzhi: { liang: 'guanhe-tongzhi' },
    tongpan: { liang: 'wei-qianzong' },
    fenshoudao: { liang: 'hedao' },
    fenxundao: { liang: 'liangdao' },
    'revenue-yuanwailang': { liang: 'cang-jiandu' },
    caoyun: { liang: 'cangchang-shilang' },
    // Commissions: rolling graft costs a fine; examiners and education commissioners pay more
    xuezheng: { fine: 15 },
    yanyunshi: { fine: 10 },
    junjizhangjing: { fine: 10 },
    // Concurrent honorary titles: a governor-general held a minister's, a governor a vice-minister's
    zongdu: { title: true },
    xunfu: { title: true },
  },
)

function merge(...parts: Readonly<Record<string, Change>>[]): Record<string, Change> {
  const all: Record<string, Change> = {}
  for (const part of parts) {
    for (const [id, change] of Object.entries(part)) all[id] = { ...all[id], ...change }
  }
  return all
}

function changed(old: FullCell): FullCell {
  const change = V2_CHANGES[old.id]
  const dept = V2_DEPT[old.id] ?? old.dept
  if (change === undefined && dept === old.dept) return old
  const { fine, title, kind, retire, ...faces } = change ?? {}
  return {
    ...old,
    dept,
    moves: { ...old.moves, ...faces },
    kind: kind ?? old.kind,
    retire: retire ?? old.retire,
    fine: fine ?? old.fine,
    title: title ?? old.title,
    // Graft into a review: the review's `down` is where graft led before
    demote: faces.zang === 'chufen' ? old.moves.zang : null,
  }
}

/** Each department's cells together and lowest first, in FULL_DEPARTMENTS order */
function byDepartment(cells: readonly FullCell[]): FullCell[] {
  const order = new Map(Object.keys(FULL_DEPARTMENTS).map((id, at) => [id, at]))
  const moved = (entry: FullCell) => V2_DEPT[entry.id] !== undefined
  return cells
    .map((entry, at) => ({ entry, at }))
    .sort(
      (a, b) =>
        (order.get(a.entry.dept) as number) - (order.get(b.entry.dept) as number) ||
        (moved(a.entry) || moved(b.entry) ? a.entry.rank - b.entry.rank : 0) ||
        a.at - b.at,
    )
    .map(({ entry }) => entry)
}

export const BOARD_FULL_V2: readonly FullCell[] = byDepartment([
  ...BOARD_FULL.filter((entry) => !V2_DROPPED.has(entry.id)).map(changed),
  ...NEW_CELLS,
])

/**
 * Where each department of the second board stands on a traditional square board (for C9): rings from
 * the outside in, each a list of departments in order round the ring. The outer ring is where a
 * career starts (origins, examinations, the lowest posts), the inner ones hold higher offices, and the
 * centre the common pot (公注) with the ends of a career and the peerage. A department's cells go
 * round in board order, lowest first (`BOARD_FULL_V2` keeps each department's cells together that way)
 */
export const FULL_RINGS: readonly (readonly FullDeptId[])[] = [
  ['origin', 'exam', 'tenglu', 'juanna', 'wuke', 'ying', 'xian', 'zhou', 'jiaozhi', 'qintianjian', 'taiyiyuan', 'wucheng', 'zhongshuke', 'honglusi'],
  ['fu', 'dao', 'xueyuan', 'yanyuan', 'heyuan', 'caoyuan', 'qiying', 'zhen', 'guozijian', 'cangchang', 'guanglusi', 'taichangsi', 'taipusi', 'tongzhengsi', 'dalisi'],
  ['sansi', 'dufu', 'shiwei', 'luanyiwei', 'qitong', 'personnel', 'revenue', 'rites', 'war', 'justice', 'works', 'duchayuan', 'hanlin', 'zhanshifu', 'neige', 'zongrenfu', 'neiwufu', 'kaoji'],
  ['junji', 'neiting', 'daxueshi', 'gongxian'],
]
/** The centre of the square board: the pot, then these */
export const FULL_CENTRE: readonly FullDeptId[] = ['jue', 'end']

/** The rules versions there are: 1 is C6's (every game started before C8), 2 is C8's */
export type RulesVersion = 1 | 2
export const LATEST_RULES = 2 as const

/** One version's board: its cells and departments, and a cell by id */
export type FullBoard = {
  version: RulesVersion
  cells: readonly FullCell[]
  /** The departments with cells on this board, in FULL_DEPARTMENTS order */
  depts: readonly FullDeptId[]
  /** The cell with this id. Every id in a state comes from its board, so a miss is a bug: it throws */
  get(id: string): FullCell
  has(id: string): boolean
}

function makeBoard(version: RulesVersion, cells: readonly FullCell[]): FullBoard {
  const byId: ReadonlyMap<string, FullCell> = new Map(cells.map((entry) => [entry.id, entry]))
  const used = new Set(cells.map((entry) => entry.dept))
  return {
    version,
    cells,
    depts: (Object.keys(FULL_DEPARTMENTS) as FullDeptId[]).filter((id) => used.has(id)),
    get(id) {
      const found = byId.get(id)
      if (found === undefined) throw new Error(`promotion: no full-edition cell "${id}" (v${version})`)
      return found
    },
    has: (id) => byId.has(id),
  }
}

const BOARDS: Readonly<Record<RulesVersion, FullBoard>> = {
  1: makeBoard(1, BOARD_FULL),
  2: makeBoard(2, BOARD_FULL_V2),
}

/** The board a game plays on, by its state's `rulesVersion`; none is 1, a game from before C8 */
export const fullBoard = (version: number | undefined): FullBoard => BOARDS[version === 2 ? 2 : 1]

/**
 * The offices a seat may buy instead of a minor post (捐納, C8), lowest first. The caps are
 * historical: in the capital up to a director (郎中, senior fifth grade), in the provinces up to an
 * intendant (道員, senior fourth grade).
 */
export const BUY_CAPITAL: readonly string[] = [
  'zhongshu',
  'revenue-zhushi',
  'revenue-yuanwailang',
  'revenue-langzhong',
]
export const BUY_PROVINCES: readonly string[] = [
  'zhixian',
  'tongpan',
  'zhizhou',
  'tongzhi',
  'zhifu',
  'fenshoudao',
]
