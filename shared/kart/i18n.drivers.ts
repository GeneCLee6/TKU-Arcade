// 2026-11-23 (docs/KART-WORLD.md §3.1–3.3; owner: "each one's background ... think of it as an online
// game"): each driver's profile (who they are, where from, what they say, the tracks they like, the
// other three) and their outfits' names, for the garage's driver card (src/kart/roster/DriverProfile.tsx).
// Registered by that card's own lazy chunk, so that none of it rides with the race. All ours; no
// driver is anyone in the club. `en` is the source.
const en = {
  'kart.profile.title': 'Driver file',
  'kart.profile.build': 'Build',
  'kart.profile.personality': 'Personality',
  'kart.profile.origin': 'From',
  'kart.profile.catchphrase': 'Catchphrase',
  'kart.profile.tracks': 'Best on',
  'kart.profile.win': 'Victory',
  'kart.profile.relations': 'The other three',
  'kart.profile.outfit': 'Outfit',
  'kart.profile.locked': 'Locked',
  'kart.profile.playWin': 'Play victory',
  'kart.profile.number': 'No. {number}',

  'kart.profile.spade.build': 'Tall and lean',
  'kart.profile.spade.personality':
    'Calm, quiet, slow to warm up. Pulls each glove tight three times before a start. When people call Spade cool, Spade is usually just thinking.',
  'kart.profile.spade.origin':
    'Grew up by the old ferry pier in Tamsui, watching the boats cross the river mouth. The bridge club’s quietest declarer, happiest defending a hand nobody else wanted.',
  'kart.profile.spade.catchphrase': '“No rush. The last lap decides.”',
  'kart.profile.spade.tracks':
    'Long straights and fast sweepers: Golden Riverbank, Danhai Night Circuit.',
  'kart.profile.spade.win': 'Draws a sword that is not there and points it at the sky.',
  'kart.profile.spade.rel.heart':
    'Friends since junior high; Hartie is the one who dragged Spade into the club.',
  'kart.profile.spade.rel.diamond':
    'Bridge partners. They argue over every bid and still read each other best.',
  'kart.profile.spade.rel.club':
    'Clover rides as Spade’s practice partner, and is owed several late-night dinners.',

  'kart.profile.heart.build': 'Small and quick',
  'kart.profile.heart.personality':
    'Loud, warm, never still. The biggest cheer at the track is always hers, even from last place, and she is first to laugh when she loses.',
  'kart.profile.heart.origin':
    'Her family runs an agei stall near Fisherman’s Wharf. Cheer squad by day, the bridge club’s social media by night.',
  'kart.profile.heart.catchphrase': '“Go go go! Last place can still look good!”',
  'kart.profile.heart.tracks':
    'Item races and busy corners: Lantern Old Street, Fisherman’s Wharf.',
  'kart.profile.heart.win':
    'Blows the crowd a kiss, hearts flying, then makes a heart over the helmet.',
  'kart.profile.heart.rel.spade': 'Knew Spade before anyone and talked them into joining the club.',
  'kart.profile.heart.rel.diamond':
    'Roommates. Copies Dee’s notes; drags Dee to every party in return.',
  'kart.profile.heart.rel.club': 'Co-captain of the late-night snack run with Clover.',

  'kart.profile.diamond.build': 'Average height, slight',
  'kart.profile.diamond.personality':
    'A planner. Has a racing line for every corner of every track in a notebook. Says it is all about the odds, and hates losing more than anyone.',
  'kart.profile.diamond.origin':
    'Rides the MRT up from Hongshulin every morning. Keeps the bridge club’s scores and draws up its tournament brackets.',
  'kart.profile.diamond.catchphrase': '“By my numbers…”',
  'kart.profile.diamond.tracks':
    'Technical tracks, hairpins and forks: Hillside Lanes, Wharf Warehouses, Hobe Fort Hill.',
  'kart.profile.diamond.win':
    'Pushes the visor up its bridge, checks the sum on a calculator, then a V.',
  'kart.profile.diamond.rel.spade':
    'Bridge partners: they fight over the bidding and finish each other’s plays.',
  'kart.profile.diamond.rel.heart':
    'Roommates. Lends Hartie the notes, gets dragged out of the dorm in return.',
  'kart.profile.diamond.rel.club':
    'Rivals who mock each other’s methods: Dee calculates, Clover goes on feel. They go over the race together after.',

  'kart.profile.club.build': 'Broad and solid',
  'kart.profile.club.personality':
    'Big-hearted, strong and loyal. Has never missed a club night, and always brings snacks.',
  'kart.profile.club.origin':
    'Lives on the hill behind Tamsui Old Street and runs up the campus steps every morning. Lifts with the weights club, plays with the bridge club.',
  'kart.profile.club.catchphrase': '“Eat first, talk later!”',
  'kart.profile.club.tracks':
    'Climbs, jumps and rough contact: Guanyin Hill Road, Datun Ridgeline, Viaduct Works.',
  'kart.profile.club.win': 'Curls a dumbbell, presses it overhead, then flexes both arms.',
  'kart.profile.club.rel.spade': 'Spade’s practice partner, still waiting on those dinners.',
  'kart.profile.club.rel.heart': 'Runs the late-night snack crew with Hartie.',
  'kart.profile.club.rel.diamond': 'Argues with Dee about everything; secretly reads Dee’s notes.',

  'kart.outfit.spade.race': 'Race suit',
  'kart.outfit.spade.street': 'Long coat',
  'kart.outfit.spade.campus': 'Club jacket',
  'kart.outfit.heart.race': 'Race suit',
  'kart.outfit.heart.street': 'Hoodie',
  'kart.outfit.heart.campus': 'Cheer jacket',
  'kart.outfit.diamond.race': 'Race suit',
  'kart.outfit.diamond.street': 'Utility vest',
  'kart.outfit.diamond.campus': 'Club blazer',
  'kart.outfit.club.race': 'Race suit',
  'kart.outfit.club.street': 'Tracksuit',
  'kart.outfit.club.campus': 'Club jersey',
}

const zhTW: Record<keyof typeof en, string> = {
  'kart.profile.title': '車手資料',
  'kart.profile.build': '身形',
  'kart.profile.personality': '個性',
  'kart.profile.origin': '出身',
  'kart.profile.catchphrase': '口頭禪',
  'kart.profile.tracks': '擅長賽道',
  'kart.profile.win': '勝利動作',
  'kart.profile.relations': '和其他三人',
  'kart.profile.outfit': '服裝',
  'kart.profile.locked': '未解鎖',
  'kart.profile.playWin': '看勝利動作',
  'kart.profile.number': '背號 {number}',

  'kart.profile.spade.build': '高、修長',
  'kart.profile.spade.personality':
    '冷靜、話少、慢熱。起跑前一定把手套拉緊三次。大家說阿桃很酷，其實多半只是在想事情。',
  'kart.profile.spade.origin':
    '在淡水渡船頭旁長大，從小看船橫過河口。橋藝社裡最安靜的莊家，最愛打別人不想接的防守。',
  'kart.profile.spade.catchphrase': '「不急，最後一圈再說。」',
  'kart.profile.spade.tracks': '長直線和高速彎：金色水岸、淡海夜城。',
  'kart.profile.spade.win': '拔出一把看不見的劍，直指天空。',
  'kart.profile.spade.rel.heart': '國中就認識；是心心把阿桃拖進社團的。',
  'kart.profile.spade.rel.diamond': '牌桌上的固定搭檔：每次叫牌都吵，卻最懂對方。',
  'kart.profile.spade.rel.club': '梅子是阿桃的陪練，阿桃還欠他好幾頓宵夜。',

  'kart.profile.heart.build': '嬌小、敏捷',
  'kart.profile.heart.personality':
    '熱情、愛熱鬧、停不下來。賽道上最大聲的加油永遠是她，跑最後一名也一樣；輸了第一個笑出來。',
  'kart.profile.heart.origin':
    '家裡在漁人碼頭附近開阿給店。白天是啦啦隊，晚上幫橋藝社經營社群帳號。',
  'kart.profile.heart.catchphrase': '「衝衝衝！最後一名也要帥！」',
  'kart.profile.heart.tracks': '道具賽和熱鬧的彎道：燈籠老街、漁人碼頭。',
  'kart.profile.heart.win': '對觀眾拋飛吻、愛心飛出去，再在頭盔上比愛心。',
  'kart.profile.heart.rel.spade': '比誰都早認識阿桃，硬是把阿桃拉進社團。',
  'kart.profile.heart.rel.diamond': '室友。常抄小方的筆記，回報是把小方拖去每一場活動。',
  'kart.profile.heart.rel.club': '和梅子一起當宵夜團團長。',

  'kart.profile.diamond.build': '中等身高、偏瘦',
  'kart.profile.diamond.personality':
    '計畫派。筆記本裡有每條賽道每個彎的跑線。嘴上說「看機率」，其實比誰都好勝。',
  'kart.profile.diamond.origin': '每天從紅樹林搭捷運上山。橋藝社的計分員，也是比賽對戰表的製作人。',
  'kart.profile.diamond.catchphrase': '「根據我的計算……」',
  'kart.profile.diamond.tracks': '技術賽道、髮夾彎和分岔路：山城坡巷、碼頭倉庫、滬尾砲台坡。',
  'kart.profile.diamond.win': '推一下護目鏡、拿出計算機按一按，再比 V。',
  'kart.profile.diamond.rel.spade': '牌桌上的固定搭檔：叫牌時吵最兇，打牌時最有默契。',
  'kart.profile.diamond.rel.heart': '室友。借心心抄筆記，換來被拖出宿舍。',
  'kart.profile.diamond.rel.club': '互相嫌棄的對手：小方算跑線、梅子靠直覺；賽後還是一起檢討。',

  'kart.profile.club.build': '寬肩、結實',
  'kart.profile.club.personality': '豪爽、力氣大、超講義氣。社課從不缺席，還一定帶點心。',
  'kart.profile.club.origin':
    '住在淡水老街後面的山坡上，每天早上跑上學校的長階梯。重訓社和橋藝社兩邊跑。',
  'kart.profile.club.catchphrase': '「先吃飽再說！」',
  'kart.profile.club.tracks': '坡道、跳台和碰撞多的路：觀音山坡道、大屯稜線、高架廠區。',
  'kart.profile.club.win': '舉啞鈴、推過頭，再雙手秀肌肉。',
  'kart.profile.club.rel.spade': '阿桃的陪練，還在等那幾頓宵夜。',
  'kart.profile.club.rel.heart': '和心心一起帶宵夜團。',
  'kart.profile.club.rel.diamond': '什麼都跟小方吵，私下卻偷看小方的筆記。',

  'kart.outfit.spade.race': '賽車服',
  'kart.outfit.spade.street': '長大衣',
  'kart.outfit.spade.campus': '社團外套',
  'kart.outfit.heart.race': '賽車服',
  'kart.outfit.heart.street': '連帽衫',
  'kart.outfit.heart.campus': '啦啦隊外套',
  'kart.outfit.diamond.race': '賽車服',
  'kart.outfit.diamond.street': '機能背心',
  'kart.outfit.diamond.campus': '社團西裝外套',
  'kart.outfit.club.race': '賽車服',
  'kart.outfit.club.street': '運動套裝',
  'kart.outfit.club.campus': '社團球衣',
}

export const KART_DRIVER_MESSAGES = { en, 'zh-TW': zhTW }
export type KartDriverKey = keyof typeof en
