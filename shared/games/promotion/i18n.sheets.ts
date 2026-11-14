// The full edition's strings for its two sheets that open later: a cell's details (FullCellDetail)
// and the end-of-game settlement (Settlement). Kept out of i18n.full.ts so that they load with those
// lazy chunks, not with the board's first screen. `en` is the source.
const en = {
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
  'games.promotion.full.detail.offer':
    'An offered post: whoever the dice send here may decline and stay where they were',
  'games.promotion.full.detail.minor':
    'A minor technical post: anyone with the standing (a licentiate or better) may buy a regular office instead, 5 silver a rank step',
  'games.promotion.full.detail.fine': 'A commission: rolling Graft while holding it costs a {amount}-silver fine to the pot',
  'games.promotion.full.detail.title': 'Comes with an honorary title (兼銜): a grade more in the final comparison',
  'games.promotion.full.detail.event': 'An event: a second throw decides by its face, reckoned from the post held',
  'games.promotion.full.detail.restore':
    'Dismissed: on later turns Virtue restores the post, Talent the one below, three Graft exile; anything else waits',
}

const zhTW: Record<keyof typeof en, string> = {
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
  'games.promotion.full.detail.offer': '授職：骰子送到這裡的人可以不接受，留在原地',
  'games.promotion.full.detail.minor': '雜職：有功名（生員、監生以上）的人可以改捐一個正職，高一級付 5 兩',
  'games.promotion.full.detail.fine': '差事：在任上擲到贓，罰 {amount} 兩給公注',
  'games.promotion.full.detail.title': '附帶兼銜：結算對品時多算一級',
  'games.promotion.full.detail.event': '考績：再擲一次，照擲出的那一面、從原來的官職算結果',
  'games.promotion.full.detail.restore': '革職：之後每回合擲德開復原職、擲才降一級開復、擲三個以上的贓發往長戍，其他等下一回合',
}

export const promotionSheetMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
