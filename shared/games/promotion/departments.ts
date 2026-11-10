// Which department of the board each cell is drawn in (e3-t08). Pure data next to board.ts, which it
// never changes: ids and moves stay where they are (see the top of board.ts), and this only says
// where a cell sits on the screen. Every cell is in exactly one department; the tests hold it to that.
//
// The grouping is the game's own simplification, like the ladder itself: real Qing offices sorted
// into eight blocks a player can find their way around, not a chart of the bureaucracy.
export const DEPARTMENT_IDS = [
  'top',
  'guard',
  'hanlin',
  'army',
  'capital',
  'local',
  'wuke',
  'exam',
] as const
export type DepartmentId = (typeof DEPARTMENT_IDS)[number]

// Each department's cells, the most senior first, as words: the top block starts with the end of the
// game (END_CELL). Spelled out rather than sorted by rank: the order within a rank is a choice
const LISTS: Record<DepartmentId, string> = {
  top: 'ronggui taishi taibao daxueshi xiebandaxueshi',
  guard: 'lingshiwei yidengshiwei erdengshiwei sandengshiwei lanling',
  hanlin: 'neigexueshi shiduxueshi xiuzhuan bianxiu jiantao neigezhongshu shujishi',
  army:
    'jiangjun tidu zongbing fujiang canjiang youji dusi shoubei qianzong bazong ' +
    'waiweiqianzong waiweibazong ewaiwaiwei',
  capital:
    'zuoduyushi shangshu shilang daliqing fuduyushi guanglu shaoqing jijiu jishizhong ' +
    'langzhong yushi yuanwailang zhushi',
  local:
    'zongdu xunfu buzhengshi anchashi yanyunshi daoyuan zhifu tongzhi zhizhou tongpan ' +
    'zhoutong zhixian zhoupan xiancheng jiaoyu xundao zhubu xunjian dianshi yicheng',
  wuke: 'wuzhuangyuan wujinshi wuju wusheng wutong',
  exam:
    'zhuangyuan bangyan tanhua jinshi gongshi juren gongsheng jiansheng shengyuan tongsheng ' +
    'baiding',
}

/** Each department's cells, the most senior first. The top block starts with the end of the game */
export const DEPARTMENTS: Readonly<Record<DepartmentId, readonly string[]>> = Object.fromEntries(
  DEPARTMENT_IDS.map((id) => [id, LISTS[id].split(' ')]),
) as unknown as Record<DepartmentId, readonly string[]>

/**
 * The colour of the hat button an official of this rank wore, from first grade down to ninth; none
 * for the ranks without a grade. Drawn small and labelled as illustrative: a game's shorthand.
 */
export const KNOBS = [
  'ruby',
  'coral',
  'sapphire',
  'lapis',
  'crystal',
  'shell',
  'gold',
  'engravedGold',
] as const
export type Knob = (typeof KNOBS)[number]

/** Ranks 22–23 are the first grade, 20–21 the second, and so on; 6–9 (eighth and ninth) share one */
export function knobOf(rank: number): Knob | null {
  if (rank < 6 || rank > 23) return null
  const grade = 9 - Math.floor((rank - 6) / 2)
  return KNOBS[Math.min(grade, 8) - 1]
}
