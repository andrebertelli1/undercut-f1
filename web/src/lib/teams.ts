// Identidade visual das equipes: cor e sigla. As cores são aproximações
// escolhidas para contrastar no fundo escuro, não valores oficiais.

interface TeamStyle {
  color: string;
  short: string;
}

const STYLES: Record<string, TeamStyle> = {
  mercedes: { color: '#27F4D2', short: 'MER' },
  ferrari: { color: '#E8002D', short: 'FER' },
  mclaren: { color: '#FF8000', short: 'MCL' },
  red_bull: { color: '#3671C6', short: 'RBR' },
  aston_martin: { color: '#229971', short: 'AMR' },
  alpine: { color: '#FF87BC', short: 'ALP' },
  williams: { color: '#64C4FF', short: 'WIL' },
  rb: { color: '#8FA8FF', short: 'RB' },
  haas: { color: '#D9DCDE', short: 'HAA' },
  audi: { color: '#C2452D', short: 'AUD' },
  cadillac: { color: '#C9B037', short: 'CAD' },
  // Equipes de temporadas anteriores
  sauber: { color: '#52E252', short: 'SAU' },
  alfa: { color: '#C92D4B', short: 'ALF' },
  alphatauri: { color: '#5E8FAA', short: 'AT' },
};

const FALLBACK: TeamStyle = { color: '#8A8F98', short: '—' };

export function teamStyle(teamId: string): TeamStyle {
  return STYLES[teamId] ?? { ...FALLBACK, short: teamId.slice(0, 3).toUpperCase() };
}

/** Preto ou branco, o que ler melhor sobre a cor dada (#rrggbb). */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.3 ? '#0a0a0a' : '#ffffff';
}

// Logos são opcionais: qualquer arquivo em src/assets/teams/<teamId>.(svg|png|webp)
// passa a aparecer no TeamBadge. Sem arquivo, o badge usa só cor e nome.
const logoFiles = import.meta.glob<string>('../assets/teams/*.{svg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const LOGOS: Record<string, string> = {};
for (const [path, url] of Object.entries(logoFiles)) {
  const id = path.split('/').pop()!.replace(/\.\w+$/, '');
  LOGOS[id] = url;
}

export function teamLogo(teamId: string): string | undefined {
  return LOGOS[teamId];
}
