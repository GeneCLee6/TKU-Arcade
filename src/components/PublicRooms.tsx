import styled, { keyframes } from 'styled-components'
import { getGameInfo } from '../../shared/games/catalog.ts'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { usePublicRooms } from '../lib/usePublicRooms.ts'
import { useNavigate } from '../lib/useRouter.ts'
import { clippedFill, displayType, monoType, slantClip } from '../styles/esports.ts'
import { color, fontSize, gameHue, space } from '../styles/tokens.ts'
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
      <Heading>
        <Live aria-hidden="true" />
        {t('lobby.publicRooms.heading')}
      </Heading>
      {shown.length > 0 && (
        <List>
          {shown.map((room) => (
            <Row key={room.id} $hue={gameHue(room.gameId)}>
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
  display: flex;
  align-items: center;
  gap: ${space.md}px;
  margin: 0 0 ${space.md}px;
  ${displayType}
  font-size: ${fontSize.xl}px;
`

const blink = keyframes`
  50% {
    opacity: 0.25;
  }
`

// "Live": a glowing magenta dot
const Live = styled.span`
  flex: none;
  width: ${space.sm}px;
  height: ${space.sm}px;
  border-radius: 50%;
  background: ${color.magenta};
  box-shadow: 0 0 ${space.md}px ${color.magenta};
  animation: ${blink} 1.2s steps(2) infinite;
`

const List = styled.ul`
  display: grid;
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

// A slanted strip, its game's name in the game's hue
const Row = styled.li<{ $hue: string }>`
  --color-accent: ${(p) => p.$hue};
  ${clippedFill(slantClip(12), color.panel)}
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.md}px;
  padding: ${space.sm}px ${space.lg}px ${space.sm}px ${space.xl}px;

  & > button {
    flex: none;
  }
`

const Facts = styled.div`
  min-width: 0;
  overflow-wrap: anywhere;
`

const RoomGame = styled.div`
  color: ${color.accent};
  ${displayType}
`

const Detail = styled.div`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  letter-spacing: 0;
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
`
