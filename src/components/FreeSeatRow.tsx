import styled from 'styled-components'
import { useT } from '../i18n/useT.ts'
import { Button } from './Button.tsx'
import { Muted, Row, SeatNumber } from './roomParts.ts'

export interface FreeSeatRowProps {
  seat: number
  onSit(seat: number): void
}

/** An empty seat in a list of seats, and the way to take it */
export function FreeSeatRow({ seat, onSit }: FreeSeatRowProps) {
  const t = useT()
  return (
    <Row>
      <SeatNumber>{t('room.waiting.seat', { seat: seat + 1 })}</SeatNumber>
      <Muted>{t('room.waiting.empty')}</Muted>
      <SitButton
        $variant="secondary"
        aria-label={t('room.waiting.sitIn', { seat: seat + 1 })}
        onClick={() => onSit(seat)}
      >
        {t('room.waiting.sit')}
      </SitButton>
    </Row>
  )
}

const SitButton = styled(Button)`
  margin-left: auto;
`
