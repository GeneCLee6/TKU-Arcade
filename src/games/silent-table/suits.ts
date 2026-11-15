import type { Suit } from '../../../shared/poker/hand.ts'

// Shared by every card game that draws a French deck (Silent Table, Texas Hold'em)
/** Drawn rather than typed: phones turn the text suit signs into emoji */
export const SUIT_PATHS: Record<Suit, string> = {
  s: 'M12 2C9 7 3 10 3 15a4.5 4.5 0 0 0 7.6 3.3L9.5 22h5l-1.100-3.700A4.5 4.5 0 0 0 21 15c0-5-6-8-9-13z',
  h: 'M12 21.500C6 16.500 2 13 2 8.200a5.200 5.200 0 0 1 10-2 5.200 5.200 0 0 1 10 2c0 4.800-4 8.300-10 13.300z',
  d: 'M12 1.500 20 12l-8 10.500L4 12z',
  c: 'M12 2a4.800 4.800 0 0 1 4.300 6.900 4.800 4.800 0 1 1-2.900 8.300L14.500 22h-5l1.100-4.800a4.800 4.800 0 1 1-2.900-8.300A4.800 4.800 0 0 1 12 2z',
}
