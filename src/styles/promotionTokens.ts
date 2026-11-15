// The promotion board's paint (e3-t08), beside tokens.ts and part of the same token system (CLAUDE.md
// rule 5), like kartTokens.ts and tradersTokens.ts: a file of its own so that only the screens that
// draw with it load it; in tokens.ts, which the lobby also loads, it would be in everyone's first load.

// Red lacquer with gold trim, rice-paper cells, red seals. Plain
// values, the same in both themes as a real board is (like Silent Table's felt): the board's SVG
// takes them as attributes, which cannot read CSS variables
export const promotionBoard = {
  lacquerHi: '#5E1616',
  lacquer: '#3A0B0B',
  lacquerDeep: '#220505',
  gold: '#C9A24A',
  goldDeep: '#8C6A2A',
  block: '#000000',
  plaque: '#240606',
  onPlaque: '#F2D58A',
  paperHi: '#FBF2DC',
  paper: '#EEDDB5',
  paperShade: '#DFC491',
  edge: '#8C6A3A',
  drop: '#4A2E12',
  ink: '#2A170B',
  seal: '#A81E1E',
  onSeal: '#FFF3E6',
  endHi: '#FFF0BE',
  end: '#EDBE4E',
  endDeep: '#B57A18',
  onEnd: '#4A2A05',
  select: '#2BE6FF',
  focus: '#FFE066',
  sheen: '#FFFFFF',
  shade: '#000000',
  // The results, on the destination badges and the faces of the top; the full edition's six (C7)
  face: {
    de: '#F5C542',
    cai: '#5EE0F5',
    gong: '#5FD58F',
    liang: '#C3A6FF',
    rou: '#D9D2C0',
    zang: '#F27482',
  },
  // The full edition (C7): silver, the pot, the cells that end a career
  silver: '#D8DDE6',
  silverDeep: '#7D8796',
  gain: '#1F7A3A',
  loss: '#A81E1E',
  exile: '#5A5F66',
  onExile: '#F2F2F2',
  requirement: '#1F4E8C',
  onRequirement: '#FFFFFF',
  onFace: '#1A1206',
  // A cell that asks a choice or holds an event (C8): an offered post, a minor post, an evaluation
  choice: '#0F6E5C',
  onChoice: '#FFFFFF',
  // Hat buttons by grade, first to ninth (illustrative)
  knob: {
    ruby: '#D7263D',
    coral: '#F25C54',
    sapphire: '#3A86FF',
    lapis: '#22409A',
    crystal: '#EAF4FF',
    shell: '#F4EEDC',
    gold: '#E0B03A',
    engravedGold: '#B8892E',
  },
} as const
