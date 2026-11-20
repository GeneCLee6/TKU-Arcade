// 2026-11-20 (docs/KART-NETCODE.md §11.4): a replay kept as a file or a link. Registered by the
// screens that offer it (src/kart/watch/replayMessages.ts), each a lazy chunk, so the room's first
// screen does not carry them; screenMessages.ts lists them for check-i18n. `en` is the source.
const en = {
  'games.kart.replay.download': 'Download replay',
  'games.kart.replay.copyLink': 'Copy replay link',
  'games.kart.replay.copied': 'Link copied',
  'games.kart.replay.fileTitle': 'Watch a replay file',
  'games.kart.replay.fileHelp':
    'Pick a .tkureplay file saved after a race (Download replay on the results). It plays here, in this browser: nothing is uploaded.',
  'games.kart.replay.pick': 'Choose a replay file',
  'games.kart.replay.reading': 'Reading the replay…',
  'games.kart.replay.toMenu': 'Back to the karts',
  'games.kart.replay.problem.notReplay': 'That file is not a replay.',
  'games.kart.replay.problem.version':
    'That replay was saved by a newer version of the game. Reload the page and try again.',
  'games.kart.replay.problem.tooBig': 'That file is too big to be a replay.',
  'games.kart.replay.problem.broken': 'That replay is damaged and cannot be played.',
  'games.kart.replay.problem.track': 'The track this replay was raced on is not here.',
  'games.kart.replay.problem.link': 'This link holds no replay. It may have been cut short.',
  'games.kart.replay.revision':
    'The track has changed since this race: the karts may not line up with the road.',
  'games.kart.replay.seat': 'Racer {seat}',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.kart.replay.download': '下載重播',
  'games.kart.replay.copyLink': '複製重播連結',
  'games.kart.replay.copied': '已複製連結',
  'games.kart.replay.fileTitle': '看重播檔',
  'games.kart.replay.fileHelp':
    '選一個比賽後存下的 .tkureplay 檔（結果畫面的「下載重播」）。只在這個瀏覽器裡播放，不會上傳。',
  'games.kart.replay.pick': '選擇重播檔',
  'games.kart.replay.reading': '正在讀取重播…',
  'games.kart.replay.toMenu': '回卡丁車',
  'games.kart.replay.problem.notReplay': '這個檔案不是重播檔。',
  'games.kart.replay.problem.version': '這個重播是較新版本的遊戲存的。請重新整理頁面再試一次。',
  'games.kart.replay.problem.tooBig': '這個檔案太大，不是重播檔。',
  'games.kart.replay.problem.broken': '這個重播檔已損壞，無法播放。',
  'games.kart.replay.problem.track': '找不到這場重播用的賽道。',
  'games.kart.replay.problem.link': '這個連結裡沒有重播，可能被截斷了。',
  'games.kart.replay.revision': '這條賽道在比賽後改過路線，車子可能對不上路面。',
  'games.kart.replay.seat': '車手 {seat}',
}

export const kartReplayFileMessages = { en, 'zh-TW': zhTW }
