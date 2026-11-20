import { TeamLogo } from '@blueline/ui';
import styles from './Matchup.module.css';

interface Team {
  abbr: string;
}

/** "[logo] GS @ [logo] MEM". Usable from server components; the logos are client islands. */
export function Matchup({
  away,
  home,
  logoSize,
  className,
}: {
  away: Team;
  home: Team;
  /** Logo size in px; match it to the text size around it. */
  logoSize: number;
  className?: string;
}) {
  return (
    <span className={className ? `${styles.matchup} ${className}` : styles.matchup}>
      <span className={styles.team}>
        <TeamLogo abbr={away.abbr} size={logoSize} />
        {away.abbr}
      </span>
      <span className={styles.at}>@</span>
      <span className={styles.team}>
        <TeamLogo abbr={home.abbr} size={logoSize} />
        {home.abbr}
      </span>
    </span>
  );
}
