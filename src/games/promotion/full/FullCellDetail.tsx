import styled from 'styled-components'
import type { FullBoard } from '../../../../shared/games/promotion/boardFull.ts'
import { DISMISSED, FULL_FACES } from '../../../../shared/games/promotion/fullFaces.ts'
import { Drawer } from '../../../components/Drawer.tsx'
import { Muted } from '../../../components/roomParts.ts'
import { useLanguage, useT } from '../../../i18n/useT.ts'
import { color, font, promotionBoard, space } from '../../../styles/tokens.ts'
import { fullKnob } from './fullArt.ts'
import { deptName, fullCellName, shortCellName } from './fullText.ts'

/**
 * One cell of the full board in words, in a sheet over the board when asked for: its whole name,
 * department and rank, hat button and watermark (both illustrative), what it requires and gives,
 * the silver it moves, where each of the six results leads, and who stands there
 */
export function FullCellDetail({
  board,
  id,
  here,
  onClose,
}: {
  board: FullBoard
  id: string | null
  /** Who stands on the cell, by name */
  here: string[]
  onClose(): void
}) {
  const t = useT()
  const language = useLanguage()
  const cell = id === null || !board.has(id) ? null : board.get(id)
  const second = board.version === 2
  const knob = cell && fullKnob(cell.rank)
  const name = (to: string) => shortCellName(to, language)
  return (
    <Drawer
      open={cell !== null}
      onClose={onClose}
      title={
        cell
          ? `${fullCellName(cell.id, language)} · ${t(`games.promotion.full.rank.${cell.rank}`)}`
          : ''
      }
    >
      {cell && (
        <>
          <Muted>
            {deptName(cell.dept, language)}
            {knob && ` · ${t('games.promotion.full.ui.knob', { knob: t(`games.promotion.full.knob.${knob}`) })}`}
          </Muted>
          <Muted>{t('games.promotion.full.ui.hat')}</Muted>
          <Rules>
            {cell.requires && (
              <li>
                {t(`games.promotion.full.req.${cell.requires}`)}.{' '}
                {cell.instead && t('games.promotion.full.req.instead', { cell: name(cell.instead) })}
              </li>
            )}
            {cell.degree > 0 && (
              <li>
                {t('games.promotion.full.detail.degree', {
                  degree: t(`games.promotion.full.degree.${cell.degree}`),
                })}
              </li>
            )}
            {cell.wu && <li>{t('games.promotion.full.detail.wu')}</li>}
            {cell.money > 0 && <li>{t('games.promotion.full.detail.reward', { amount: cell.money })}</li>}
            {cell.money < 0 && <li>{t('games.promotion.full.detail.fee', { amount: -cell.money })}</li>}
            {cell.retire !== null && (
              <li>{t('games.promotion.full.detail.retire', { amount: cell.retire })}</li>
            )}
            {cell.keepRank && <li>{t('games.promotion.full.detail.keepRank')}</li>}
            {cell.out && <li>{t('games.promotion.full.detail.out')}</li>}
            {cell.offer && <li>{t('games.promotion.full.detail.offer')}</li>}
            {cell.minor && <li>{t('games.promotion.full.detail.minor')}</li>}
            {cell.fine > 0 && <li>{t('games.promotion.full.detail.fine', { amount: cell.fine })}</li>}
            {cell.title && <li>{t('games.promotion.full.detail.title')}</li>}
            {cell.event !== null && <li>{t('games.promotion.full.detail.event')}</li>}
            {second && cell.id === DISMISSED && <li>{t('games.promotion.full.detail.restore')}</li>}
            {cell.fengjue && (
              <li>{t('games.promotion.full.detail.fengjue', { cell: name(cell.fengjue) })}</li>
            )}
            {cell.banner &&
              Object.entries(cell.banner).map(([face, to]) => (
                <li key={face}>
                  {t('games.promotion.full.detail.banner', {
                    face: t(`games.promotion.full.face.${face}`),
                    cell: name(to),
                  })}
                </li>
              ))}
          </Rules>
          {cell.event !== null && (
            <Moves>
              {FULL_FACES.map((face) => {
                const outcome = (cell.event as NonNullable<typeof cell.event>)[face]
                return (
                  <div key={face}>
                    <dt>
                      <FaceBadge aria-hidden="true" style={{ background: promotionBoard.face[face] }}>
                        {t(`games.promotion.full.glyph.${face}`)}
                      </FaceBadge>
                      {t(`games.promotion.full.face.${face}`)}
                    </dt>
                    <dd>
                      {t(`games.promotion.full.go.${outcome.go}`)}
                      {outcome.money > 0 && `, ${t('games.promotion.full.go.money', { amount: outcome.money })}`}
                      {outcome.title && `, ${t('games.promotion.full.go.title')}`}
                    </dd>
                  </div>
                )
              })}
            </Moves>
          )}
          {cell.kind !== 'end' && cell.event === null && !(second && cell.id === DISMISSED) && (
            <Moves>
              {FULL_FACES.map((face) => (
                <div key={face}>
                  <dt>
                    <FaceBadge aria-hidden="true" style={{ background: promotionBoard.face[face] }}>
                      {t(`games.promotion.full.glyph.${face}`)}
                    </FaceBadge>
                    {t(`games.promotion.full.face.${face}`)}
                  </dt>
                  <dd>{name(cell.moves[face])}</dd>
                </div>
              ))}
            </Moves>
          )}
          {here.length > 0 && (
            <p>{t('games.promotion.full.detail.here', { names: new Intl.ListFormat(language).format(here) })}</p>
          )}
          <Muted>{t('games.promotion.full.detail.note')}</Muted>
        </>
      )}
    </Drawer>
  )
}

const Rules = styled.ul`
  margin: 0;
  padding-left: ${space.lg}px;

  &:empty {
    display: none;
  }
`

const FaceBadge = styled.span`
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-right: ${space.xs}px;
  color: ${promotionBoard.onFace};
  font-family: ${font.kai};
  font-weight: 700;
  border-radius: 2px;
  vertical-align: -4px;
`

const Moves = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0 ${space.md}px;
  margin: 0;

  & > div {
    display: flex;
    gap: ${space.sm}px;
  }

  & dt {
    color: ${color.muted};
    white-space: nowrap;
  }

  & dd {
    margin: 0;
  }
`
