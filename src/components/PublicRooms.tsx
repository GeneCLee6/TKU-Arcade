import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { getGameInfo } from '../../shared/games/catalog.ts'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { usePublicRooms } from '../lib/usePublicRooms.ts'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'

/** The home page's list of public rooms waiting for people (e1-t09) */
export function PublicRooms() {
  const t = useT()
  const navigate = useNavigate()
  const { rooms, failed } = usePublicRooms()
  // A game that is not on offer stays out even if someone made a room of it by hand
  const shown = (rooms ?? []).filter(({ gameId }) => getGameInfo(gameId)?.meta.unlisted !== true)

  return (
    <section>
      <Heading>{t('lobby.publicRooms.heading')}</Heading>
      {shown.length > 0 && (
        <List>
          {shown.map((room) => (
            <Row key={room.id}>
              <Facts>
                <RoomGame>{gameTitle(t, room.gameId)}</RoomGame>
                <Detail>
                  {t('lobby.publicRooms.detail', {
                    host: room.host,
                    seated: room.seated,
                    max: room.maxSeats,
                  })}
                </Detail>
              </Facts>
              <Button
                $variant="secondary"
                aria-label={t('lobby.publicRooms.joinNamed', { host: room.host })}
                onClick={() => navigate(`/r/${room.id}`)}
              >
                {t('lobby.publicRooms.join')}
              </Button>
            </Row>
          ))}
        </List>
      )}
      {failed ? (
        <Note role="status">{t('lobby.publicRooms.failed')}</Note>
      ) : (
        rooms !== null && shown.length === 0 && <Note>{t('lobby.publicRooms.empty')}</Note>
      )}
    </section>
  )
}

const Heading = styled.h2`
  margin: 0 0 ${space.md}px;
  font-size: ${fontSize.lg}px;
`

const List = styled.ul`
  display: grid;
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Row = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.md}px;
  padding: ${space.sm}px ${space.md}px;
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;

  & > button {
    flex: none;
  }
`

const Facts = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;
`

const RoomGame = styled.div`
  font-weight: 600;
`

const Detail = styled.div`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
`
