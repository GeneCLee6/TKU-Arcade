import styled from 'styled-components'
import type { SpectrumTopic } from '../../../shared/games/spectrum/types.ts'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { glass, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'

/**
 * This round's card of four topics (owner, 2026-11-13). The guesser picks the one to ask, a button
 * each; everyone else sees the same four while the guesser makes up their mind. The topics are the
 * bank's own text, which is Chinese only.
 */
export function TopicChoice({
  card,
  onChoose,
  disabled = false,
}: {
  card: readonly SpectrumTopic[]
  /** Only for the guesser: without it the card is shown, not chosen from */
  onChoose?: (id: number) => void
  disabled?: boolean
}) {
  const t = useT()
  const language = useLanguage()
  return (
    <Card aria-labelledby="spectrum-card-heading" data-testid="topic-choice">
      <Title id="spectrum-card-heading">{t('games.spectrum.ui.card')}</Title>
      <Options>
        {card.map((topic) => {
          const body = (
            <>
              <Category lang="zh-TW">
                <span>{topic.category}</span>
              </Category>
              <Topic lang="zh-TW">{topic.topic}</Topic>
              <Ends>
                <End $high={false}>
                  <EndNumber>1</EndNumber> <span lang="zh-TW">{topic.low}</span>
                </End>
                <End $high>
                  <EndNumber>10</EndNumber> <span lang="zh-TW">{topic.high}</span>
                </End>
              </Ends>
            </>
          )
          return (
            <li key={topic.id}>
              {onChoose ? (
                <Option
                  type="button"
                  aria-disabled={disabled}
                  onClick={() => {
                    if (!disabled) onChoose(topic.id)
                  }}
                  data-topic={topic.id}
                >
                  {body}
                  <Ask>{t('games.spectrum.ui.ask')}</Ask>
                </Option>
              ) : (
                <Shown data-topic={topic.id}>{body}</Shown>
              )}
            </li>
          )
        })}
      </Options>
      {language === 'en' && <Note>{t('games.spectrum.ui.chineseOnly')}</Note>}
    </Card>
  )
}

const Card = styled.section`
  ${glass}
  display: grid;
  gap: ${space.md}px;
  padding: ${space.md}px;

  @media (min-width: 900px) {
    padding: ${space.lg}px;
  }
`

const Title = styled.h2`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Options = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;

  & > li {
    display: grid;
  }
`

const face = `
  display: grid;
  justify-items: center;
  align-content: start;
  gap: ${space.xs}px;
  width: 100%;
  padding: ${space.md}px;
  color: ${color.text};
  background: ${color.sunken};
  border: 1px solid ${color.border};
  text-align: center;
  font: inherit;
`

const Shown = styled.div`
  ${face}
`

const Option = styled.button`
  ${face}
  min-height: 44px;
  cursor: pointer;

  &:hover:not([aria-disabled='true']) {
    border-color: ${color.accent};
    background: ${color.raised};
  }

  &[aria-disabled='true'] {
    cursor: default;
    opacity: 0.7;
  }
`

const Category = styled.span`
  display: inline-block;
  padding: 2px ${space.sm}px;
  color: ${color.onAccent};
  background: ${color.accent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

const Topic = styled.span`
  font-size: ${fontSize.xl}px;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
`

const Ends = styled.span`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${space.sm}px;
  width: 100%;
  font-size: ${fontSize.sm}px;
`

const End = styled.span<{ $high: boolean }>`
  color: ${(p) => (p.$high ? color.magenta : color.accent)};
  font-weight: 700;
  text-align: ${(p) => (p.$high ? 'right' : 'left')};
  overflow-wrap: anywhere;
`

const EndNumber = styled.span`
  ${monoType}
  color: ${color.muted};
`

const Ask = styled.span`
  margin-top: ${space.xs}px;
  color: ${color.accent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`
