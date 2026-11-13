import styled, { css, keyframes } from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { BluffView } from '../../../shared/games/bluff/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, List, Row, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import { Body, Name, Tag } from './bluffParts.ts'
import './messages.ts'
import { gains, revealedRole, signed } from './screenState.ts'

/** How long apart the reveal's parts come up, when it is seen arriving */
export const REVEAL_STEP_MS = 600

/**
 * A round, all of it public: who the honest reader was (the big moment, which turns over when seen
 * arriving), the mole and their words, the real meaning, the judge's vote, every sticker and who
 * scored. All of it is in the reveal's view: the screen only lays it out.
 */
export function RoundReveal({
  view,
  nameOf,
  animate,
}: {
  view: BluffView
  nameOf(seat: SeatId): string
  animate: boolean
}) {
  const t = useT()
  const reveal = view.reveal
  if (!reveal || view.honest === null) return null
  const judge = nameOf(view.judge)
  const verdict =
    reveal.vote === null
      ? t(`games.bluff.ui.verdict.${reveal.missed ?? 'time'}`, { judge })
      : reveal.vote === view.honest
        ? t('games.bluff.ui.verdict.right', { judge })
        : t('games.bluff.ui.verdict.wrong', { judge, name: nameOf(reveal.vote) })
  const stickers = Object.entries(reveal.stickers)
  const gained = [...gains(view)]

  return (
    <Section aria-labelledby="bluff-reveal-heading" data-testid="round-reveal">
      <Heading id="bluff-reveal-heading">{t('games.bluff.ui.revealHeading', { round: view.round })}</Heading>

      <Big $animate={animate} $step={0} data-testid="honest-was">
        <Avatar name={nameOf(view.honest)} tint={seatColor(view.honest)} />
        <span>{t('games.bluff.ui.honestWas', { name: nameOf(view.honest) })}</span>
      </Big>

      <Verdict $animate={animate} $step={1} $right={reveal.vote !== null && reveal.vote === view.honest}>
        {verdict}
      </Verdict>

      {view.mole !== null && (
        <Part $animate={animate} $step={2} data-testid="mole-was">
          <MoleLine>{t('games.bluff.ui.moleWas', { name: nameOf(view.mole) })}</MoleLine>
          {view.words.length > 0 && (
            <Words aria-label={t('games.bluff.ui.moleWords')}>
              {view.words.map((word) => (
                <Word key={word} lang="zh-TW">
                  <span>{word}</span>
                </Word>
              ))}
            </Words>
          )}
        </Part>
      )}

      {view.explanation !== null && (
        <Part $animate={animate} $step={3}>
          <Label>{t('games.bluff.ui.explanation')}</Label>
          <Explanation lang="zh-TW">
            <Lead>{view.term.term}</Lead>
            {view.explanation}
          </Explanation>
        </Part>
      )}

      <Part $animate={animate} $step={3}>
        <Label>{t('games.bluff.ui.stickers')}</Label>
        {stickers.length === 0 ? (
          <Body>{t('games.bluff.ui.noStickers')}</Body>
        ) : (
          <List>
            {stickers.map(([from, to]) => (
              <Row key={from} $mark={seatColor(to)}>
                <Name>
                  {t('games.bluff.ui.stickerLine', { from: nameOf(Number(from)), to: nameOf(to) })}
                  <RoleTag role={revealedRole(view, to)} />
                </Name>
              </Row>
            ))}
          </List>
        )}
      </Part>

      <Part $animate={animate} $step={4}>
        <Gained>
          {gained.length === 0
            ? t('games.bluff.ui.nobodyScored')
            : gained
                .map(([seat, points]) => t('games.bluff.ui.gained', { name: nameOf(seat), points: signed(points) }))
                .join(' · ')}
        </Gained>
      </Part>
    </Section>
  )
}

/** A seat's role in this round, as a tag */
export function RoleTag({ role }: { role: ReturnType<typeof revealedRole> }) {
  const t = useT()
  const tone = role === 'honest' ? 'success' : role === 'mole' ? 'danger' : role === 'judge' ? 'accent' : 'plain'
  return (
    <Tag $tone={tone}>
      <span>{t(`games.bluff.ui.tag.${role}`)}</span>
    </Tag>
  )
}

const rise = keyframes`
  from {
    opacity: 0;
    transform: translateY(${space.md}px);
  }
`

const turn = keyframes`
  from {
    opacity: 0;
    transform: perspective(600px) rotateX(80deg);
  }
`

const stepped = (animate: boolean, step: number, name = rise) =>
  animate
    ? css`
        animation: ${name} 420ms ease-out both;
        animation-delay: ${step * REVEAL_STEP_MS}ms;
      `
    : ''

const Part = styled.div<{ $animate: boolean; $step: number }>`
  display: grid;
  gap: ${space.xs}px;
  ${(p) => stepped(p.$animate, p.$step)}
`

const Big = styled.p<{ $animate: boolean; $step: number }>`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
  margin: 0;
  padding: ${space.lg}px;
  color: ${color.onAccent};
  background: ${color.success};
  ${displayType}
  font-size: ${fontSize.xl}px;
  overflow-wrap: anywhere;
  ${(p) => stepped(p.$animate, p.$step, turn)}
`

const Verdict = styled.p<{ $animate: boolean; $step: number; $right: boolean }>`
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${(p) => (p.$right ? color.success : color.danger)};
  font-weight: 700;
  overflow-wrap: anywhere;
  ${(p) => stepped(p.$animate, p.$step)}
`

const MoleLine = styled.p`
  margin: 0;
  color: ${color.magenta};
  font-size: ${fontSize.lg}px;
  font-weight: 800;
`

const Words = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Word = styled.li`
  padding: 2px ${space.md}px;
  color: ${color.onAccent};
  background: ${color.magenta};
  font-weight: 800;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

const Label = styled.h3`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Explanation = styled.p`
  margin: 0;
  padding: ${space.md}px;
  background: ${color.sunken};
  line-height: 1.6;
  overflow-wrap: anywhere;
`

const Gained = styled.p`
  margin: 0;
  color: ${color.success};
  font-weight: 700;
  overflow-wrap: anywhere;
`

const Lead = styled.strong`
  margin-right: ${space.sm}px;
`
