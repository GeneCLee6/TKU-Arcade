// Which games have rules, as a plain list: the lobby's cards and the room ask this on their first
// screen, and the map of every game's rules files (rulesDoc.ts) costs about 0.4 kB there, so it is
// loaded only with the rules themselves. tests/lib/rulesList.test.ts keeps the list the same as the
// files beside each module: a new game's rules go in both.

/** Which of a game's rules: its own, or its full edition's */
export type RulesEdition = 'simple' | 'full'

const WITH_RULES: Record<RulesEdition, readonly string[]> = {
  simple: ['promotion', 'silent-table', 'spectrum', 'bluff', 'odd-word', 'misery'],
  // A game with a second edition (promotion's full one, C7) has a second pair, `rulesFull.*.md`
  full: ['promotion'],
}

/** Whether `gameId` has rules in English, where a game's rules start */
export const hasRules = (gameId: string, edition: RulesEdition = 'simple'): boolean =>
  WITH_RULES[edition].includes(gameId)

/** Every game with rules, for the test that keeps this list true */
export const gamesWithRules = (edition: RulesEdition): readonly string[] => WITH_RULES[edition]
