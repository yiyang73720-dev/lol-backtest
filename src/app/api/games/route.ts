import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  fetchRecentGames,
  fetchPlayersForGames,
  fetchPlayerChampionStats,
} from "@/lib/leaguepedia";
import {
  GameWithPlayerStats,
  PlayerInGame,
  PlayerChampionStats,
  League,
} from "@/lib/types";

const ROLE_ORDER = ["top", "jungle", "mid", "bot", "support"];

function roleIndex(role: string): number {
  const r = role.toLowerCase();
  const idx = ROLE_ORDER.indexOf(r);
  return idx >= 0 ? idx : 99;
}

// Try loading from local cache first (populated by scripts/fetch-recent.ts)
function loadFromCache(leagues: League[], daysBack: number): GameWithPlayerStats[] | null {
  const cachePath = join(process.cwd(), "cache", "seed-data.json");
  if (!existsSync(cachePath)) return null;

  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));

    // Check freshness: cache must be less than 2 hours old
    const cacheAge = Date.now() - new Date(raw.generatedAt).getTime();
    if (cacheAge > 2 * 60 * 60 * 1000) return null;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Filter games by league and date
    const games = (raw.games || []).filter(
      (g: any) => leagues.includes(g.league) && g.dateUtc.slice(0, 10) >= cutoffStr
    );

    if (games.length === 0) return null;

    // Build champion stats map
    const statsMap = new Map<string, PlayerChampionStats>();
    for (const s of raw.championStats || []) {
      statsMap.set(s.key, s);
    }

    // Merge players into games
    const playerRecords = raw.playerRecords || [];
    const roles = ["Top", "Jungle", "Mid", "Bot", "Support"];
    return games.map((game: any): GameWithPlayerStats => {
      const gamePlayers = playerRecords.filter((p: any) => p.gameId === game.gameId);

      let team1Players: PlayerInGame[];
      let team2Players: PlayerInGame[];

      if (gamePlayers.length >= 10) {
        team1Players = gamePlayers
          .filter((p: any) => p.team.toLowerCase() === game.team1.toLowerCase())
          .sort((a: any, b: any) => roleIndex(a.role) - roleIndex(b.role))
          .map((p: any): PlayerInGame => ({
            playerName: p.playerName,
            champion: p.champion,
            role: p.role,
            championStats: statsMap.get(`${p.playerName}|||${p.champion}`) || null,
          }));

        team2Players = gamePlayers
          .filter((p: any) => p.team.toLowerCase() === game.team2.toLowerCase())
          .sort((a: any, b: any) => roleIndex(a.role) - roleIndex(b.role))
          .map((p: any): PlayerInGame => ({
            playerName: p.playerName,
            champion: p.champion,
            role: p.role,
            championStats: statsMap.get(`${p.playerName}|||${p.champion}`) || null,
          }));
      } else {
        // Fallback: use picks from game data (no player names)
        team1Players = (game.team1Picks || []).map((champ: string, i: number): PlayerInGame => ({
          playerName: "",
          champion: champ,
          role: roles[i] || "",
          championStats: null,
        }));
        team2Players = (game.team2Picks || []).map((champ: string, i: number): PlayerInGame => ({
          playerName: "",
          champion: champ,
          role: roles[i] || "",
          championStats: null,
        }));
      }

      return { ...game, team1Players, team2Players };
    });
  } catch (e) {
    console.error("Cache read error:", e);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leaguesParam = searchParams.get("leagues") || "LCK,LPL,LEC,LCS";
  const daysBack = parseInt(searchParams.get("days") || "7");
  const leagues = leaguesParam.split(",") as League[];
  const forceRefresh = searchParams.get("refresh") === "true";

  try {
    // Try cache first
    if (!forceRefresh) {
      const cached = loadFromCache(leagues, daysBack);
      if (cached && cached.length > 0) {
        return NextResponse.json({ games: cached, source: "cache" });
      }
    }

    // Fall back to live API
    const games = await fetchRecentGames(leagues, daysBack);

    if (games.length === 0) {
      return NextResponse.json({ games: [], source: "api" });
    }

    const gameIds = games.map((g) => g.gameId);
    const playerRecords = await fetchPlayersForGames(gameIds);

    const playerChampionPairs = playerRecords.map((p) => ({
      playerName: p.playerName,
      champion: p.champion,
    }));

    const champStats = await fetchPlayerChampionStats(playerChampionPairs);

    const roles = ["Top", "Jungle", "Mid", "Bot", "Support"];
    const gamesWithStats: GameWithPlayerStats[] = games.map((game) => {
      const gamePlayers = playerRecords.filter((p) => p.gameId === game.gameId);

      let team1Players: PlayerInGame[];
      let team2Players: PlayerInGame[];

      if (gamePlayers.length >= 10) {
        team1Players = gamePlayers
          .filter((p) => p.team.toLowerCase() === game.team1.toLowerCase())
          .sort((a, b) => roleIndex(a.role) - roleIndex(b.role))
          .map((p): PlayerInGame => ({
            playerName: p.playerName,
            champion: p.champion,
            role: p.role,
            championStats: champStats.get(`${p.playerName}|||${p.champion}`) || null,
          }));

        team2Players = gamePlayers
          .filter((p) => p.team.toLowerCase() === game.team2.toLowerCase())
          .sort((a, b) => roleIndex(a.role) - roleIndex(b.role))
          .map((p): PlayerInGame => ({
            playerName: p.playerName,
            champion: p.champion,
            role: p.role,
            championStats: champStats.get(`${p.playerName}|||${p.champion}`) || null,
          }));
      } else {
        team1Players = (game.team1Picks || []).map((champ: string, i: number): PlayerInGame => ({
          playerName: "",
          champion: champ,
          role: roles[i] || "",
          championStats: null,
        }));
        team2Players = (game.team2Picks || []).map((champ: string, i: number): PlayerInGame => ({
          playerName: "",
          champion: champ,
          role: roles[i] || "",
          championStats: null,
        }));
      }

      return { ...game, team1Players, team2Players };
    });

    return NextResponse.json({ games: gamesWithStats, source: "api" });
  } catch (error) {
    console.error("Error fetching games:", error);
    return NextResponse.json(
      { error: "Failed to fetch games", details: String(error) },
      { status: 500 }
    );
  }
}
