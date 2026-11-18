// The team race's strings (2026-11-18, shared/kart/team.ts): the waiting room's sides, the race's
// team HUD and the team result. Registered by the race screen's chunk and by the waiting room's
// team picker (its own lazy chunk), so not in anyone's first load; screenMessages.ts lists them for
// check-i18n. The team boost's name is a working title of our own, like every name in the kart's
// world (docs/KART-WORLD.md). `en` is the source.
const en = {
  'games.kart.team.red': 'Red',
  'games.kart.team.blue': 'Blue',
  'games.kart.team.title': 'Teams',
  'games.kart.team.hint':
    'Pick a side. Anyone who has not is put on the smaller team when the race starts.',
  'games.kart.team.hostHint': 'As the host you can move anyone, computer karts too.',
  'games.kart.team.auto': 'auto',
  'games.kart.team.put': 'Put {name} on {team}',
  'games.kart.team.balance': 'Balance the teams',
  'games.kart.team.sizes': 'Red {red} v Blue {blue}',
  'games.kart.team.scoring':
    'Places score 10, 8, 6, 5, 4, 3, 2, 1. Each team counts its best {count}; the higher total wins.',
  'games.kart.team.score': 'Team score: Red {red}, Blue {blue}',
  'games.kart.team.gauge': 'Team gauge',
  'games.kart.team.percent': '{value}%',
  'games.kart.team.turns': 'Full: the boosts you hold turn blue',
  'games.kart.team.burning': 'Blue boost',
  'games.kart.team.granted': 'Team gauge full: the boosts you hold are blue now!',
  'games.kart.team.grantedNone': 'Team gauge full, but you held no boost to turn blue',
  'games.kart.team.gauges': 'Team gauges',
  'games.kart.team.gaugeOf': '{team} team gauge',
  'games.kart.team.points': '{points} pts',
  'games.kart.result.redWon': 'Red team wins, {red} to {blue}',
  'games.kart.result.blueWon': 'Blue team wins, {blue} to {red}',
  'games.kart.result.teamDraw': 'Nobody finished: neither team wins',
  'games.kart.note.redTime': 'Red · finished in {time}',
  'games.kart.note.blueTime': 'Blue · finished in {time}',
  'games.kart.note.redOut': 'Red · did not finish ({laps} laps)',
  'games.kart.note.blueOut': 'Blue · did not finish ({laps} laps)',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.kart.team.red': '紅隊',
  'games.kart.team.blue': '藍隊',
  'games.kart.team.title': '分隊',
  'games.kart.team.hint': '選一隊。沒選的人開賽時自動排到人少的那一隊。',
  'games.kart.team.hostHint': '房主可以幫任何人換隊，電腦車也可以。',
  'games.kart.team.auto': '自動',
  'games.kart.team.put': '把 {name} 排到{team}',
  'games.kart.team.balance': '自動平衡',
  'games.kart.team.sizes': '紅隊 {red} 人對藍隊 {blue} 人',
  'games.kart.team.scoring':
    '名次得分 10、8、6、5、4、3、2、1。每隊取最好的 {count} 台相加，總分高的那一隊贏。',
  'games.kart.team.score': '隊伍總分：紅隊 {red}，藍隊 {blue}',
  'games.kart.team.gauge': '團隊加速條',
  'games.kart.team.percent': '{value}%',
  'games.kart.team.turns': '滿了：手上的噴射變藍色',
  'games.kart.team.burning': '藍色噴射',
  'games.kart.team.granted': '團隊加速條滿了：你手上的噴射變成藍色！',
  'games.kart.team.grantedNone': '團隊加速條滿了，可是你手上沒有噴射可以變藍',
  'games.kart.team.gauges': '兩隊的團隊加速條',
  'games.kart.team.gaugeOf': '{team}團隊加速條',
  'games.kart.team.points': '{points} 分',
  'games.kart.result.redWon': '紅隊獲勝，{red} 比 {blue}',
  'games.kart.result.blueWon': '藍隊獲勝，{blue} 比 {red}',
  'games.kart.result.teamDraw': '沒有人完賽：兩隊都不算贏',
  'games.kart.note.redTime': '紅隊 · 完賽 {time}',
  'games.kart.note.blueTime': '藍隊 · 完賽 {time}',
  'games.kart.note.redOut': '紅隊 · 未完賽（{laps} 圈）',
  'games.kart.note.blueOut': '藍隊 · 未完賽（{laps} 圈）',
}

export const kartTeamMessages = { en, 'zh-TW': zhTW }
