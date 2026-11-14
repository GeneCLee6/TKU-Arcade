import styled, { keyframes } from 'styled-components'
import type { SpectrumTopic } from '../../../shared/games/spectrum/types.ts'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { displayType, glass, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'

/**
 * This round's topic: its category, the topic itself, and its two ends on a scale from 1 to 10. The
 * topic is the bank's own text, which is Chinese for now (PRD open question): the page says so.
 */
export function TopicCard({ topic }: { topic: SpectrumTopic }) {
  const t = useT()
  const language = useLanguage()
  return (
    // A new topic turns the card over
    <Card key={topic.id} aria-label={t('games.spectrum.ui.topic')} data-testid="topic-card">
      <Category lang="zh-TW">
        <span>{topic.category}</span>
      </Category>
      <Topic lang="zh-TW">{topic.topic}</Topic>
      {topic.scene && <Scene lang="zh-TW">{topic.scene}</Scene>}
      <Scale>
        <End $high={false}>
          <EndNumber>1</EndNumber>
          <span lang="zh-TW">{topic.low}</span>
        </End>
        <Bar aria-hidden="true" />
        <End $high>
          <EndNumber>10</EndNumber>
          <span lang="zh-TW">{topic.high}</span>
        </End>
      </Scale>
      {language === 'en' && <Note>{t('games.spectrum.ui.chineseOnly')}</Note>}
    </Card>
  )
}

const turn = keyframes`
  from {
    transform: perspective(800px) rotateX(-70deg);
    opacity: 0;
  }
`

const Card = styled.section`
  ${glass}
  display: grid;
  justify-items: center;
  gap: ${space.sm}px;
  padding: ${space.lg}px ${space.lg}px ${space.lg}px;
  text-align: center;
  animation: ${turn} 0.6s cubic-bezier(0.2, 0.9, 0.2, 1);

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  @media (min-width: 900px) {
    padding: ${space.xl}px ${space.xxl}px;
  }
`

// A slanted tag, the shell's label shape
const Category = styled.span`
  display: inline-block;
  padding: ${space.xs}px ${space.md}px;
  color: ${color.onAccent};
  background: ${color.accent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  letter-spacing: 0.16em;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

const Topic = styled.h2`
  margin: 0;
  ${displayType}
  font-size: clamp(32px, 9vw, 64px);
  line-height: 1.1;
  letter-spacing: 0.1em;
  overflow-wrap: anywhere;
  text-shadow: 0 0 32px color-mix(in srgb, ${color.accent} 45%, transparent);
`

// What kind of answer the topic asks for, in a sentence (2026-11-14)
const Scene = styled.p`
  margin: 0;
  max-width: 640px;
  color: ${color.text};
  font-size: ${fontSize.lg}px;
  line-height: 1.5;
  overflow-wrap: anywhere;
`

const Scale = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(48px, 1.2fr) minmax(0, 1fr);
  align-items: center;
  gap: ${space.md}px;
  width: 100%;
  max-width: 640px;
`

const End = styled.span<{ $high: boolean }>`
  display: grid;
  justify-items: ${(p) => (p.$high ? 'end' : 'start')};
  gap: 2px;
  color: ${(p) => (p.$high ? color.magenta : color.accent)};
  font-weight: 700;
  text-align: ${(p) => (p.$high ? 'right' : 'left')};
  overflow-wrap: anywhere;
`

const EndNumber = styled.span`
  ${monoType}
  font-size: ${fontSize.sm}px;
  color: ${color.muted};
`

const Bar = styled.span`
  height: 10px;
  background: linear-gradient(90deg, ${color.accent}, ${color.magenta});
  transform: skewX(${SLANT});
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`
