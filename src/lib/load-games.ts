import seedData from "./seed-data.json";
import {
  GameWithPlayerStats,
  PlayerInGame,
  PlayerChampionStats,
  League,
} from "./types";

const ROLE_ORDER = ["top", "jungle", "mid", "bot", "support"];
const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];

function roleIndex(role: string): number {
  const r = role.toLowerCase();
  const idx = ROLE_ORDER.indexOf(r);
  return idx >= 0 ? idx : 99;
}

export function loadGamesFromSeed(
  leagues: League[],
  daysBack: number = 7
): GameWithPlayerStats[] {
  const raw = seedData as any;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const games = (raw.games || []).filter(
    (g: any) => leagues.includes(g.league) && g.dateUtc.slice(0, 10) >= cutoffStr
  );

  if (games.length === 0) return [];

  const statsMap = new Map<string, PlayerChampionStats>();
  for (const s of raw.championStats || []) {
    statsMap.set(s.key, s);
  }

  const playerRecords = raw.playerRecords || [];

  return games.map((game: any): GameWithPlayerStats => {
    const gamePlayers = playerRecords.filter(
      (p: any) => p.gameId === game.gameId
    );

    let team1Players: PlayerInGame[];
    let team2Players: PlayerInGame[];

    if (gamePlayers.length >= 10) {
      team1Players = gamePlayers
        .filter(
          (p: any) => p.team.toLowerCase() === game.team1.toLowerCase()
        )
        .sort((a: any, b: any) => roleIndex(a.role) - roleIndex(b.role))
        .map(
          (p: any): PlayerInGame => ({
            playerName: p.playerName,
            champion: p.champion,
            role: p.role,
            championStats:
              statsMap.get(`${p.playerName}|||${p.champion}`) || null,
          })
        );

      team2Players = gamePlayers
        .filter(
          (p: any) => p.team.toLowerCase() === game.team2.toLowerCase()
        )
        .sort((a: any, b: any) => roleIndex(a.role) - roleIndex(b.role))
        .map(
          (p: any): PlayerInGame => ({
            playerName: p.playerName,
            champion: p.champion,
            role: p.role,
            championStats:
              statsMap.get(`${p.playerName}|||${p.champion}`) || null,
          })
        );
    } else {
      team1Players = (game.team1Picks || []).map(
        (champ: string, i: number): PlayerInGame => ({
          playerName: "",
          champion: champ,
          role: ROLES[i] || "",
          championStats: null,
        })
      );
      team2Players = (game.team2Picks || []).map(
        (champ: string, i: number): PlayerInGame => ({
          playerName: "",
          champion: champ,
          role: ROLES[i] || "",
          championStats: null,
        })
      );
    }

    return { ...game, team1Players, team2Players };
  });
}
