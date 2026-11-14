import { useEffect, useId, useState, type FormEvent } from 'react'
import styled from 'styled-components'
import { guessProblem, MAX_GUESS_LENGTH, tidyClue } from '../../../shared/games/clue-clash/clue.ts'
import type { CcAction, CcCardResult, CcView } from '../../../shared/games/clue-clash/types.ts'
import type { SeatId } from '../../../shared/games/types.ts'
import { Button } from '../../components/Button.tsx'
import { FieldError, FieldLabel, TextInput } from '../../components/Field.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { Heading, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { ClueForm } from './ClueForm.tsx'
import { ClueList } from './ClueList.tsx'
import './messages.ts'
import { answerKey, promptOf, verdictOf } from './screenState.ts'

/** If the room never answers a press, the buttons come back after this */
const ANSWER_WAIT_MS = 4000

/**
 * 撞詞's screen. Phone first: the clue-givers see the word huge and type a clue under it; the
 * guesser sees only the clues left standing and types a guess. Buttons that move the card on are
 * in the dock. The rules stay on the server: this draws `view` and sends actions.
 */
export default function ClueClashScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as CcView
  const legal = game.legal as unknown as CcAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  const key = answerKey(view, legal)
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: CcAction) => {
    setAskedAt(key)
    room.act(action)
  }
  const can = (type: CcAction['type']) => legal.some((action) => action.type === type)

  const prompt = promptOf(view, legal, nameOf)
  const flags = new Map(
    legal.flatMap((action) => (action.type === 'flag' ? [[action.index, action] as const] : [])),
  )
  const givers = view.players.length - 1
  const need = Math.ceil(givers / 2)
  const yours = view.clues.filter((clue) => clue.seat === view.you)
  const verdict = verdictOf(view)

  return (
    <GameLayout
      room={room}
      seatTint
      turnSeat={game.over ? null : view.guesser}
      resultUnranked
      dock={
        <DockRow>
          <DockText>
            <MainLine>{t(prompt.key, prompt.params)}</MainLine>
            {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
          </DockText>
          <Buttons>
            {can('redraw') && (
              <Button $variant="secondary" disabled={asked} onClick={() => send({ type: 'redraw' })}>
                {t('games.clue-clash.ui.redraw')}
              </Button>
            )}
            {can('ready') && (
              <Button disabled={asked} onClick={() => send({ type: 'ready' })}>
                {t('games.clue-clash.ui.ready')}
              </Button>
            )}
            {can('accept') && (
              <Button $variant="secondary" disabled={asked} onClick={() => send({ type: 'accept' })}>
                {t('games.clue-clash.ui.accept')}
              </Button>
            )}
            {can('next') && (
              <Button disabled={asked} onClick={() => send({ type: 'next' })}>
                {t(view.cardsLeft === 0 ? 'games.clue-clash.ui.finish' : 'games.clue-clash.ui.next')}
              </Button>
            )}
          </Buttons>
        </DockRow>
      }
    >
      <Stage>
        <Header>
          <Mono>{t('games.clue-clash.ui.card', { card: view.cardsUsed, total: view.totalCards })}</Mono>
          <Facts>
            <Fact>
              <span>{t('games.clue-clash.ui.score', { score: view.score })}</span>
            </Fact>
            <Fact>
              <span>{t('games.clue-clash.ui.guesserIs', { name: nameOf(view.guesser) })}</span>
            </Fact>
          </Facts>
        </Header>
        {game.chatLocked && <Notice role="note">{t('games.clue-clash.ui.chatLocked')}</Notice>}

        {view.word !== null && (
          <WordPanel data-testid="mystery">
            <Small>{t(view.phase === 'reveal' || view.phase === 'over' ? 'games.clue-clash.ui.theWordWas' : 'games.clue-clash.ui.theWord')}</Small>
            <Big data-testid="mystery-word">{view.word.word}</Big>
            <Small>{t('games.clue-clash.ui.category', { category: view.word.category })}</Small>
            {view.redrawn && view.phase === 'clues' && <Small>{t('games.clue-clash.ui.redrawn')}</Small>}
          </WordPanel>
        )}

        {view.role === 'guesser' && view.phase !== 'guess' && view.phase !== 'reveal' && view.phase !== 'over' && (
          <WordPanel data-testid="guesser-note">
            <Big>?</Big>
            <Small>{t('games.clue-clash.ui.youGuess')}</Small>
          </WordPanel>
        )}

        {view.phase === 'clues' && view.role === 'giver' && view.word !== null && (
          <ClueForm
            key={`${view.cardsUsed}-${view.redrawn}`}
            slots={view.perGiver}
            sent={yours.map((clue) => clue.text)}
            answers={[view.word.word, ...view.word.alts]}
            disabled={asked}
            onSend={(texts) => send({ type: 'clue', texts })}
          />
        )}

        {(view.phase === 'clues' || view.phase === 'review') && (
          <Section aria-labelledby="cc-clues">
            <Heading id="cc-clues">
              {t(view.phase === 'review' ? 'games.clue-clash.ui.reviewHeading' : 'games.clue-clash.ui.cluesHeading')}
            </Heading>
            {view.phase === 'review' && view.role === 'giver' && (
              <Body>{t('games.clue-clash.ui.reviewHelp', { need })}</Body>
            )}
            <ClueList
              clues={view.clues}
              nameOf={nameOf}
              flags={flags}
              need={view.phase === 'review' && view.role === 'giver' ? need : undefined}
              disabled={asked}
              send={send}
            />
          </Section>
        )}

        {view.phase === 'guess' && (
          <Section aria-labelledby="cc-survivors">
            <Heading id="cc-survivors">{t('games.clue-clash.ui.survivors')}</Heading>
            <Body>
              {t('games.clue-clash.ui.cancelledCount', {
                count: view.clues.filter((clue) => clue.cancelled === true).length,
              })}
            </Body>
            {view.clues.every((clue) => clue.cancelled !== false) && <Body>{t('games.clue-clash.ui.noClues')}</Body>}
            <ClueList clues={view.clues} nameOf={nameOf} survivorsOnly={view.role !== 'giver'} />
          </Section>
        )}

        {view.phase === 'guess' && can('guess') && (
          <GuessForm key={view.cardsUsed} disabled={asked} onGuess={(text) => send({ type: 'guess', text })} onPass={() => send({ type: 'pass' })} />
        )}

        {(view.phase === 'reveal' || (view.phase === 'over' && view.guess !== null)) && (
          <Section aria-labelledby="cc-reveal" data-testid="cc-reveal">
            <Heading id="cc-reveal">{t(`games.clue-clash.ui.verdict.${verdict ?? 'pass'}`)}</Heading>
            <Body data-testid="guess-was">
              {view.guess?.kind === 'guess'
                ? t('games.clue-clash.ui.guessWas', { name: nameOf(view.guesser), text: view.guess.text })
                : t(view.guess?.kind === 'time' ? 'games.clue-clash.ui.timeUp' : 'games.clue-clash.ui.passed', {
                    name: nameOf(view.guesser),
                  })}
            </Body>
            {verdict === 'wrong' && (
              <Body>{t(view.cardsLeft > 0 ? 'games.clue-clash.ui.wrongNote' : 'games.clue-clash.ui.wrongLastNote')}</Body>
            )}
            {view.accepted && <Body>{t('games.clue-clash.ui.accepted')}</Body>}
            <ClueList clues={view.clues} nameOf={nameOf} />
          </Section>
        )}

        <History history={view.history} nameOf={nameOf} />
      </Stage>
    </GameLayout>
  )
}

/** The guesser's one guess, or a pass */
function GuessForm({ disabled, onGuess, onPass }: { disabled: boolean; onGuess(text: string): void; onPass(): void }) {
  const t = useT()
  const id = useId()
  const [draft, setDraft] = useState('')
  const text = tidyClue(draft)
  const problem = text === '' ? null : guessProblem(text)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (text !== '' && problem === null && !disabled) onGuess(text)
  }
  return (
    <Section aria-labelledby={`${id}-label`} data-testid="guess-form">
      <GuessFields onSubmit={submit}>
        <FieldLabel id={`${id}-label`} htmlFor={`${id}-input`}>
          {t('games.clue-clash.ui.guessLabel')}
        </FieldLabel>
        <BigInput
          id={`${id}-input`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('games.clue-clash.ui.guessPlaceholder')}
          autoComplete="off"
          enterKeyHint="send"
          maxLength={MAX_GUESS_LENGTH * 2}
          aria-invalid={problem !== null}
          aria-describedby={`${id}-problem`}
        />
        <FieldError id={`${id}-problem`} role="alert">
          {problem !== null && t(problem.key, problem.params)}
        </FieldError>
        <Buttons>
          <Button type="submit" disabled={disabled || text === '' || problem !== null}>
            {t('games.clue-clash.ui.guessButton')}
          </Button>
          <Button type="button" $variant="secondary" disabled={disabled} onClick={onPass}>
            {t('games.clue-clash.ui.pass')}
          </Button>
        </Buttons>
        <Small>{t('games.clue-clash.ui.passHelp')}</Small>
      </GuessFields>
    </Section>
  )
}

/** The cards so far, newest first */
function History({ history, nameOf }: { history: readonly CcCardResult[]; nameOf(seat: SeatId): string }) {
  const t = useT()
  if (history.length === 0) return null
  return (
    <Section aria-labelledby="cc-history" data-testid="cc-history">
      <Heading id="cc-history">{t('games.clue-clash.ui.history')}</Heading>
      <Entries>
        {[...history].reverse().map((card, index) => (
          <Entry key={history.length - index} $outcome={card.outcome}>
            <strong>{card.word.word}</strong>
            <span>{t(`games.clue-clash.ui.outcome.${card.outcome}`)}</span>
            {card.outcome !== 'lost' && <Muted>{nameOf(card.guesser)}</Muted>}
          </Entry>
        ))}
      </Entries>
    </Section>
  )
}

const OUTCOME_COLOR: Record<CcCardResult['outcome'], string> = {
  right: color.success,
  wrong: color.danger,
  pass: color.border,
  lost: color.danger,
}

const Stage = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
`

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px ${space.md}px;
`

const Mono = styled.span`
  ${monoType}
  font-weight: 700;
`

const Facts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Fact = styled.span`
  padding: ${space.xs}px ${space.md}px;
  color: ${color.text};
  background: ${color.raised};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

const Notice = styled.p`
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.warning};
  font-weight: 600;
`

const WordPanel = styled(Section)`
  justify-items: center;
  text-align: center;
  gap: ${space.xs}px;
`

const Big = styled.p`
  margin: 0;
  ${displayType}
  font-size: clamp(40px, 13vw, 76px);
  line-height: 1.1;
  color: ${color.accent};
  overflow-wrap: anywhere;
`

const Small = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Body = styled.p`
  margin: 0;
`

const GuessFields = styled.form`
  display: grid;
  gap: ${space.sm}px;
`

const BigInput = styled(TextInput)`
  min-height: 52px;
  font-size: ${fontSize.xl}px;
  font-weight: 700;
`

const Entries = styled.ol`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Entry = styled.li<{ $outcome: CcCardResult['outcome'] }>`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px ${space.sm}px;
  padding: ${space.xs}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${(p) => OUTCOME_COLOR[p.$outcome]};
`

const Muted = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const DockRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px ${space.md}px;
`

const DockText = styled.div`
  flex: 1 1 12em;
  min-width: 0;
  overflow-wrap: anywhere;
`

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

const MainLine = styled.p`
  margin: 0;
  font-weight: 600;
  line-height: 1.3;
`

const SmallLine = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`
