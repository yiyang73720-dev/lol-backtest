/**
 * Seed script: imports recent games and player stats from ~/lol-quant/ CSVs
 * into a local JSON cache that the app reads instantly (no API calls needed).
 *
 * Usage: npx tsx scripts/seed-from-csv.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const LOL_QUANT = join(process.env.HOME || "~", "lol-quant");
const CACHE_DIR = join(process.cwd(), "cache");

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = values[i] || ""));
    return row;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseLeague(tournament: string): string {
  const t = tournament.toUpperCase();
  if (t.includes("LCK")) return "LCK";
  if (t.includes("LPL")) return "LPL";
  if (t.includes("LEC")) return "LEC";
  if (t.includes("LCS")) return "LCS";
  return "OTHER";
}

function main() {
  mkdirSync(CACHE_DIR, { recursive: true });

  // Calculate date range (last 14 days to ensure coverage)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  console.log(`Seeding data from ${LOL_QUANT}...`);
  console.log(`Cutoff date: ${cutoffStr}`);

  // 1. Parse games
  const gamesCSV = readFileSync(join(LOL_QUANT, "scoreboard_games.csv"), "utf-8");
  const allGames = parseCSV(gamesCSV);

  const majorLeagues = ["LCK", "LPL", "LEC", "LCS"];
  const recentGames = allGames.filter((g) => {
    const league = parseLeague(g["Tournament"]);
    const date = (g["DateTime UTC"] || "").slice(0, 10);
    return majorLeagues.includes(league) && date >= cutoffStr;
  });

  console.log(`Found ${recentGames.length} recent games from major leagues`);

  const games = recentGames.map((g) => ({
    gameId: g["GameId"] || "",
    dateUtc: g["DateTime UTC"] || "",
    tournament: g["Tournament"] || "",
    league: parseLeague(g["Tournament"]),
    team1: g["Team1"] || "",
    team2: g["Team2"] || "",
    winTeam: g["WinTeam"] || "",
    team1Picks: (g["Team1Picks"] || "").split(",").map((s: string) => s.trim()).filter(Boolean),
    team2Picks: (g["Team2Picks"] || "").split(",").map((s: string) => s.trim()).filter(Boolean),
    team1Bans: (g["Team1Bans"] || "").split(",").map((s: string) => s.trim()).filter(Boolean),
    team2Bans: (g["Team2Bans"] || "").split(",").map((s: string) => s.trim()).filter(Boolean),
    team1Score: g["Team1Score"] || "",
    team2Score: g["Team2Score"] || "",
    gameLength: g["Gamelength"] || "",
    patch: g["Patch"] || "",
  }));

  // 2. Parse player stats
  const playersCSV = readFileSync(join(LOL_QUANT, "player_stats.csv"), "utf-8");
  const allPlayers = parseCSV(playersCSV);
  console.log(`Total player records: ${allPlayers.length}`);

  // Get all game IDs from recent games
  const recentGameIds = new Set(games.map((g) => g.gameId));

  // Players in recent games
  const recentPlayers = allPlayers.filter((p) => recentGameIds.has(p["GameId"]));
  console.log(`Player records for recent games: ${recentPlayers.length}`);

  const playerRecords = recentPlayers.map((p) => ({
    gameId: p["GameId"] || "",
    dateUtc: p["DateTime UTC"] || "",
    playerName: p["Name"] || "",
    champion: p["Champion"] || "",
    role: p["Role"] || "",
    team: p["Team"] || "",
    kills: parseInt(p["Kills"] || "0"),
    deaths: parseInt(p["Deaths"] || "0"),
    assists: parseInt(p["Assists"] || "0"),
    gold: parseInt(p["Gold"] || "0"),
    cs: parseInt(p["CS"] || "0"),
    playerWin: p["PlayerWin"] === "Yes",
  }));

  // 3. Build champion stats for each player-champion combo in recent games
  // Use all historical data (not just recent) for win rates
  const playerChampPairs = new Set(
    recentPlayers.map((p) => `${p["Name"]}|||${p["Champion"]}`)
  );

  const champStatsMap: Record<
    string,
    { gamesPlayed: number; wins: number; totalKills: number; totalDeaths: number; totalAssists: number }
  > = {};

  // Use last 2 years of data for champion stats
  const statsCutoff = new Date();
  statsCutoff.setFullYear(statsCutoff.getFullYear() - 2);
  const statsCutoffStr = statsCutoff.toISOString().slice(0, 10);

  for (const p of allPlayers) {
    const key = `${p["Name"]}|||${p["Champion"]}`;
    if (!playerChampPairs.has(key)) continue;
    const date = (p["DateTime UTC"] || "").slice(0, 10);
    if (date < statsCutoffStr) continue;

    if (!champStatsMap[key]) {
      champStatsMap[key] = { gamesPlayed: 0, wins: 0, totalKills: 0, totalDeaths: 0, totalAssists: 0 };
    }
    champStatsMap[key].gamesPlayed++;
    if (p["PlayerWin"] === "Yes") champStatsMap[key].wins++;
    champStatsMap[key].totalKills += parseInt(p["Kills"] || "0");
    champStatsMap[key].totalDeaths += parseInt(p["Deaths"] || "0");
    champStatsMap[key].totalAssists += parseInt(p["Assists"] || "0");
  }

  const championStats = Object.entries(champStatsMap).map(([key, stats]) => {
    const [playerName, champion] = key.split("|||");
    return {
      key,
      playerName,
      champion,
      gamesPlayed: stats.gamesPlayed,
      wins: stats.wins,
      winRate: stats.gamesPlayed > 0 ? stats.wins / stats.gamesPlayed : 0,
      avgKills: stats.gamesPlayed > 0 ? stats.totalKills / stats.gamesPlayed : 0,
      avgDeaths: stats.gamesPlayed > 0 ? stats.totalDeaths / stats.gamesPlayed : 0,
      avgAssists: stats.gamesPlayed > 0 ? stats.totalAssists / stats.gamesPlayed : 0,
    };
  });

  console.log(`Champion stat entries: ${championStats.length}`);

  // 4. Write cache
  const cache = {
    generatedAt: new Date().toISOString(),
    cutoffDate: cutoffStr,
    games,
    playerRecords,
    championStats,
  };

  writeFileSync(join(CACHE_DIR, "seed-data.json"), JSON.stringify(cache, null, 2));
  console.log(`\nCache written to cache/seed-data.json`);
  console.log(`Games: ${games.length}, Players: ${playerRecords.length}, ChampStats: ${championStats.length}`);
}

main();
