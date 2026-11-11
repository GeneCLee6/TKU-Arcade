// The shell's display faces (docs/ASSETS.md), all SIL OFL 1.1 from Google Fonts, nothing bundled,
// committed or kept on R2: Saira italic for Latin headings, Noto Sans TC 900 for Chinese ones and
// JetBrains Mono for numbers and labels. Only the weights the shell draws; Google slices each face by
// unicode-range, so a page downloads the slices of the characters it shows. The stylesheet is added
// from script, so it never holds up the first paint, and `font` (tokens.ts) falls back to the
// system's own faces until it is there, or if it never comes.
export const SHELL_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Noto+Sans+TC:wght@900&family=Saira:ital,wght@1,800;1,900&display=swap'

/** Asks for the faces once per page */
export function loadShellFonts(): void {
  const id = 'shell-fonts'
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = SHELL_FONTS_URL
  document.head.append(link)
}
