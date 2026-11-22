/** CJK ideographs, kana and full-width forms: each nearly two letters wide */
const WIDE = /[⺀-鿿豈-﫿＀-￯]/

/**
 * 2026-11-23 (#151): how much a name's letters are shrunk to fit its place card in the race room
 * (KartLobby.tsx), 1 down to 0.66: by its width in letters, a CJK character counting nearly two. A
 * phone on its side cut long names, and a computer's tag, off
 */
export function nameFit(name: string): number {
  let width = 0
  for (const letter of name) width += WIDE.test(letter) ? 1.8 : 1
  return Math.round(Math.max(0.66, Math.min(1, 12 / Math.max(1, width))) * 50) / 50
}
