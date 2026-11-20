// The word lists the nickname check uses (e12-t06, shared/nickname.ts). Edit freely: one entry per
// line, lower case. Matching folds width and case first (NFKC), so ＡＤＭＩＮ is admin; 管理员 and
// 管理員 are listed separately because folding does not turn simplified into traditional.
//
// Keep the lists short and obvious: they go to every visitor's first load, and a list that refuses
// ordinary words (幹部, Ghostface, Scunthorpe) is worse than one that misses a creative spelling.
// The host can always kick someone; this only keeps the plainest abuse out of the seat list.

/**
 * Names that pass for the site or its roles. Latin words match the whole name, letters only
 * (`Admin`, `admin_01`, `[SYSTEM]`), never part of a longer word (`Badminton` passes)
 */
export const RESERVED_LATIN = [
  'admin',
  'administrator',
  'moderator',
  'mod',
  'system',
  'host',
  'owner',
  'staff',
  'official',
  'support',
  'root',
  'tkuarcade',
] as const

/** Names that pass for the site or its roles, refused anywhere in the name (`系統公告`) */
export const RESERVED_CJK = [
  '房主',
  '管理員',
  '管理员',
  '管理者',
  '系統',
  '系统',
  '站長',
  '站长',
  '官方',
  '客服',
  '淡江遊樂場',
] as const

/** Latin words refused when they are a whole word of the name (`shit` but not `shiitake`) */
export const BLOCKED_LATIN_WORDS = [
  'shit',
  'shithead',
  'cunt',
  'bitch',
  'whore',
  'slut',
  'asshole',
  'bastard',
  'dickhead',
  'retard',
] as const

/** Refused anywhere in the name, letters only (`f.u.c.k` too): no ordinary word contains them */
export const BLOCKED_ANYWHERE = [
  'fuck',
  'motherf',
  'nigger',
  'nigga',
  'faggot',
  '幹你娘',
  '幹妳娘',
  '操你媽',
  '操你妈',
  '肏',
  '雞掰',
  '機掰',
  '鸡巴',
  '雞巴',
  '屌你',
  '王八蛋',
  '婊子',
  '賤人',
  '贱人',
  '他媽的',
  '他妈的',
  '傻逼',
  '傻屄',
  '去死',
] as const
