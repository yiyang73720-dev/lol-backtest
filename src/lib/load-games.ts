import seedData from "./seed-data.json";
import {
  GameWithPlayerStats,
  PlayerInGame,
  PlayerChampionStats,
  League,
} from "./types";

const ROLE_ORDER = ["top", "jungle", "mid", "bot", "support"];

function roleIndex(role: string): number {
  const r = role.toLowerCase();
  const idx = ROLE_ORDER.indexOf(r);
  return idx >= 0 ? idx : 99;
}

function parseLeague(league: string): League | null {
  const u = league.toUpperCase();
  if (u === "LCK" || u.includes("LCK")) return "LCK";
  if (u === "LPL" || u.includes("LPL")) return "LPL";
  if (u === "LEC" || u.includes("LEC")) return "LEC";
  if (u === "LCS" || u.includes("LCS")) return "LCS";
  return null;
}

export function loadGamesFromSeed(
  leagues: League[],
  daysBack: number = 14
): GameWithPlayerStats[] {
  const raw = seedData as any;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const games = (raw.games || []).filter((g: any) => {
    const gl = parseLeague(g.league);
    if (!gl || !leagues.includes(gl)) return false;
    const gameDate = new Date(g.dateUtc);
    return gameDate >= cutoff;
  });

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

    // Match players to teams by side or team name
    const bluePlayers = gamePlayers.filter(
      (p: any) =>
        p.side === "blue" ||
        p.team?.toLowerCase() === game.team1?.toLowerCase()
    );
    const redPlayers = gamePlayers.filter(
      (p: any) =>
        p.side === "red" ||
        p.team?.toLowerCase() === game.team2?.toLowerCase()
    );

    const mapPlayer = (p: any): PlayerInGame => ({
      playerName: p.playerName || "",
      champion: p.champion || "",
      role: p.role || "",
      championStats:
        statsMap.get(`${p.playerName}|||${p.champion}`) || null,
    });

    const team1Players =
      bluePlayers.length > 0
        ? bluePlayers
            .sort((a: any, b: any) => roleIndex(a.role) - roleIndex(b.role))
            .map(mapPlayer)
        : (game.team1Picks || []).map(
            (champ: string, i: number): PlayerInGame => ({
              playerName: "",
              champion: champ,
              role: ["Top", "Jungle", "Mid", "Bot", "Support"][i] || "",
              championStats: null,
            })
          );

    const team2Players =
      redPlayers.length > 0
        ? redPlayers
            .sort((a: any, b: any) => roleIndex(a.role) - roleIndex(b.role))
            .map(mapPlayer)
        : (game.team2Picks || []).map(
            (champ: string, i: number): PlayerInGame => ({
              playerName: "",
              champion: champ,
              role: ["Top", "Jungle", "Mid", "Bot", "Support"][i] || "",
              championStats: null,
            })
          );

    return {
      ...game,
      league: parseLeague(game.league) || game.league,
      team1Players,
      team2Players,
    };
  });
}
