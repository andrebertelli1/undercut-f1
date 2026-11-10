import { ptBR, raceNamesPtBR } from './pt-BR.ts';

// Um único idioma por enquanto. Para o inglês: criar en.ts com o mesmo
// formato de ptBR e escolher o dicionário aqui.
export const t = ptBR;
const raceNames = raceNamesPtBR;

export function raceName(original: string): string {
  return raceNames[original] ?? original;
}

const dateFmt = new Intl.DateTimeFormat(t.locale, {
  timeZone: t.timeZone,
  day: 'numeric',
  month: 'short',
});
const dateTimeFmt = new Intl.DateTimeFormat(t.locale, {
  timeZone: t.timeZone,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (iso: string) => dateFmt.format(new Date(iso)).replace('.', '');
export const formatDateTime = (iso: string) =>
  `${dateTimeFmt.format(new Date(iso)).replace(/\./g, '')} (${t.timeZoneLabel})`;

/** Dias de calendário, no fuso do site, entre agora e a data dada. */
export function daysUntil(iso: string, now = new Date()): number {
  const day = (d: Date) =>
    Date.parse(
      new Intl.DateTimeFormat('en-CA', { timeZone: t.timeZone }).format(d) + 'T00:00:00Z',
    );
  return Math.round((day(new Date(iso)) - day(now)) / 86_400_000);
}
