// The owner's page (/stats) beyond the daily counts: the per-game switches (e12-t11) and the cost
// dashboard (e12-t15). Registered by src/pages/OwnerPanels.tsx only, so nobody else ever loads
// them; screenMessages.ts lists them for check-i18n. `en` is the source.
const en = {
  'room.extra.owner.games': 'Games: open or paused',
  'room.extra.owner.gamesHint':
    'A paused game is marked on its lobby card and cannot open a room or start a game. A game being played goes on to its end. Takes effect within half a minute.',
  'room.extra.owner.open': 'Open',
  'room.extra.owner.pausedState': 'Paused',
  'room.extra.owner.pause': 'Pause',
  'room.extra.owner.reopen': 'Open again',
  'room.extra.owner.failed': 'That did not work. Try again in a moment.',
  'room.extra.owner.usage': 'Cloudflare usage',
  'room.extra.owner.usageHint':
    'The whole Cloudflare account (every Worker on it), against the {plan} plan. Daily allowances: the busier of yesterday and today (UTC). Past 80% turns red; the daily check records it below.',
  'room.extra.owner.plan.free': 'free',
  'room.extra.owner.plan.paid': 'paid',
  'room.extra.owner.usageOff':
    'Not set up: set the CF_ANALYTICS_TOKEN and CF_ACCOUNT_ID secrets (DEPLOY.md §13) to see the usage.',
  'room.extra.owner.metric': 'What',
  'room.extra.owner.period': 'Over',
  'room.extra.owner.used': 'Used',
  'room.extra.owner.allowance': 'Allowance',
  'room.extra.owner.share': 'Share',
  'room.extra.owner.unknown': 'No answer',
  'room.extra.owner.now': 'Now',
  'room.extra.owner.alerts': 'Alerts past 80%',
  'room.extra.owner.noAlerts': 'No alerts in the last 60 days.',
  'room.extra.owner.alert': '{metric} ({period}): {share}% of the allowance',
  'room.extra.owner.m.workers_requests': 'Worker requests',
  'room.extra.owner.m.do_requests': 'Durable Object requests',
  'room.extra.owner.m.do_duration_gbs': 'Durable Object duration (GB-s)',
  'room.extra.owner.m.d1_rows_read': 'D1 rows read',
  'room.extra.owner.m.d1_rows_written': 'D1 rows written',
  'room.extra.owner.m.d1_storage_bytes': 'D1 storage',
  'room.extra.owner.m.r2_storage_bytes': 'R2 storage',
  'room.extra.owner.m.r2_class_a': 'R2 writes (Class A)',
  'room.extra.owner.m.r2_class_b': 'R2 reads (Class B)',
}

const zhTW: Record<keyof typeof en, string> = {
  'room.extra.owner.games': '遊戲：開放或暫停',
  'room.extra.owner.gamesHint':
    '暫停的遊戲在大廳卡片上會標示，不能開房、不能開新局；正在玩的那一局照常玩完。半分鐘內生效。',
  'room.extra.owner.open': '開放',
  'room.extra.owner.pausedState': '暫停',
  'room.extra.owner.pause': '暫停',
  'room.extra.owner.reopen': '重新開放',
  'room.extra.owner.failed': '沒有成功，請稍後再試。',
  'room.extra.owner.usage': 'Cloudflare 用量',
  'room.extra.owner.usageHint':
    '整個 Cloudflare 帳號（帳號上所有 Worker）對照{plan}方案。每日額度取昨天與今天（UTC）較高的一天。超過 80% 變紅字；每日檢查會記在下面。',
  'room.extra.owner.plan.free': '免費',
  'room.extra.owner.plan.paid': '付費',
  'room.extra.owner.usageOff':
    '未設定：設好 CF_ANALYTICS_TOKEN 與 CF_ACCOUNT_ID 兩個 secret（DEPLOY.md §13）才看得到用量。',
  'room.extra.owner.metric': '項目',
  'room.extra.owner.period': '期間',
  'room.extra.owner.used': '已用',
  'room.extra.owner.allowance': '額度',
  'room.extra.owner.share': '比例',
  'room.extra.owner.unknown': '沒有回應',
  'room.extra.owner.now': '目前',
  'room.extra.owner.alerts': '超過 80% 的警示',
  'room.extra.owner.noAlerts': '最近 60 天沒有警示。',
  'room.extra.owner.alert': '{metric}（{period}）：額度的 {share}%',
  'room.extra.owner.m.workers_requests': 'Worker 請求',
  'room.extra.owner.m.do_requests': 'Durable Object 請求',
  'room.extra.owner.m.do_duration_gbs': 'Durable Object 時長（GB-s）',
  'room.extra.owner.m.d1_rows_read': 'D1 讀取列數',
  'room.extra.owner.m.d1_rows_written': 'D1 寫入列數',
  'room.extra.owner.m.d1_storage_bytes': 'D1 儲存',
  'room.extra.owner.m.r2_storage_bytes': 'R2 儲存',
  'room.extra.owner.m.r2_class_a': 'R2 寫入（Class A）',
  'room.extra.owner.m.r2_class_b': 'R2 讀取（Class B）',
}

export const ownerMessages = { en, 'zh-TW': zhTW }
