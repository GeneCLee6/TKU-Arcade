import styled from 'styled-components'
import { FACES, getCell } from '../../../shared/games/promotion/board.ts'
import { knobOf } from '../../../shared/games/promotion/departments.ts'
import { promotionDetailMessages } from '../../../shared/games/promotion/i18n.detail.ts'
import { Drawer } from '../../components/Drawer.tsx'
import { Muted } from '../../components/roomParts.ts'
import { registerMessages } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { color, font, promotionBoard, space } from '../../styles/tokens.ts'
import { cellText, shortCellText } from './cellText.ts'
import { rankArtOf } from './rankArt.ts'

// The words only the details and the screen around the board use: not drawn in the board's font
registerMessages(promotionDetailMessages)


/**
 * One cell in words, in a sheet over the board when asked for (e3-t10): its full name (in English
 * with the gloss the board leaves out), grade, hat button and watermark (both illustrative), and
 * where each result leads from it, as the badges on the board show
 */
export function CellDetail({ id, onClose }: { id: string | null; onClose(): void }) {
  const t = useT()
  const cell = id === null ? null : getCell(id)
  const knob = cell && knobOf(cell.rank)
  // Always there, open or not: closing the sheet, rather than removing it, gives the focus back to
  // the cell it was opened from
  return (
    <Drawer
      open={cell !== null}
      onClose={onClose}
      title={cell ? `${cellText(t, cell.id)} · ${t(`games.promotion.rank.${cell.rank}`)}` : ''}
    >
      {cell && (
        <>
          {knob && (
            <Muted>
              {t('games.promotion.ui.knob', { knob: t(`games.promotion.knob.${knob}`) })}
            </Muted>
          )}
          {rankArtOf(cell.id) && <Muted>{t('games.promotion.ui.hat')}</Muted>}
          <Moves>
            {FACES.map((face) => (
              <div key={face}>
                <dt>
                  <FaceBadge aria-hidden="true" style={{ background: promotionBoard.face[face] }}>
                    {t(`games.promotion.glyph.${face}`)}
                  </FaceBadge>
                  {t(`games.promotion.face.${face}`)}
                </dt>
                <dd>{shortCellText(t, cell.moves[face])}</dd>
              </div>
            ))}
          </Moves>
          <Muted>{t('games.promotion.simplified')}</Muted>
        </>
      )}
    </Drawer>
  )
}

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
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
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
