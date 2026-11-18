// ESPN's 30 NBA teams (ids are stable). Odds adapters use this table to map a
// provider's team names onto ESPN team ids without a database lookup.

export interface EspnTeamInfo {
  id: string;
  abbr: string;
  name: string;
  nickname: string;
}

export const ESPN_TEAMS: readonly EspnTeamInfo[] = [
  { id: '1', abbr: 'ATL', name: 'Atlanta Hawks', nickname: 'Hawks' },
  { id: '2', abbr: 'BOS', name: 'Boston Celtics', nickname: 'Celtics' },
  { id: '17', abbr: 'BKN', name: 'Brooklyn Nets', nickname: 'Nets' },
  { id: '30', abbr: 'CHA', name: 'Charlotte Hornets', nickname: 'Hornets' },
  { id: '4', abbr: 'CHI', name: 'Chicago Bulls', nickname: 'Bulls' },
  { id: '5', abbr: 'CLE', name: 'Cleveland Cavaliers', nickname: 'Cavaliers' },
  { id: '6', abbr: 'DAL', name: 'Dallas Mavericks', nickname: 'Mavericks' },
  { id: '7', abbr: 'DEN', name: 'Denver Nuggets', nickname: 'Nuggets' },
  { id: '8', abbr: 'DET', name: 'Detroit Pistons', nickname: 'Pistons' },
  { id: '9', abbr: 'GS', name: 'Golden State Warriors', nickname: 'Warriors' },
  { id: '10', abbr: 'HOU', name: 'Houston Rockets', nickname: 'Rockets' },
  { id: '11', abbr: 'IND', name: 'Indiana Pacers', nickname: 'Pacers' },
  { id: '12', abbr: 'LAC', name: 'LA Clippers', nickname: 'Clippers' },
  { id: '13', abbr: 'LAL', name: 'Los Angeles Lakers', nickname: 'Lakers' },
  { id: '29', abbr: 'MEM', name: 'Memphis Grizzlies', nickname: 'Grizzlies' },
  { id: '14', abbr: 'MIA', name: 'Miami Heat', nickname: 'Heat' },
  { id: '15', abbr: 'MIL', name: 'Milwaukee Bucks', nickname: 'Bucks' },
  { id: '16', abbr: 'MIN', name: 'Minnesota Timberwolves', nickname: 'Timberwolves' },
  { id: '3', abbr: 'NO', name: 'New Orleans Pelicans', nickname: 'Pelicans' },
  { id: '18', abbr: 'NY', name: 'New York Knicks', nickname: 'Knicks' },
  { id: '25', abbr: 'OKC', name: 'Oklahoma City Thunder', nickname: 'Thunder' },
  { id: '19', abbr: 'ORL', name: 'Orlando Magic', nickname: 'Magic' },
  { id: '20', abbr: 'PHI', name: 'Philadelphia 76ers', nickname: '76ers' },
  { id: '21', abbr: 'PHX', name: 'Phoenix Suns', nickname: 'Suns' },
  { id: '22', abbr: 'POR', name: 'Portland Trail Blazers', nickname: 'Trail Blazers' },
  { id: '23', abbr: 'SAC', name: 'Sacramento Kings', nickname: 'Kings' },
  { id: '24', abbr: 'SA', name: 'San Antonio Spurs', nickname: 'Spurs' },
  { id: '28', abbr: 'TOR', name: 'Toronto Raptors', nickname: 'Raptors' },
  { id: '26', abbr: 'UTAH', name: 'Utah Jazz', nickname: 'Jazz' },
  { id: '27', abbr: 'WSH', name: 'Washington Wizards', nickname: 'Wizards' },
];
