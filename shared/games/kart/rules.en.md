## What is Kart?

A 3D kart race in the browser for 1 to 8 karts: friends in one room, computer karts in the free seats, or both. Each browser drives its own kart; the room counts the laps, hands out the items and decides the result. The drift-and-boost feel is a tribute to the classic kart racers of the 2000s; the karts, drivers, tracks, items and names here are our own.

## A race

1. The host picks the **track**, the **laps** (1 to 9), the **mode** and the **sides**, and can add computer karts to free seats.
2. Everyone picks a kart and a driver in the waiting room. The six karts differ a little in top speed, pull, steering and weight.
3. When everyone's track has loaded, the room counts down: get ready, 3, 2, 1, GO. Pressing forward in the last half second gives a start boost.
4. The first kart to finish its laps wins. Once it is home the others have 30 seconds; a kart still out then did not finish, and is placed by the laps it completed.

## Driving

- **Drift**: hold the drift key while steering. A drift fills your **boost gauge**; a full gauge becomes a stored boost (up to two), fired with the boost key. One boost burns at a time: while it does, the key does nothing.
- **Instant boost**: a real drift, with the tail out for a moment, earns a short burst; a tap and let go does not. Let the drift go and press forward again, while the kart is still sliding or just after it straightens. A drifting kart slides and loses a little speed, so drifting down a straight for it does not pay.
- **Reset**: puts the kart back on the road at the last checkpoint.

The controls panel on the Kart page lists the keys, the gamepad buttons and the touch buttons, and lets you change them.

**Driving school**: the Kart page's menu has ten short lessons, one technique each, from the first lap to the drift jump: the drift, the instant boost, perfect timing, the combo, N2O, the perfect start, the drift jump, the gates and a final test. Each shows your own keys, says what went wrong when a try fails, and can be tried again or skipped; a pass earns one to three stars. During a race, a short tip comes once for a technique you have not used yet (it can be turned off in the controls panel).

**Challenges**: the Kart page's menu has two kinds. **Missions** come in four chapters (Basics, Technique, Master, Final boss), each one track and one condition: finish without a crash, reach a combo, make drift jumps, go through every slot in a wall, take every branch, finish in the top three without N2O, finish in sea fog, ride a bike, a knockout (the last over the line each lap is out), beat the computer ace one on one, and more. A pass earns one to three stars; a chapter opens once you pass four missions of the one before. The **medal wall** is a three-lap time trial on every track: beat a target time for bronze, silver or gold, and gold reveals one more medal. You can race beside a ghost driving at the target's pace.

## Advanced techniques

Some tracks (**Wharf Warehouses**, **Hillside Lanes**, **Viaduct Works**) have to be learnt by heart: the road everyone sees is the long way round, and the short way asks for one of these. On some the short way is a road of its own, a **branch** that leaves the road and joins it again further on: its checkpoints count the same, and a reset on it puts you back on it.

- **Drift jump**: begin a drift just *before* a ramp and keep the drift key down. The kart flies the way it was sliding, not the way the road points; in the air the stick swings the nose much further than usual; and it lands already in the drift, turning at once, with a chunk of gauge and the instant boost ready (let go, press forward). A kart that takes off straight lands straight and only then starts to turn: where a ramp leads straight into a hairpin, that is the far wall.
- **Lift before the crest**: without a drift jump, the only way through a ramp into a corner is to come off the throttle before the ramp. The faster you leave, the further you fly, and a kart in the air cannot brake or turn.
- **Over the fence**: the low striped fences can be flown over, and only flown over. The lane behind one is reached from the ramp before it, leaving at an angle: a drift jump towards the lane.
- **Through the slot**: the tall walls (sheds, rows of containers, yard walls) have gaps one kart wide, lined up so that the straight way through is hidden until you are on it. Line up early, do not drift, and go through straight; missing by a metre is a head-on crash. Each slot has a boost pad just behind it.
- **The blind turn-in**: a branch whose mouth opens only for a moment, behind a wall or over a crest. Be on its side of the road and already turning before you can see it; late, you meet the corner of the wall.

**Expert** computer karts take these shortcuts; the Easy, Normal and Hard ones keep to the long way round. Hard and Expert ones fire perfect instant boosts and keep the combo going. On the Kart page, `?autopilot=master` shows a driver who takes every shortcut; `?autopilot=expert` drives the same track well without knowing it.

## Modes

- **Item race**: item boxes on the road. Drive through one to draw an item, by your place: the further back, the stronger. Use it with the item key. You hold one item at a time.
- **Speed race**: no items, only driving.

The fourteen items. "Ahead" means the kart just in front of you; in a team race, anything that harms passes your team-mates by.

| Item | What it does | Who gets it most |
| --- | --- | --- |
| Tailwind | A boost | Everyone |
| Bubble | Stops the next harmful item or shot, then pops | The front |
| Haul Line | Pulls you towards the kart ahead | Middle and back |
| Monsoon | Slows everyone ahead for a few seconds; a Bubble stops it | The back |
| Shuffle | Trades places with the kart ahead on the same lap; a Bubble stops it | Middle and back |
| Splash | Thrown straight ahead; stops at a wall | Middle and back |
| Thunder Shower | Chases the kart ahead and strikes when it arrives | The back |
| Mudflat | Dropped behind you; anyone who drives in spins (you too, after a moment) | The front |
| Rebound | For 8 seconds, the next thrown or dropped item that would hit you goes back to whoever sent it (a Bubble on them stops it). It does nothing against Monsoon, Shuffle or Static. With a Bubble up as well, the Rebound goes first | The front |
| Sea Fog | A bank of fog appears on the road just ahead of the kart ahead and stays 7 seconds. Driving in clouds your view for about a second and a half and holds you back a little. Not a hit: no Bubble or Rebound stops it, and it never fogs whoever laid it | Middle and back |
| Skip Stone | Skips you forward to the next gate along the road, with a small push; never over the finish line | The back |
| Static | The kart in front of the whole field (of the other team, in a team race) cannot fire a boost for 3.5 seconds, and the one burning is cut. A Bubble stops it. Never given to the leader | Middle and back |
| Rally Flag | Team race only: a short boost for you and every team-mate still racing | Everyone |
| Fake Box | Looks like an item box (its core glows a dull red, and it turns slower); dropped behind you, it spins whoever drives in. A Bubble stops it | The front |

A kart that is hit spins and slows for about a second. Nothing that reaches a kart ahead is ever given to the leader.

**Item vehicles** (the Beachcomber series in the garage) spend part of their points on items instead of on driving: the Pelican's Bubble stops two hits; the Otter finds the strong items a little more often and its own items last a quarter longer; the Cormorant is the luckiest at the boxes and its Bubble stops two. In a speed race they are simply a little slower. The room decides all of it from the vehicle you picked.

## Team race

Set **Sides** to **Team race** and the karts race as two teams, **Sunset** and **Estuary**. Either mode can be a team race.

- **Sides**: in the waiting room everyone picks Sunset or Estuary. Anyone who has not is put on the smaller team when the race starts. The host can move anyone, computer karts included, and **Balance the teams** takes every choice back so that the split is even. Two against two, three against three and four against four are the usual sizes.
- **Your gauge is your own**: as in any race, your drifts fill your own boost gauge, and a full gauge is a stored boost of your own (up to two). An ordinary boost burns **red**.
- **Team gauge and High Tide**: each team also shares one team gauge, shown in blue beside your own. Only drifting fills it, anyone's on the team; it takes about as much as everyone on the team filling their own gauge twice, so a bigger team fills it no faster. The moment it is full, every stored boost the team's karts **are holding** turns **blue**, a **High Tide**; a kart holding none gets nothing this time. A High Tide burns blue, for about half as long again as a red one, and goes faster. Blue ones are first in the row and fire first. One boost burns at a time. Blue is the colour of that boost, not of either team: both teams' are blue.
- **Scoring**: places score **10, 8, 6, 5, 4, 3, 2, 1** points; a kart that does not finish scores 0. Each team counts its best karts, as many as the smaller team has, so three against two is still fair. The higher total wins. If the totals are level, the team of the kart that finished first wins.

The results show which team won, the two totals, and every kart's side, time and points.

## Computer karts

The host can add computer karts to free seats at four levels: Easy, Normal, Hard and Expert. An Expert kart knows every technique on this page (perfect timing, combos, the drift jump, lifting at the crest, the slots, the shortcuts you learn by heart), but it is held to its kart's top speed like everyone: no cheating. The host's browser drives them, so they leave the race if the host does. On the Kart page you can also race the computer alone, as a single race, a team race with computer team-mates, or a Grand Prix of several tracks.

## Watching

Anyone who comes in during a race, or whose kart is out, watches live and can follow any kart. After the race, each browser can replay what it saw.
