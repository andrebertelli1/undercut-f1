import { useMemo, useState } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { buildStory } from '../../lib/insights.ts';
import { formatClock } from '../../lib/race.ts';
import { codeOf, SpoilerNote, type TabProps } from './shared.tsx';

const LEVELS = [3, 2, 1] as const;

/**
 * Aba História: os acontecimentos da corrida em ordem, com filtro por
 * importância. Clicar em um deles leva o replay para aquele instante.
 */
export function Story({ race, limitT, unlocked, onReveal, onOpenAt }: TabProps) {
  const story = useMemo(() => buildStory(race), [race]);
  const [level, setLevel] = useState<1 | 2 | 3>(2);
  const code = codeOf(race);
  const shown = story.filter((e) => e.importance >= level && (unlocked || e.t <= limitT));
  const hidden = !unlocked && story.some((e) => e.t > limitT);

  return (
    <div className="strategy">
      <section>
        <div className="strategy-head">
          <h2>{i18n.storyTitle}</h2>
          <div className="pills small" role="group" aria-label={i18n.storyFilter}>
            {LEVELS.map((l) => (
              <button key={l} className={l === level ? 'is-on' : ''} onClick={() => setLevel(l)} aria-pressed={l === level}>
                {i18n.storyLevel[l]}
              </button>
            ))}
          </div>
        </div>
        {hidden && <SpoilerNote onReveal={onReveal}>{i18n.storyLimited}</SpoilerNote>}
        {shown.length === 0 ? (
          <p className="note muted">{i18n.feedEmpty}</p>
        ) : (
          <ol className="story">
            {shown.map((e, i) => (
              <li key={`${e.t}${e.kind}${e.drivers?.join() ?? ''}${i}`}>
                <button
                  className={`story-item event-${e.kind} importance-${e.importance}`}
                  onClick={() => onOpenAt(e.t - 4, e.drivers?.[0])}
                  title={i18n.openInReplay}
                >
                  <span className="story-when num">
                    <strong>{e.lap > 0 ? i18n.lapShort(e.lap) : '—'}</strong>
                    <span className="muted">{formatClock(e.t)}</span>
                  </span>
                  <span className="story-body">
                    <span className="story-kind">{i18n.eventCategory(e.kind)}</span>
                    <span>{i18n.eventText(e, code)}</span>
                  </span>
                  <span className={`tag source-${e.source}`} title={i18n.sourceHelp[e.source]}>
                    {i18n.source[e.source]}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
