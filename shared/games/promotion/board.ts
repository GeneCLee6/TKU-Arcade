// The promotion board: pure data, drawn by the board UI and walked by rules.ts. A simplified Qing
// ladder written for this project: real titles and ranks (mid to late Qing, one post per title),
// but which post leads where is a game design, not history. Say so wherever it is shown.
//
// `BOARD` is in order of seniority, lowest first, and the tests hold every entry to it:
//
// - `rank` never falls along the array, so sorting is never needed;
// - de, cai and gong always lead to a later cell, with de going at least as high as cai and cai at
//   least as high as gong;
// - zang always leads to a strictly lower rank (the bottom cell, having nowhere to fall, stays).
//
// Cell ids are stored in running games, so renaming or removing one breaks live rooms: add instead.
// Any change to a move also changes what an old replay (seed + actions) plays out to.

/** The four results of a roll: virtue, talent, merit and graft */
export const FACES = ['de', 'cai', 'gong', 'zang'] as const
export type Face = (typeof FACES)[number]

/**
 * Seniority, the one number offices compare by. Ranks 0 to 4 are people without a post (commoner,
 * then examination standing), 5 is a post below the nine grades, 6 to 23 are the eighteen grades
 * from junior ninth to senior first, and 24 is the end of the board. Each has a label,
 * `games.promotion.rank.<n>`.
 */
export const MAX_RANK = 24

const COMMONER = 0
const CANDIDATE = 1
const LICENTIATE = 2
const GRADUATE = 3
const METROPOLITAN = 4
const UNCLASSED = 5
const J9 = 6
const S9 = 7
const J8 = 8
const S8 = 9
const J7 = 10
const S7 = 11
const J6 = 12
const S6 = 13
const J5 = 14
const S5 = 15
const J4 = 16
const S4 = 17
const J3 = 18
const S3 = 19
const J2 = 20
const S2 = 21
const J1 = 22
const S1 = 23

export type BoardCell = {
  /** Stable forever: see the top of this file */
  id: string
  /** The title; English is a transliteration with a short gloss, as the epic asks */
  name: { 'zh-TW': string; en: string }
  rank: number
  /** Where each result of a roll leads from here */
  moves: Record<Face, string>
}

type Names = [id: string, zh: string, en: string]
type Moves = [de: string, cai: string, gong: string, zang: string]

const cell = ([id, zh, en]: Names, rank: number, [de, cai, gong, zang]: Moves): BoardCell => ({
  id,
  name: { 'zh-TW': zh, en },
  rank,
  moves: { de, cai, gong, zang },
})

export const START_CELL = 'baiding'
export const END_CELL = 'ronggui'

export const BOARD: readonly BoardCell[] = [
  // ── No post: commoner and examination standing ──
  cell(['baiding', '白丁', 'Baiding (Commoner)'], COMMONER, [
    'shengyuan',
    'tongsheng',
    'wutong',
    'baiding',
  ]),
  cell(['wutong', '武童', 'Wutong (Military Candidate)'], CANDIDATE, [
    'wuju',
    'jiansheng',
    'wusheng',
    'baiding',
  ]),
  cell(['tongsheng', '童生', 'Tongsheng (Exam Candidate)'], CANDIDATE, [
    'gongsheng',
    'shengyuan',
    'jiansheng',
    'baiding',
  ]),
  cell(['wusheng', '武生', 'Wusheng (Military Licentiate)'], LICENTIATE, [
    'ewaiwaiwei',
    'wuju',
    'wuju',
    'wutong',
  ]),
  cell(['shengyuan', '生員', 'Shengyuan (County Scholar)'], LICENTIATE, [
    'juren',
    'gongsheng',
    'jiansheng',
    'tongsheng',
  ]),
  cell(['jiansheng', '監生', 'Jiansheng (Academy Student)'], LICENTIATE, [
    'zhubu',
    'yicheng',
    'gongsheng',
    'tongsheng',
  ]),
  cell(['wuju', '武舉', 'Wuju (Military Provincial Graduate)'], GRADUATE, [
    'waiweiqianzong',
    'wuzhuangyuan',
    'wujinshi',
    'wusheng',
  ]),
  cell(['gongsheng', '貢生', 'Gongsheng (Tribute Student)'], GRADUATE, [
    'xundao',
    'juren',
    'juren',
    'jiansheng',
  ]),
  cell(['juren', '舉人', 'Juren (Provincial Graduate)'], GRADUATE, [
    'jiaoyu',
    'xundao',
    'gongshi',
    'shengyuan',
  ]),
  cell(['gongshi', '貢士', 'Gongshi (Palace Exam Candidate)'], METROPOLITAN, [
    'zhuangyuan',
    'bangyan',
    'jinshi',
    'juren',
  ]),
  cell(['wujinshi', '武進士', 'Wu Jinshi (Military Metropolitan Graduate)'], METROPOLITAN, [
    'shoubei',
    'qianzong',
    'bazong',
    'wuju',
  ]),
  cell(['jinshi', '進士', 'Jinshi (Metropolitan Graduate)'], METROPOLITAN, [
    'tanhua',
    'shujishi',
    'shujishi',
    'juren',
  ]),
  cell(['shujishi', '庶吉士', 'Shujishi (Hanlin Bachelor)'], METROPOLITAN, [
    'bianxiu',
    'jiantao',
    'jiantao',
    'juren',
  ]),
  cell(['tanhua', '探花', 'Tanhua (Third in the Palace Exam)'], METROPOLITAN, [
    'xiuzhuan',
    'bianxiu',
    'bianxiu',
    'juren',
  ]),
  cell(['bangyan', '榜眼', 'Bangyan (Second in the Palace Exam)'], METROPOLITAN, [
    'xiuzhuan',
    'bianxiu',
    'bianxiu',
    'juren',
  ]),
  cell(['wuzhuangyuan', '武狀元', 'Wu Zhuangyuan (Top Military Graduate)'], METROPOLITAN, [
    'sandengshiwei',
    'lanling',
    'lanling',
    'wuju',
  ]),
  cell(['zhuangyuan', '狀元', 'Zhuangyuan (Top Scholar)'], METROPOLITAN, [
    'zhushi',
    'xiuzhuan',
    'xiuzhuan',
    'juren',
  ]),

  // ── Below the nine grades ──
  cell(['yicheng', '驛丞', 'Yicheng (Post Station Master)'], UNCLASSED, [
    'zhubu',
    'xunjian',
    'dianshi',
    'jiansheng',
  ]),
  cell(['dianshi', '典史', 'Dianshi (County Warden)'], UNCLASSED, [
    'zhubu',
    'xunjian',
    'xunjian',
    'jiansheng',
  ]),

  // ── Junior ninth ──
  cell(['ewaiwaiwei', '額外外委', 'Ewai Waiwei (Supernumerary Ensign)'], J9, [
    'waiweiqianzong',
    'waiweibazong',
    'waiweibazong',
    'wusheng',
  ]),
  cell(['xunjian', '巡檢', 'Xunjian (Patrol Inspector)'], J9, [
    'xundao',
    'zhubu',
    'zhubu',
    'dianshi',
  ]),

  // ── Senior ninth ──
  cell(['waiweibazong', '外委把總', 'Waiwei Bazong (Acting Sub-Lieutenant)'], S9, [
    'bazong',
    'waiweiqianzong',
    'waiweiqianzong',
    'ewaiwaiwei',
  ]),
  cell(['zhubu', '主簿', 'Zhubu (County Registrar)'], S9, ['jiaoyu', 'xundao', 'xundao', 'dianshi']),

  // ── Junior eighth ──
  cell(['xundao', '訓導', 'Xundao (Assistant Instructor)'], J8, [
    'zhoupan',
    'jiaoyu',
    'xiancheng',
    'zhubu',
  ]),

  // ── Senior eighth ──
  cell(['waiweiqianzong', '外委千總', 'Waiwei Qianzong (Acting Lieutenant)'], S8, [
    'qianzong',
    'bazong',
    'bazong',
    'ewaiwaiwei',
  ]),
  cell(['jiaoyu', '教諭', 'Jiaoyu (County Instructor)'], S8, [
    'bianxiu',
    'neigezhongshu',
    'zhoupan',
    'xundao',
  ]),
  cell(['xiancheng', '縣丞', 'Xiancheng (Vice Magistrate)'], S8, [
    'zhixian',
    'zhoupan',
    'zhoupan',
    'zhubu',
  ]),

  // ── Junior seventh ──
  cell(['zhoupan', '州判', 'Zhoupan (Department Judge)'], J7, [
    'zhoutong',
    'zhixian',
    'zhixian',
    'zhubu',
  ]),
  cell(['neigezhongshu', '內閣中書', 'Neige Zhongshu (Grand Secretariat Drafter)'], J7, [
    'xiuzhuan',
    'bianxiu',
    'bianxiu',
    'xundao',
  ]),
  cell(['jiantao', '檢討', 'Jiantao (Hanlin Corrector)'], J7, [
    'xiuzhuan',
    'bianxiu',
    'bianxiu',
    'xundao',
  ]),

  // ── Senior seventh ──
  cell(['bazong', '把總', 'Bazong (Sub-Lieutenant)'], S7, [
    'lanling',
    'qianzong',
    'qianzong',
    'waiweiqianzong',
  ]),
  cell(['zhixian', '知縣', 'Zhixian (County Magistrate)'], S7, [
    'tongpan',
    'xiuzhuan',
    'zhoutong',
    'xiancheng',
  ]),
  cell(['bianxiu', '編修', 'Bianxiu (Hanlin Compiler)'], S7, [
    'zhushi',
    'xiuzhuan',
    'xiuzhuan',
    'jiaoyu',
  ]),

  // ── Junior sixth ──
  cell(['zhoutong', '州同', 'Zhoutong (Assistant Department Magistrate)'], J6, [
    'zhizhou',
    'zhushi',
    'tongpan',
    'zhoupan',
  ]),
  cell(['xiuzhuan', '修撰', 'Xiuzhuan (Senior Hanlin Compiler)'], J6, [
    'yushi',
    'zhushi',
    'zhushi',
    'jiantao',
  ]),

  // ── Senior sixth ──
  cell(['qianzong', '千總', 'Qianzong (Lieutenant)'], S6, [
    'sandengshiwei',
    'shoubei',
    'lanling',
    'bazong',
  ]),
  cell(['lanling', '藍翎侍衛', 'Lanling Shiwei (Blue-Plume Guard)'], S6, [
    'sandengshiwei',
    'shoubei',
    'shoubei',
    'bazong',
  ]),
  cell(['tongpan', '通判', 'Tongpan (Prefectural Judge)'], S6, [
    'tongzhi',
    'zhizhou',
    'zhizhou',
    'zhixian',
  ]),
  cell(['zhushi', '主事', 'Zhushi (Ministry Secretary)'], S6, [
    'langzhong',
    'yushi',
    'yuanwailang',
    'bianxiu',
  ]),

  // ── Junior fifth ──
  cell(['zhizhou', '知州', 'Zhizhou (Department Magistrate)'], J5, [
    'zhifu',
    'tongzhi',
    'tongzhi',
    'zhixian',
  ]),
  cell(['yuanwailang', '員外郎', 'Yuanwailang (Vice Director)'], J5, [
    'jijiu',
    'langzhong',
    'jishizhong',
    'xiuzhuan',
  ]),
  cell(['yushi', '監察御史', 'Yushi (Censor)'], J5, [
    'shiduxueshi',
    'jishizhong',
    'jishizhong',
    'xiuzhuan',
  ]),

  // ── Senior fifth ──
  cell(['shoubei', '守備', 'Shoubei (Captain)'], S5, [
    'dusi',
    'sandengshiwei',
    'sandengshiwei',
    'qianzong',
  ]),
  cell(['sandengshiwei', '三等侍衛', 'Sandeng Shiwei (Guard, Third Class)'], S5, [
    'erdengshiwei',
    'dusi',
    'dusi',
    'lanling',
  ]),
  cell(['tongzhi', '同知', 'Tongzhi (Vice Prefect)'], S5, ['daoyuan', 'zhifu', 'zhifu', 'tongpan']),
  cell(['langzhong', '郎中', 'Langzhong (Bureau Director)'], S5, [
    'shaoqing',
    'jijiu',
    'shiduxueshi',
    'zhushi',
  ]),
  cell(['jishizhong', '給事中', 'Jishizhong (Supervising Censor)'], S5, [
    'shaoqing',
    'shiduxueshi',
    'shiduxueshi',
    'zhushi',
  ]),

  // ── Junior fourth ──
  cell(['zhifu', '知府', 'Zhifu (Prefect)'], J4, ['yanyunshi', 'daoyuan', 'daoyuan', 'zhizhou']),
  cell(['jijiu', '國子監祭酒', 'Jijiu (Academy Chancellor)'], J4, [
    'guanglu',
    'shaoqing',
    'shaoqing',
    'yuanwailang',
  ]),
  cell(['shiduxueshi', '侍讀學士', 'Shidu Xueshi (Hanlin Reader-in-Waiting)'], J4, [
    'guanglu',
    'shaoqing',
    'shaoqing',
    'yushi',
  ]),

  // ── Senior fourth ──
  cell(['dusi', '都司', 'Dusi (Major)'], S4, ['youji', 'erdengshiwei', 'erdengshiwei', 'shoubei']),
  cell(['erdengshiwei', '二等侍衛', 'Erdeng Shiwei (Guard, Second Class)'], S4, [
    'canjiang',
    'youji',
    'youji',
    'sandengshiwei',
  ]),
  cell(['daoyuan', '道員', 'Daoyuan (Circuit Intendant)'], S4, [
    'anchashi',
    'yanyunshi',
    'yanyunshi',
    'tongzhi',
  ]),
  cell(['shaoqing', '大理寺少卿', 'Dali Shaoqing (Vice Chief Justice)'], S4, [
    'daliqing',
    'guanglu',
    'guanglu',
    'langzhong',
  ]),

  // ── Junior third ──
  cell(['youji', '游擊', 'Youji (Lieutenant Colonel)'], J3, [
    'fujiang',
    'canjiang',
    'canjiang',
    'shoubei',
  ]),
  cell(['yanyunshi', '鹽運使', 'Yanyunshi (Salt Controller)'], J3, [
    'buzhengshi',
    'anchashi',
    'anchashi',
    'tongzhi',
  ]),
  cell(['guanglu', '光祿寺卿', 'Guanglu Qing (Chief Minister of Banquets)'], J3, [
    'neigexueshi',
    'fuduyushi',
    'daliqing',
    'langzhong',
  ]),

  // ── Senior third ──
  cell(['canjiang', '參將', 'Canjiang (Colonel)'], S3, [
    'fujiang',
    'yidengshiwei',
    'yidengshiwei',
    'dusi',
  ]),
  cell(['yidengshiwei', '一等侍衛', 'Yideng Shiwei (Guard, First Class)'], S3, [
    'zongbing',
    'fujiang',
    'fujiang',
    'erdengshiwei',
  ]),
  cell(['anchashi', '按察使', 'Anchashi (Provincial Judge)'], S3, [
    'shilang',
    'buzhengshi',
    'buzhengshi',
    'zhifu',
  ]),
  cell(['fuduyushi', '左副都御史', 'Fu Duyushi (Vice Censor-in-Chief)'], S3, [
    'shilang',
    'neigexueshi',
    'daliqing',
    'jijiu',
  ]),
  cell(['daliqing', '大理寺卿', 'Dali Qing (Chief Justice)'], S3, [
    'shilang',
    'neigexueshi',
    'neigexueshi',
    'shaoqing',
  ]),

  // ── Junior second ──
  cell(['fujiang', '副將', 'Fujiang (Deputy General)'], J2, [
    'tidu',
    'zongbing',
    'zongbing',
    'youji',
  ]),
  cell(['buzhengshi', '布政使', 'Buzhengshi (Provincial Treasurer)'], J2, [
    'zongdu',
    'xunfu',
    'xunfu',
    'daoyuan',
  ]),
  cell(['neigexueshi', '內閣學士', 'Neige Xueshi (Grand Secretariat Academician)'], J2, [
    'shangshu',
    'shilang',
    'shilang',
    'guanglu',
  ]),
  cell(['xunfu', '巡撫', 'Xunfu (Provincial Governor)'], J2, [
    'shangshu',
    'zongdu',
    'zongdu',
    'yanyunshi',
  ]),

  // ── Senior second ──
  cell(['zongbing', '總兵', 'Zongbing (Regional Commander)'], S2, [
    'jiangjun',
    'tidu',
    'tidu',
    'youji',
  ]),
  cell(['shilang', '侍郎', 'Shilang (Vice Minister)'], S2, [
    'zuoduyushi',
    'shangshu',
    'shangshu',
    'fuduyushi',
  ]),
  cell(['zongdu', '總督', 'Zongdu (Viceroy)'], S2, [
    'xiebandaxueshi',
    'shangshu',
    'shangshu',
    'anchashi',
  ]),

  // ── Junior first ──
  cell(['tidu', '提督', 'Tidu (Provincial Commander-in-Chief)'], J1, [
    'lingshiwei',
    'jiangjun',
    'jiangjun',
    'canjiang',
  ]),
  cell(['jiangjun', '將軍', 'Jiangjun (Garrison General)'], J1, [
    'lingshiwei',
    'lingshiwei',
    'lingshiwei',
    'canjiang',
  ]),
  cell(['shangshu', '尚書', 'Shangshu (Minister)'], J1, [
    'daxueshi',
    'xiebandaxueshi',
    'zuoduyushi',
    'buzhengshi',
  ]),
  cell(['zuoduyushi', '左都御史', 'Zuo Duyushi (Censor-in-Chief)'], J1, [
    'daxueshi',
    'xiebandaxueshi',
    'xiebandaxueshi',
    'fuduyushi',
  ]),
  cell(['xiebandaxueshi', '協辦大學士', 'Xieban Daxueshi (Assistant Grand Secretary)'], J1, [
    'daxueshi',
    'daxueshi',
    'daxueshi',
    'neigexueshi',
  ]),

  // ── Senior first ──
  cell(['lingshiwei', '領侍衛內大臣', 'Ling Shiwei Neidachen (Chamberlain of the Guard)'], S1, [
    'taishi',
    'taibao',
    'taibao',
    'zongbing',
  ]),
  cell(['daxueshi', '大學士', 'Daxueshi (Grand Secretary)'], S1, [
    'taishi',
    'taibao',
    'taibao',
    'shilang',
  ]),
  cell(['taibao', '太保', 'Taibao (Grand Guardian)'], S1, [END_CELL, 'taishi', 'taishi', 'zongdu']),
  cell(['taishi', '太師', 'Taishi (Grand Preceptor)'], S1, [
    END_CELL,
    END_CELL,
    END_CELL,
    'xiebandaxueshi',
  ]),

  // ── The end: the game stops here, so these moves are never rolled ──
  cell([END_CELL, '榮歸', 'Ronggui (Retired in Glory)'], MAX_RANK, [
    END_CELL,
    END_CELL,
    END_CELL,
    END_CELL,
  ]),
]

const CELL_BY_ID: ReadonlyMap<string, BoardCell> = new Map(BOARD.map((entry) => [entry.id, entry]))

/** The cell with this id. Every id in a state comes from this board, so a miss is a bug: it throws */
export function getCell(id: string): BoardCell {
  const found = CELL_BY_ID.get(id)
  if (found === undefined) throw new Error(`promotion: no cell "${id}"`)
  return found
}
