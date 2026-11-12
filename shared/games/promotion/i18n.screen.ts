// What only the board needs: department plaques and rank seals (e3-t08).
// Loaded with the screen (src/games/promotion/), so that it costs the lobby and the other games
// nothing. Words the board does not draw are in i18n.detail.ts, out of the board font's request. check-i18n and `npm run play` find it through shared/games/screenMessages.ts. `en` is the source.
const en = {
  'games.promotion.dept.top': 'Highest Offices',
  'games.promotion.dept.guard': 'Imperial Guard',
  'games.promotion.dept.hanlin': 'Hanlin Academy',
  'games.promotion.dept.army': 'Green Standard Army',
  'games.promotion.dept.capital': 'Capital Ministries',
  'games.promotion.dept.local': 'Provincial Posts',
  'games.promotion.dept.wuke': 'Military Exams',
  'games.promotion.dept.exam': 'Civil Exams',
  'games.promotion.end.motto': 'Retire home · first one there wins',
  'games.promotion.ui.boardLabel': 'Promotion board of {count} offices in eight departments',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.promotion.dept.top': '中樞',
  'games.promotion.dept.guard': '侍衛處',
  'games.promotion.dept.hanlin': '翰林院',
  'games.promotion.dept.army': '綠營武職',
  'games.promotion.dept.capital': '京師部院',
  'games.promotion.dept.local': '地方官',
  'games.promotion.dept.wuke': '武科',
  'games.promotion.dept.exam': '科舉',
  'games.promotion.end.motto': '致仕還鄉・先到者勝',
  'games.promotion.ui.boardLabel': '陞官圖圖版，八個部門共 {count} 個官職',
}

const GRADES = '九八七六五四三二一'

/**
 * The red seal in a cell's corner, for ranks 0 to 23: short, as it has the room of a stamp. Chinese
 * says the grade as the details do (games.promotion.rank.<n>); English abbreviates it
 */
function seals(locale: 'en' | 'zh-TW'): Record<string, string> {
  const zh = locale === 'zh-TW'
  return Object.fromEntries(
    Array.from({ length: 24 }, (_, rank) => {
      const grade = 9 - Math.floor((rank - 6) / 2)
      const senior = rank % 2 === 1
      let text: string
      if (rank >= 6) text = zh ? `${senior ? '正' : '從'}${GRADES[9 - grade]}品` : `${senior ? 'Sr' : 'Jr'} ${grade}`
      else if (rank === 5) text = zh ? '未入流' : 'Unranked'
      else if (rank > 0) text = zh ? '未仕' : 'Exam'
      else text = zh ? '白身' : 'None'
      return [`games.promotion.seal.${rank}`, text]
    }),
  )
}

export const promotionScreenMessages = {
  en: { ...en, ...seals('en') } as Record<string, string>,
  'zh-TW': { ...zhTW, ...seals('zh-TW') } as Record<string, string>,
}
