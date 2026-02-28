/**
 * Complete fetch pipeline for LoL esports backtesting data.
 *
 * Data flow:
 * 1. LoL Esports API → match schedule + game IDs (fast, no rate limit)
 * 2. LoL Esports Live Stats → player-champion mappings per game (fast, no auth)
 * 3. Leaguepedia → historical player champion stats (rate limited)
 *
 * Usage: npx tsx scripts/fetch-all.ts
 */

const ESPORTS_API = "https://esports-api.lolesports.com/persisted/gw";
const LIVE_STATS_API = "https://feed.lolesports.com/livestats/v1";
const LEAGUEPEDIA_API = "https://lol.fandom.com/api.php";
const API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";

// League IDs for the 4 major regions
const LEAGUE_IDS: Record<string, string> = {
  LCK: "98767991310872058",
  LPL: "98767991314006698",
  LEC: "98767991302996019",
  LCS: "98767991299243165",
};

// ── LoL Esports API (no rate limit) ──────────────────────────

async function esportsFetch(endpoint: string): Promise<any> {
  const url = `${ESPORTS_API}/${endpoint}`;
  const res = await fetch(url, {
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) throw new Error(`Esports API ${res.status}: ${url}`);
  return res.json();
}

interface EsportsMatch {
  matchId: string;
  startTime: string;
  blockName: string;
  leagueName: string;
  leagueSlug: string;
  team1: { name: string; code: string; result?: { outcome: string; gameWins: number } };
  team2: { name: string; code: string; result?: { outcome: string; gameWins: number } };
  games: { id: string; number: number; state: string; teams: any[] }[];
  strategy: { type: string; count: number };
  state: string;
}

async function fetchRecentMatches(leagueId: string, leagueName: string): Promise<EsportsMatch[]> {
  const data = await esportsFetch(`getSchedule?hl=en-US&leagueId=${leagueId}`);
  const schedule = data?.data?.schedule;
  if (!schedule?.events) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  const matches: EsportsMatch[] = [];

  for (const e of schedule.events) {
    if (e.type !== "match" || e.state !== "completed") continue;
    const matchDate = new Date(e.startTime);
    if (matchDate < cutoff) continue;

    const matchId = e.match?.id;
    if (!matchId) continue;

    // Fetch game IDs from getEventDetails
    let gamesList: any[] = [];
    try {
      const details = await esportsFetch(`getEventDetails?hl=en-US&id=${matchId}`);
      gamesList = details?.data?.event?.match?.games || [];
    } catch (err) {
      console.log(`    Could not fetch details for match ${matchId}`);
    }

    matches.push({
      matchId,
      startTime: e.startTime,
      blockName: e.blockName || "",
      leagueName,
      leagueSlug: e.league?.slug || leagueName.toLowerCase(),
      team1: e.match?.teams?.[0] || { name: "?", code: "?" },
      team2: e.match?.teams?.[1] || { name: "?", code: "?" },
      games: gamesList
        .filter((g: any) => g.state === "completed" && g.id)
        .map((g: any) => ({ id: g.id, number: g.number, state: g.state, teams: g.teams || [] })),
      strategy: e.match?.strategy || { type: "bestOf", count: 3 },
      state: e.state,
    });
  }

  return matches;
}

// ── Live Stats API (no auth, no rate limit) ──────────────────

interface PlayerPick {
  participantId: number;
  summonerName: string;
  championId: string;
  role: string;
}

interface GameDraft {
  esportsGameId: string;
  blueTeam: PlayerPick[];
  redTeam: PlayerPick[];
  blueTeamId: string;
  redTeamId: string;
}

async function fetchGameDraft(gameId: string): Promise<GameDraft | null> {
  try {
    const url = `${LIVE_STATS_API}/window/${gameId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const meta = data?.gameMetadata;
    if (!meta) return null;

    const blueTeam = (meta.blueTeamMetadata?.participantMetadata || []).map((p: any) => ({
      participantId: p.participantId,
      summonerName: p.summonerName || p.esportsPlayerId || "",
      championId: p.championId || "",
      role: p.role || "",
    }));

    const redTeam = (meta.redTeamMetadata?.participantMetadata || []).map((p: any) => ({
      participantId: p.participantId,
      summonerName: p.summonerName || p.esportsPlayerId || "",
      championId: p.championId || "",
      role: p.role || "",
    }));

    return {
      esportsGameId: gameId,
      blueTeam,
      redTeam,
      blueTeamId: meta.blueTeamMetadata?.esportsTeamId || "",
      redTeamId: meta.redTeamMetadata?.esportsTeamId || "",
    };
  } catch (e) {
    console.error(`  Failed to fetch draft for game ${gameId}:`, e);
    return null;
  }
}

// ── Leaguepedia (rate limited) ───────────────────────────────

let lastLeaguepediaReq = 0;
async function leaguepediaFetch(url: string, retries = 3): Promise<any> {
  const now = Date.now();
  const wait = 8000 - (now - lastLeaguepediaReq);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastLeaguepediaReq = Date.now();

  const res = await fetch(url);
  const data = await res.json();

  if (data.error && data.error.code === "ratelimited") {
    if (retries > 0) {
      console.log("    Leaguepedia rate limited, waiting 30s...");
      await new Promise((r) => setTimeout(r, 30000));
      lastLeaguepediaReq = Date.now();
      return leaguepediaFetch(url, retries - 1);
    }
    return { cargoquery: [] };
  }
  return data;
}

function buildCargoQuery(params: {
  tables: string;
  fields: string;
  where: string;
  groupBy?: string;
  limit?: number;
}): string {
  const q = new URLSearchParams({
    action: "cargoquery",
    tables: params.tables,
    fields: params.fields,
    where: params.where,
    limit: String(params.limit || 50),
    format: "json",
  });
  if (params.groupBy) q.set("group_by", params.groupBy);
  return `${LEAGUEPEDIA_API}?${q.toString()}`;
}

async function fetchChampionStats(
  playerName: string,
  champion: string
): Promise<{ gamesPlayed: number; wins: number; winRate: number; avgKills: number; avgDeaths: number; avgAssists: number } | null> {
  const url = buildCargoQuery({
    tables: "ScoreboardPlayers",
    fields: 'Link=PlayerName,Champion,COUNT(*)=GamesPlayed,SUM(CASE WHEN PlayerWin="Yes" THEN 1 ELSE 0 END)=Wins,AVG(Kills)=AvgKills,AVG(Deaths)=AvgDeaths,AVG(Assists)=AvgAssists',
    where: `Link="${playerName}" AND Champion="${champion}" AND DateTime_UTC >= "2024-01-01"`,
    groupBy: "Link,Champion",
    limit: 1,
  });

  const data = await leaguepediaFetch(url);
  if (!data.cargoquery || data.cargoquery.length === 0) return null;

  const t = data.cargoquery[0].title;
  const gp = parseInt(t["GamesPlayed"] || "0");
  const wins = parseInt(t["Wins"] || "0");
  return {
    gamesPlayed: gp,
    wins,
    winRate: gp > 0 ? wins / gp : 0,
    avgKills: parseFloat(t["AvgKills"] || "0"),
    avgDeaths: parseFloat(t["AvgDeaths"] || "0"),
    avgAssists: parseFloat(t["AvgAssists"] || "0"),
  };
}

// Also try searching by summoner name fragments since esports API
// uses display names while Leaguepedia uses wiki Link names
async function fetchChampionStatsFuzzy(
  displayName: string,
  champion: string
): Promise<{ playerName: string; gamesPlayed: number; wins: number; winRate: number; avgKills: number; avgDeaths: number; avgAssists: number } | null> {
  // Clean display name: "DK ShowMaker" -> "ShowMaker", "T1 Faker" -> "Faker"
  const parts = displayName.split(" ");
  const shortName = parts.length > 1 ? parts[parts.length - 1] : displayName;

  // Try exact match first
  const exact = await fetchChampionStats(shortName, champion);
  if (exact && exact.gamesPlayed > 0) return { playerName: shortName, ...exact };

  // Try with full display name
  if (shortName !== displayName) {
    const full = await fetchChampionStats(displayName, champion);
    if (full && full.gamesPlayed > 0) return { playerName: displayName, ...full };
  }

  // Try LIKE search
  const url = buildCargoQuery({
    tables: "ScoreboardPlayers",
    fields: 'Link=PlayerName,Champion,COUNT(*)=GamesPlayed,SUM(CASE WHEN PlayerWin="Yes" THEN 1 ELSE 0 END)=Wins,AVG(Kills)=AvgKills,AVG(Deaths)=AvgDeaths,AVG(Assists)=AvgAssists',
    where: `Link LIKE "%${shortName}%" AND Champion="${champion}" AND DateTime_UTC >= "2024-01-01"`,
    groupBy: "Link,Champion",
    limit: 1,
  });

  const data = await leaguepediaFetch(url);
  if (!data.cargoquery || data.cargoquery.length === 0) return null;

  const t = data.cargoquery[0].title;
  const gp = parseInt(t["GamesPlayed"] || "0");
  const wins = parseInt(t["Wins"] || "0");
  return {
    playerName: t["PlayerName"] || shortName,
    gamesPlayed: gp,
    wins,
    winRate: gp > 0 ? wins / gp : 0,
    avgKills: parseFloat(t["AvgKills"] || "0"),
    avgDeaths: parseFloat(t["AvgDeaths"] || "0"),
    avgAssists: parseFloat(t["AvgAssists"] || "0"),
  };
}

// ── Main pipeline ────────────────────────────────────────────

interface OutputGame {
  gameId: string;
  matchId: string;
  gameNumber: number;
  dateUtc: string;
  league: string;
  tournament: string;
  team1: string;
  team2: string;
  team1Code: string;
  team2Code: string;
  winTeam: string;
  team1Picks: string[];
  team2Picks: string[];
  team1Bans: string[];
  team2Bans: string[];
  gameLength: string;
  patch: string;
}

interface OutputPlayer {
  gameId: string;
  playerName: string;
  champion: string;
  role: string;
  team: string;
  side: string; // "blue" | "red"
}

interface OutputChampStat {
  key: string;
  playerName: string;
  champion: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
}

async function main() {
  const { mkdirSync, writeFileSync, existsSync, readFileSync } = await import("fs");
  const { join } = await import("path");

  const cacheDir = join(process.cwd(), "cache");
  mkdirSync(cacheDir, { recursive: true });

  // Load existing cache to preserve champion stats we already fetched
  let existingStats = new Map<string, OutputChampStat>();
  const cachePath = join(process.cwd(), "src", "lib", "seed-data.json");
  if (existsSync(cachePath)) {
    try {
      const old = JSON.parse(readFileSync(cachePath, "utf-8"));
      for (const s of old.championStats || []) {
        existingStats.set(s.key, s);
      }
      console.log(`Loaded ${existingStats.size} existing champion stats from cache`);
    } catch {}
  }

  console.log("\n=== Step 1: Fetch match schedule from LoL Esports API ===\n");

  const allMatches: EsportsMatch[] = [];
  for (const [league, leagueId] of Object.entries(LEAGUE_IDS)) {
    console.log(`Fetching ${league} schedule...`);
    try {
      const matches = await fetchRecentMatches(leagueId, league);
      allMatches.push(...matches);
      console.log(`  ${matches.length} completed matches`);
    } catch (e) {
      console.error(`  Error fetching ${league}:`, e);
    }
  }

  console.log(`\nTotal matches: ${allMatches.length}`);

  // Collect all game IDs
  const allGameIds: { gameId: string; match: EsportsMatch; gameNum: number }[] = [];
  for (const match of allMatches) {
    for (const game of match.games) {
      if (game.state === "completed" && game.id) {
        allGameIds.push({ gameId: game.id, match, gameNum: game.number });
      }
    }
  }
  console.log(`Total individual games: ${allGameIds.length}`);

  console.log("\n=== Step 2: Fetch player-champion data from Live Stats ===\n");

  const allGames: OutputGame[] = [];
  const allPlayers: OutputPlayer[] = [];
  let fetched = 0;

  for (const { gameId, match, gameNum } of allGameIds) {
    fetched++;
    if (fetched % 10 === 0 || fetched === 1) {
      console.log(`  ${fetched}/${allGameIds.length}...`);
    }

    const draft = await fetchGameDraft(gameId);
    if (!draft) {
      console.log(`  Skipping game ${gameId} (no draft data)`);
      continue;
    }

    // Determine winner
    const team1Won = match.team1.result?.outcome === "win";
    const winTeam = team1Won ? match.team1.name : match.team2.name;

    // Map teams to sides
    // We need to figure out which esports team is blue and which is red
    const blueChamps = draft.blueTeam.map((p) => p.championId);
    const redChamps = draft.redTeam.map((p) => p.championId);

    const game: OutputGame = {
      gameId,
      matchId: match.matchId,
      gameNumber: gameNum,
      dateUtc: match.startTime,
      league: match.leagueName,
      tournament: `${match.leagueName} ${match.blockName}`.trim(),
      team1: match.team1.name,
      team2: match.team2.name,
      team1Code: match.team1.code,
      team2Code: match.team2.code,
      winTeam,
      team1Picks: blueChamps,
      team2Picks: redChamps,
      team1Bans: [],
      team2Bans: [],
      gameLength: "",
      patch: "",
    };
    allGames.push(game);

    // Add player records
    for (const p of draft.blueTeam) {
      allPlayers.push({
        gameId,
        playerName: p.summonerName,
        champion: p.championId,
        role: p.role,
        team: match.team1.name, // blue = team1 initially
        side: "blue",
      });
    }
    for (const p of draft.redTeam) {
      allPlayers.push({
        gameId,
        playerName: p.summonerName,
        champion: p.championId,
        role: p.role,
        team: match.team2.name, // red = team2 initially
        side: "red",
      });
    }

    // Small delay to be respectful
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nGames with draft data: ${allGames.length}`);
  console.log(`Player records: ${allPlayers.length}`);

  // Save intermediate results (games + players) immediately
  const saveFn = (champStats: OutputChampStat[]) => {
    const output = {
      generatedAt: new Date().toISOString(),
      games: allGames,
      playerRecords: allPlayers,
      championStats: champStats,
    };
    const outPath = join(process.cwd(), "src", "lib", "seed-data.json");
    writeFileSync(outPath, JSON.stringify(output));
    writeFileSync(join(cacheDir, "seed-data.json"), JSON.stringify(output));
    return outPath;
  };

  // Save now with empty stats so we have data even if step 3 fails
  saveFn([...existingStats.values()]);
  console.log("Intermediate save complete (games + players)");

  console.log("\n=== Step 3: Fetch champion stats from Leaguepedia ===\n");

  // Unique player-champion pairs
  const uniquePairs = [
    ...new Set(allPlayers.map((p) => `${p.playerName}|||${p.champion}`)),
  ];
  console.log(`Unique player-champion pairs: ${uniquePairs.length}`);

  // Cap Leaguepedia fetches to avoid hour-long waits
  const MAX_NEW_STATS = 100;
  const champStats: OutputChampStat[] = [];
  let statsFound = 0;
  let statsFromCache = 0;
  let newFetches = 0;

  for (let i = 0; i < uniquePairs.length; i++) {
    const [playerName, champion] = uniquePairs[i].split("|||");
    const key = uniquePairs[i];

    if (i % 20 === 0) {
      console.log(`  ${i}/${uniquePairs.length} (found: ${statsFound}, cached: ${statsFromCache}, new fetches: ${newFetches}/${MAX_NEW_STATS})...`);
    }

    // Check existing cache first
    if (existingStats.has(key)) {
      champStats.push(existingStats.get(key)!);
      statsFromCache++;
      continue;
    }

    // Stop fetching new stats after cap
    if (newFetches >= MAX_NEW_STATS) continue;
    newFetches++;

    // Fetch from Leaguepedia
    const stats = await fetchChampionStatsFuzzy(playerName, champion);
    if (stats && stats.gamesPlayed > 0) {
      champStats.push({
        key,
        playerName: stats.playerName,
        champion,
        gamesPlayed: stats.gamesPlayed,
        wins: stats.wins,
        winRate: stats.winRate,
        avgKills: stats.avgKills,
        avgDeaths: stats.avgDeaths,
        avgAssists: stats.avgAssists,
      });
      statsFound++;
    }
  }

  console.log(`\nChampion stats: ${champStats.length} (${statsFound} new, ${statsFromCache} cached)`);

  // Final save
  const outPath = saveFn(champStats);
  console.log(`\nSaved to ${outPath}`);
  console.log(`Games: ${allGames.length} | Players: ${allPlayers.length} | ChampStats: ${champStats.length}`);

  // Also save to cache for backup
  writeFileSync(join(cacheDir, "seed-data.json"), JSON.stringify(output, null, 2));
}

main().catch(console.error);
