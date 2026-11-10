import { teamLogo, teamStyle } from '../lib/teams.ts';

/** Marca da equipe: faixa de cor, mais o logo se houver arquivo em assets/teams. */
export function TeamBadge({ teamId, name }: { teamId: string; name?: string }) {
  const { color } = teamStyle(teamId);
  const logo = teamLogo(teamId);
  return (
    <span className="team-badge">
      {logo ? (
        <img className="team-logo" src={logo} alt="" />
      ) : (
        <span className="team-stripe" style={{ background: color }} />
      )}
      {name && <span className="team-name">{name}</span>}
    </span>
  );
}
