// 2026-11-23 (docs/ARCHITECTURE.md §4.98): a member's player card, opened from their name anywhere in a
// room. What it shows is what that member's own browser sent (RoomMember.profile, shared/social.ts):
// their title, achievements, games and wins, favourite vehicle, driver and best lap. Its own lazy
// chunk, with the words it needs: the achievements' names, the vehicles', drivers' and tracks'.
import styled from 'styled-components'
import { ACHIEVEMENT_MESSAGES } from '../../../shared/achievements/i18n.ts'
import { kartMessages } from '../../../shared/games/kart/i18n.ts'
import { KART_ROSTER_MESSAGES } from '../../../shared/kart/i18n.roster.ts'
import type { RoomMember } from '../../../shared/protocol.ts'
import { setCardShared, useCardShared } from '../../achievements/cardPrefs.ts'
import { lapTime } from '../../achievements/profileStats.ts'
import { hasMessage, registerMessages, type TextKey } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { Link } from '../../lib/router.tsx'
import { clippedFill, displayType, monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { Avatar } from '../Avatar.tsx'
import { Dialog } from '../Dialog.tsx'

registerMessages(ACHIEVEMENT_MESSAGES)
registerMessages(KART_ROSTER_MESSAGES)
registerMessages(kartMessages)

interface PlayerCardProps {
  member: RoomMember
  /** As the room shows it (a computer member's from the game's strings) */
  name: string
  isYou: boolean
  onClose(): void
}

export default function PlayerCard({ member, name, isYou, onClose }: PlayerCardProps) {
  const t = useT()
  const shared = useCardShared()
  const profile = member.profile
  // An id from someone else's browser: shown only when this page has a name for it
  const named = (key: string): string | null => (hasMessage(key) ? t(key as TextKey) : null)
  return (
    <Dialog open onClose={onClose} title={t('room.extra.card.title')}>
      <Card data-testid="player-card">
        <Head>
          <Avatar name={name} size={56} />
          <div>
            <Name data-testid="player-card-name">{name}</Name>
            {isYou && <Chip>{t('room.extra.card.you')}</Chip>}
            {member.bot && <Chip>{t('room.extra.card.computer')}</Chip>}
            {profile && (
              <Title data-testid="player-card-title">
                {(profile.title && named(`ach.rule.${profile.title}.name`)) ?? t('room.extra.card.noTitle')}
              </Title>
            )}
          </div>
        </Head>
        {member.bot ? (
          <Note>{t('room.extra.card.bot', { name })}</Note>
        ) : profile ? (
          <>
            <Meter>
              <Label>{t('room.extra.card.achievements')}</Label>
              <Value data-testid="player-card-achievements">
                {t('room.extra.card.achievementsValue', {
                  count: profile.unlocked,
                  total: profile.total,
                  percent: Math.round((100 * profile.unlocked) / profile.total),
                })}
              </Value>
              <Bar aria-hidden="true">
                <Fill style={{ width: `${(100 * profile.unlocked) / profile.total}%` }} />
              </Bar>
            </Meter>
            <Stats>
              <Stat label={t('room.extra.card.games')} value={String(profile.games)} />
              <Stat label={t('room.extra.card.boardWins')} value={String(profile.boardWins)} />
              <Stat label={t('room.extra.card.kartWins')} value={String(profile.kartWins)} />
              <Stat
                label={t('room.extra.card.kart')}
                value={(profile.kart && named(`kart.body.${profile.kart}`)) || t('room.extra.card.none')}
              />
              <Stat
                label={t('room.extra.card.driver')}
                value={(profile.driver && named(`kart.driver.${profile.driver}`)) || t('room.extra.card.none')}
              />
              <Stat
                label={t('room.extra.card.bestLap')}
                value={
                  profile.lap
                    ? t('room.extra.card.bestLapValue', {
                        time: lapTime(profile.lap.ms),
                        track: named(`games.kart.track.${profile.lap.track}`) ?? profile.lap.track,
                      })
                    : t('room.extra.card.none')
                }
              />
            </Stats>
            <Note>{t('room.extra.card.note')}</Note>
          </>
        ) : (
          <Note data-testid="player-card-empty">
            {t(isYou && shared ? 'room.extra.card.missing' : 'room.extra.card.hidden', { name })}
          </Note>
        )}
        {isYou && (
          <Mine>
            <Check>
              <input
                type="checkbox"
                checked={shared}
                onChange={(event) => setCardShared(event.target.checked)}
              />
              {t('room.extra.card.share')}
            </Check>
            <Link to="/me" onClick={onClose}>
              {t('room.extra.card.profile')}
            </Link>
          </Mine>
        )}
      </Card>
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <StatTile>
      <Label>{label}</Label>
      <Value>{value}</Value>
    </StatTile>
  )
}

const Card = styled.div`
  display: grid;
  gap: ${space.md}px;
`

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
  padding: ${space.md}px;
  background: linear-gradient(120deg, color-mix(in srgb, ${color.accent} 22%, ${color.surface}), ${color.surface} 70%);

  & > div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
`

const Name = styled.p`
  margin: 0;
  ${displayType}
  font-size: ${fontSize.xl}px;
  overflow-wrap: anywhere;
`

const Chip = styled.span`
  justify-self: start;
  padding: 0 ${space.sm}px;
  color: ${color.accent};
  border: 1px solid currentColor;
  font-size: 12px;
  font-weight: 700;
`

// The title: an achievement's name, in the game's hue
const Title = styled.p`
  margin: 0;
  color: ${color.accent};
  font-weight: 800;
`

const Meter = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${space.xs}px;
  align-items: baseline;
`

const Bar = styled.span`
  grid-column: 1 / -1;
  display: block;
  height: 6px;
  background: ${color.sunken};
`

const Fill = styled.span`
  display: block;
  height: 100%;
  background: ${color.accent};
`

const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  gap: ${space.sm}px;
`

const StatTile = styled.div`
  ${clippedFill('polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)', color.raised)}
  display: grid;
  gap: 2px;
  padding: ${space.sm}px ${space.md}px;
`

const Label = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: 12px;
  text-transform: uppercase;
`

const Value = styled.span`
  font-weight: 800;
  overflow-wrap: anywhere;
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Mine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
  padding-top: ${space.sm}px;
  border-top: 1px solid ${color.line};

  a {
    color: ${color.accent};
    font-weight: 700;
  }
`

const Check = styled.label`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 44px;
  cursor: pointer;

  input {
    width: 18px;
    height: 18px;
    accent-color: ${color.accent};
  }
`
