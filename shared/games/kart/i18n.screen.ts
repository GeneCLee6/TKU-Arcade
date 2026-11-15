// The race screen's strings (e9-t03, e9-t07, e9-t08): registered by its lazy chunk, so not in
// anyone's first load; screenMessages.ts lists them for check-i18n. `en` is the source.
const en = {
  'games.kart.error.phase': 'Not now: the race is past that.',
  'games.kart.error.badAction': 'That is not something a racer can do.',
  'games.kart.result.won': 'Race over',
  'games.kart.note.time': 'Finished in {time}',
  'games.kart.note.out': 'Did not finish ({laps} laps)',
  'games.kart.race.loading': 'Loading the track…',
  'games.kart.race.waiting': 'Waiting for everyone on the grid ({ready} of {total})',
  'games.kart.race.ready': 'Get ready',
  'games.kart.race.position': 'Position',
  'games.kart.race.place': '{place} / {total}',
  'games.kart.race.lap': 'Lap {lap} / {laps}',
  'games.kart.race.unstable': 'Connection unstable',
  'games.kart.race.finished': 'Finished',
  'games.kart.race.finishedPlace': 'You finished {place}',
  'games.kart.race.waitingOthers': 'Waiting for the others to finish…',
  'games.kart.race.standings': 'Standings',
  'games.kart.race.racing': 'racing',
  'games.kart.race.out': 'out',
  'games.kart.race.spectating':
    'A race is on. Watching it live comes later: the results show here when it ends.',
  'games.kart.race.noWebgl': 'This browser cannot draw the race (WebGL 2 is needed).',
  'games.kart.race.canvas': 'The race, seen from behind your kart',
  'games.kart.race.you': 'you',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.kart.error.phase': '現在不行：比賽已經過了這一步。',
  'games.kart.error.badAction': '賽車手不能這樣做。',
  'games.kart.result.won': '比賽結束',
  'games.kart.note.time': '完賽 {time}',
  'games.kart.note.out': '未完賽（{laps} 圈）',
  'games.kart.race.loading': '賽道載入中…',
  'games.kart.race.waiting': '等大家到起跑格（{ready}／{total}）',
  'games.kart.race.ready': '準備',
  'games.kart.race.position': '名次',
  'games.kart.race.place': '{place}／{total}',
  'games.kart.race.lap': '第 {lap}／{laps} 圈',
  'games.kart.race.unstable': '連線不穩',
  'games.kart.race.finished': '完賽',
  'games.kart.race.finishedPlace': '你第 {place} 名完賽',
  'games.kart.race.waitingOthers': '等其他人跑完…',
  'games.kart.race.standings': '名次',
  'games.kart.race.racing': '比賽中',
  'games.kart.race.out': '退賽',
  'games.kart.race.spectating': '比賽進行中。觀戰之後才做：比賽結束時這裡會出現結果。',
  'games.kart.race.noWebgl': '這個瀏覽器畫不出比賽（需要 WebGL 2）。',
  'games.kart.race.canvas': '比賽畫面，從你的車後面看',
  'games.kart.race.you': '你',
}

export const kartScreenMessages = { en, 'zh-TW': zhTW }
