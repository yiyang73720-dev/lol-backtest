/**
 * Fetches the latest 7 days of games + player stats from Leaguepedia.
 * Saves to cache/seed-data.json for instant app loading.
 *
 * Usage: npx tsx scripts/fetch-recent.ts
 */

const BASE_URL = "https://lol.fandom.com/api.php";

let lastReqTime = 0;
async function rateFetch(url: string): Promise<any> {
  const now = Date.now();
  const wait = 5500 - (now - lastReqTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqTime = Date.now();

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) {
      console.log("  Rate limited, waiting 15s...");
      await new Promise((r) => setTimeout(r, 15000));
      lastReqTime = Date.now();
      return fetch(url).then((r) => r.json());
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

function buildQuery(params: {
  tables: string;
  fields: string;
  where: string;
  groupBy?: string;
  orderBy?: string;
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
  if (params.orderBy) q.set("order_by", params.orderBy);
  return `${BASE_URL}?${q.toString()}`;
}

function parseLeague(t: string): string {
  const u = t.toUpperCase();
  if (u.includes("LCK")) return "LCK";
  if (u.includes("LPL")) return "LPL";
  if (u.includes("LEC")) return "LEC";
  if (u.includes("LCS")) return "LCS";
  return "OTHER";
}

async function main() {
  const { mkdirSync, writeFileSync } = await import("fs");
  const { join } = await import("path");

  const cacheDir = join(process.cwd(), "cache");
  mkdirSync(cacheDir, { recursive: true });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  console.log(`Fetching games since ${cutoffStr}...`);

  // Step 1: Fetch recent games from each league
  const leagues = ["LCK", "LPL", "LEC", "LCS"];
  const allGames: any[] = [];

  for (const league of leagues) {
    console.log(`\nFetching ${league} games...`);
    const url = buildQuery({
      tables: "ScoreboardGames",
      fields: "GameId,DateTime_UTC,Tournament,Team1,Team2,WinTeam,Team1Picks,Team2Picks,Team1Bans,Team2Bans,Team1Score,Team2Score,Gamelength,Patch",
      where: `DateTime_UTC >= "${cutoffStr}" AND Tournament LIKE "${league}%"`,
      orderBy: "DateTime_UTC DESC",
      limit: 50,
    });

    const data = await rateFetch(url);
    const games = (data.cargoquery || []).map((r: any) => {
      const t = r.title;
      return {
        gameId: t["GameId"] || "",
        dateUtc: t["DateTime UTC"] || "",
        tournament: t["Tournament"] || "",
        league: parseLeague(t["Tournament"] || ""),
        team1: t["Team1"] || "",
        team2: t["Team2"] || "",
        winTeam: t["WinTeam"] || "",
        team1Picks: (t["Team1Picks"] || "").split(",").map((s: string) => s.trim()).filter(Boolean),
        team2Picks: (t["Team2Picks"] || "").split(",").map((s: string) => s.trim()).filter(Boolean),
        team1Bans: (t["Team1Bans"] || "").split(",").map((s: string) => s.trim()).filter(Boolean),
        team2Bans: (t["Team2Bans"] || "").split(",").map((s: string) => s.trim()).filter(Boolean),
        team1Score: t["Team1Score"] || "",
        team2Score: t["Team2Score"] || "",
        gameLength: t["Gamelength"] || "",
        patch: t["Patch"] || "",
      };
    });
    allGames.push(...games);
    console.log(`  ${games.length} games found`);
  }

  console.log(`\nTotal games: ${allGames.length}`);

  // Step 2: Fetch players for each game (batch by 10)
  const gameIds = allGames.map((g: any) => g.gameId);
  const allPlayerRecords: any[] = [];

  console.log("\nFetching player data...");
  // Fetch 5 games at a time (10 players per game = 50 per batch, well under 500 limit)
  const batchSize = 5;
  for (let i = 0; i < gameIds.length; i += batchSize) {
    const batch = gameIds.slice(i, i + batchSize);
    const cond = batch.map((id: string) => `GameId="${id}"`).join(" OR ");
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(gameIds.length / batchSize)}...`);

    const url = buildQuery({
      tables: "ScoreboardPlayers",
      fields: "GameId,DateTime_UTC,Link,Champion,Role,Team,TeamVs,Kills,Deaths,Assists,Gold,CS,PlayerWin",
      where: `(${cond})`,
      orderBy: "DateTime_UTC DESC",
      limit: 500,
    });

    const data = await rateFetch(url);
    if (data.cargoquery) {
      const records = data.cargoquery.map((r: any) => {
        const t = r.title;
        return {
          gameId: t["GameId"] || "",
          dateUtc: t["DateTime UTC"] || "",
          playerName: t["Link"] || "",
          champion: t["Champion"] || "",
          role: t["Role"] || "",
          team: t["Team"] || "",
          kills: parseInt(t["Kills"] || "0"),
          deaths: parseInt(t["Deaths"] || "0"),
          assists: parseInt(t["Assists"] || "0"),
          gold: parseInt(t["Gold"] || "0"),
          cs: parseInt(t["CS"] || "0"),
          playerWin: t["PlayerWin"] === "Yes",
        };
      });
      allPlayerRecords.push(...records);
    }
  }
  console.log(`Total player records: ${allPlayerRecords.length}`);

  // Step 3: Fetch champion stats for unique player-champion pairs
  const uniquePairs = [
    ...new Set(allPlayerRecords.map((p: any) => `${p.playerName}|||${p.champion}`)),
  ];
  console.log(`\nFetching champion stats for ${uniquePairs.length} unique player-champion pairs...`);

  const champStats: any[] = [];
  for (let i = 0; i < uniquePairs.length; i++) {
    const [playerName, champion] = uniquePairs[i].split("|||");
    if (i % 10 === 0) console.log(`  ${i}/${uniquePairs.length}...`);

    const url = buildQuery({
      tables: "ScoreboardPlayers",
      fields: 'Link=PlayerName,Champion,COUNT(*)=GamesPlayed,SUM(CASE WHEN PlayerWin="Yes" THEN 1 ELSE 0 END)=Wins,AVG(Kills)=AvgKills,AVG(Deaths)=AvgDeaths,AVG(Assists)=AvgAssists',
      where: `Link="${playerName}" AND Champion="${champion}" AND DateTime_UTC >= "2024-01-01"`,
      groupBy: "Link,Champion",
      limit: 1,
    });

    try {
      const data = await rateFetch(url);
      if (data.cargoquery && data.cargoquery.length > 0) {
        const t = data.cargoquery[0].title;
        const gp = parseInt(t["GamesPlayed"] || "0");
        const wins = parseInt(t["Wins"] || "0");
        champStats.push({
          key: uniquePairs[i],
          playerName,
          champion,
          gamesPlayed: gp,
          wins,
          winRate: gp > 0 ? wins / gp : 0,
          avgKills: parseFloat(t["AvgKills"] || "0"),
          avgDeaths: parseFloat(t["AvgDeaths"] || "0"),
          avgAssists: parseFloat(t["AvgAssists"] || "0"),
        });
      }
    } catch (e) {
      console.error(`  Error fetching ${playerName}/${champion}: ${e}`);
    }
  }

  console.log(`Champion stats fetched: ${champStats.length}`);

  // Write cache
  const cache = {
    generatedAt: new Date().toISOString(),
    cutoffDate: cutoffStr,
    games: allGames,
    playerRecords: allPlayerRecords,
    championStats: champStats,
  };

  writeFileSync(join(cacheDir, "seed-data.json"), JSON.stringify(cache, null, 2));
  console.log(`\nDone! Cache written to cache/seed-data.json`);
  console.log(`Games: ${allGames.length}, Players: ${allPlayerRecords.length}, ChampStats: ${champStats.length}`);
}

main().catch(console.error);
