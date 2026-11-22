// The team race's strings (2026-11-18, shared/kart/team.ts): the waiting room's sides, the race's
// team HUD and the team result. Registered by the race screen's chunk and by the waiting room's
// team picker (its own lazy chunk), so not in anyone's first load; screenMessages.ts lists them for
// check-i18n. The team names, the team gauge and the blue boost (High Tide) are names of our own,
// settled by the owner on 2026-11-22 (docs/KART-WORLD.md). `en` is the source.
const en = {
  'games.kart.team.red': 'Sunset',
  'games.kart.team.blue': 'Estuary',
  'games.kart.team.title': 'Teams',
  'games.kart.team.hint':
    'Pick a side. Anyone who has not is put on the smaller team when the race starts.',
  'games.kart.team.hostHint': 'As the host you can move anyone, computer karts too.',
  'games.kart.team.auto': 'auto',
  'games.kart.team.put': 'Put {name} on {team}',
  'games.kart.team.balance': 'Balance the teams',
  'games.kart.team.sizes': 'Sunset {red} v Estuary {blue}',
  'games.kart.team.scoring':
    'Places score 10, 8, 6, 5, 4, 3, 2, 1. Each team counts its best {count}; the higher total wins.',
  'games.kart.team.score': 'Team score: Sunset {red}, Estuary {blue}',
  'games.kart.team.gauge': 'Team gauge',
  'games.kart.team.percent': '{value}%',
  'games.kart.team.turns': 'Full: the boosts you hold turn blue (High Tide)',
  'games.kart.team.burning': 'High Tide',
  'games.kart.team.granted': 'Team gauge full: the boosts you hold are High Tide now!',
  'games.kart.team.grantedNone': 'Team gauge full, but you held no boost to turn blue',
  'games.kart.team.gauges': 'Team gauges',
  'games.kart.team.gaugeOf': '{team} team gauge',
  'games.kart.team.points': '{points} pts',
  'games.kart.result.redWon': 'Sunset wins, {red} to {blue}',
  'games.kart.result.blueWon': 'Estuary wins, {blue} to {red}',
  'games.kart.result.teamDraw': 'Nobody finished: neither team wins',
  'games.kart.note.redTime': 'Sunset · finished in {time}',
  'games.kart.note.blueTime': 'Estuary · finished in {time}',
  'games.kart.note.redOut': 'Sunset · did not finish ({laps} laps)',
  'games.kart.note.blueOut': 'Estuary · did not finish ({laps} laps)',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.kart.team.red': '夕照隊',
  'games.kart.team.blue': '河口隊',
  'games.kart.team.title': '分隊',
  'games.kart.team.hint': '選一隊。沒選的人開賽時自動排到人少的那一隊。',
  'games.kart.team.hostHint': '房主可以幫任何人換隊，電腦車也可以。',
  'games.kart.team.auto': '自動',
  'games.kart.team.put': '把 {name} 排到{team}',
  'games.kart.team.balance': '自動平衡',
  'games.kart.team.sizes': '夕照隊 {red} 人對河口隊 {blue} 人',
  'games.kart.team.scoring':
    '名次得分 10、8、6、5、4、3、2、1。每隊取最好的 {count} 台相加，總分高的那一隊贏。',
  'games.kart.team.score': '隊伍總分：夕照隊 {red}，河口隊 {blue}',
  'games.kart.team.gauge': '同舟條',
  'games.kart.team.percent': '{value}%',
  'games.kart.team.turns': '滿了：手上的噴射變成藍色的漲潮',
  'games.kart.team.burning': '漲潮',
  'games.kart.team.granted': '同舟條滿了：你手上的噴射變成漲潮！',
  'games.kart.team.grantedNone': '同舟條滿了，可是你手上沒有噴射可以變成漲潮',
  'games.kart.team.gauges': '兩隊的同舟條',
  'games.kart.team.gaugeOf': '{team}的同舟條',
  'games.kart.team.points': '{points} 分',
  'games.kart.result.redWon': '夕照隊獲勝，{red} 比 {blue}',
  'games.kart.result.blueWon': '河口隊獲勝，{blue} 比 {red}',
  'games.kart.result.teamDraw': '沒有人完賽：兩隊都不算贏',
  'games.kart.note.redTime': '夕照隊 · 完賽 {time}',
  'games.kart.note.blueTime': '河口隊 · 完賽 {time}',
  'games.kart.note.redOut': '夕照隊 · 未完賽（{laps} 圈）',
  'games.kart.note.blueOut': '河口隊 · 未完賽（{laps} 圈）',
}

export const kartTeamMessages = { en, 'zh-TW': zhTW }
