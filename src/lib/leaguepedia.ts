import { Game, PlayerGameRecord, PlayerChampionStats, League } from "./types";

const BASE_URL = "https://lol.fandom.com/api.php";

const LEAGUE_TOURNAMENT_PATTERNS: Record<League, string[]> = {
  LCK: ["LCK%"],
  LPL: ["LPL%"],
  LEC: ["LEC%"],
  LCS: ["LCS%"],
};

// Rate limiter: max 1 request per 5 seconds
let lastRequestTime = 0;
async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 5000) {
    await new Promise((r) => setTimeout(r, 5000 - elapsed));
  }
  lastRequestTime = Date.now();

  const res = await fetch(url, { next: { revalidate: 1800 } }); // 30min cache
  if (!res.ok) {
    if (res.status === 429) {
      // Rate limited, wait 15s and retry once
      await new Promise((r) => setTimeout(r, 15000));
      lastRequestTime = Date.now();
      return fetch(url, { next: { revalidate: 1800 } });
    }
    throw new Error(`Leaguepedia API error: ${res.status} ${res.statusText}`);
  }
  return res;
}

function buildCargoQuery(params: {
  tables: string;
  fields: string;
  where: string;
  groupBy?: string;
  having?: string;
  orderBy?: string;
  limit?: number;
}): string {
  const query = new URLSearchParams({
    action: "cargoquery",
    tables: params.tables,
    fields: params.fields,
    where: params.where,
    limit: String(params.limit || 50),
    format: "json",
  });
  if (params.groupBy) query.set("group_by", params.groupBy);
  if (params.having) query.set("having", params.having);
  if (params.orderBy) query.set("order_by", params.orderBy);
  return `${BASE_URL}?${query.toString()}`;
}

function parseLeague(tournament: string): League {
  const t = tournament.toUpperCase();
  if (t.includes("LCK")) return "LCK";
  if (t.includes("LPL")) return "LPL";
  if (t.includes("LEC")) return "LEC";
  if (t.includes("LCS")) return "LCS";
  return "LCK"; // fallback
}

function splitChampions(champStr: string): string[] {
  if (!champStr || champStr.trim() === "") return [];
  return champStr.split(",").map((c) => c.trim());
}

export async function fetchRecentGames(
  leagues: League[],
  daysBack: number = 7
): Promise<Game[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().slice(0, 10); // YYYY-MM-DD

  const tournamentConditions = leagues
    .flatMap((l) =>
      LEAGUE_TOURNAMENT_PATTERNS[l].map((p) => `Tournament LIKE "${p}"`)
    )
    .join(" OR ");

  const url = buildCargoQuery({
    tables: "ScoreboardGames",
    fields: [
      "GameId",
      "DateTime_UTC",
      "Tournament",
      "Team1",
      "Team2",
      "WinTeam",
      "Team1Picks",
      "Team2Picks",
      "Team1Bans",
      "Team2Bans",
      "Team1Score",
      "Team2Score",
      "Gamelength",
      "Patch",
    ].join(","),
    where: `DateTime_UTC >= "${sinceStr}" AND (${tournamentConditions})`,
    orderBy: "DateTime_UTC DESC",
    limit: 100,
  });

  const res = await rateLimitedFetch(url);
  const data = await res.json();

  if (!data.cargoquery) return [];

  return data.cargoquery.map(
    (row: { title: Record<string, string> }): Game => ({
      gameId: row.title["GameId"] || "",
      dateUtc: row.title["DateTime UTC"] || "",
      tournament: row.title["Tournament"] || "",
      league: parseLeague(row.title["Tournament"] || ""),
      team1: row.title["Team1"] || "",
      team2: row.title["Team2"] || "",
      winTeam: row.title["WinTeam"] || "",
      team1Picks: splitChampions(row.title["Team1Picks"] || ""),
      team2Picks: splitChampions(row.title["Team2Picks"] || ""),
      team1Bans: splitChampions(row.title["Team1Bans"] || ""),
      team2Bans: splitChampions(row.title["Team2Bans"] || ""),
      team1Score: row.title["Team1Score"] || "",
      team2Score: row.title["Team2Score"] || "",
      gameLength: row.title["Gamelength"] || "",
      patch: row.title["Patch"] || "",
    })
  );
}

export async function fetchPlayerGamesOnChampion(
  playerName: string,
  champion: string,
  year: number = 2026
): Promise<PlayerGameRecord[]> {
  const url = buildCargoQuery({
    tables: "ScoreboardPlayers",
    fields: [
      "GameId",
      "DateTime_UTC",
      "Tournament",
      "Link",
      "Champion",
      "Role",
      "Team",
      "TeamVs",
      "Kills",
      "Deaths",
      "Assists",
      "Gold",
      "CS",
      "PlayerWin",
    ].join(","),
    where: `Link="${playerName}" AND Champion="${champion}" AND DateTime_UTC >= "${year - 2}-01-01"`,
    orderBy: "DateTime_UTC DESC",
    limit: 50,
  });

  const res = await rateLimitedFetch(url);
  const data = await res.json();

  if (!data.cargoquery) return [];

  return data.cargoquery.map(
    (row: { title: Record<string, string> }): PlayerGameRecord => ({
      gameId: row.title["GameId"] || "",
      dateUtc: row.title["DateTime UTC"] || "",
      tournament: row.title["Tournament"] || "",
      playerName: row.title["Link"] || "",
      champion: row.title["Champion"] || "",
      role: row.title["Role"] || "",
      team: row.title["Team"] || "",
      teamVs: row.title["TeamVs"] || "",
      kills: parseInt(row.title["Kills"] || "0"),
      deaths: parseInt(row.title["Deaths"] || "0"),
      assists: parseInt(row.title["Assists"] || "0"),
      gold: parseInt(row.title["Gold"] || "0"),
      cs: parseInt(row.title["CS"] || "0"),
      playerWin: row.title["PlayerWin"] === "Yes",
    })
  );
}

export async function fetchPlayersForGames(
  gameIds: string[]
): Promise<PlayerGameRecord[]> {
  if (gameIds.length === 0) return [];

  // Batch 5 games at a time (10 players per game = ~50 per batch)
  const batchSize = 5;
  const allRecords: PlayerGameRecord[] = [];

  for (let i = 0; i < gameIds.length; i += batchSize) {
    const batch = gameIds.slice(i, i + batchSize);
    const gameIdCondition = batch.map((id) => `GameId="${id}"`).join(" OR ");

    const url = buildCargoQuery({
      tables: "ScoreboardPlayers",
      fields: [
        "GameId",
        "DateTime_UTC",
        "Tournament",
        "Link",
        "Champion",
        "Role",
        "Team",
        "TeamVs",
        "Kills",
        "Deaths",
        "Assists",
        "Gold",
        "CS",
        "PlayerWin",
      ].join(","),
      where: `(${gameIdCondition})`,
      orderBy: "DateTime_UTC DESC",
      limit: 500,
    });

    const res = await rateLimitedFetch(url);
    const data = await res.json();

    if (data.cargoquery) {
      allRecords.push(
        ...data.cargoquery.map(
          (row: { title: Record<string, string> }): PlayerGameRecord => ({
            gameId: row.title["GameId"] || "",
            dateUtc: row.title["DateTime UTC"] || "",
            tournament: row.title["Tournament"] || "",
            playerName: row.title["Link"] || "",
            champion: row.title["Champion"] || "",
            role: row.title["Role"] || "",
            team: row.title["Team"] || "",
            teamVs: row.title["TeamVs"] || "",
            kills: parseInt(row.title["Kills"] || "0"),
            deaths: parseInt(row.title["Deaths"] || "0"),
            assists: parseInt(row.title["Assists"] || "0"),
            gold: parseInt(row.title["Gold"] || "0"),
            cs: parseInt(row.title["CS"] || "0"),
            playerWin: row.title["PlayerWin"] === "Yes",
          })
        )
      );
    }
  }

  return allRecords;
}

export async function fetchPlayerChampionStats(
  players: { playerName: string; champion: string }[]
): Promise<Map<string, PlayerChampionStats>> {
  const statsMap = new Map<string, PlayerChampionStats>();
  if (players.length === 0) return statsMap;

  // Deduplicate player-champion pairs
  const unique = [
    ...new Set(players.map((p) => `${p.playerName}|||${p.champion}`)),
  ].map((s) => {
    const [playerName, champion] = s.split("|||");
    return { playerName, champion };
  });

  // Batch: query each player's champion stats
  for (const { playerName, champion } of unique) {
    const url = buildCargoQuery({
      tables: "ScoreboardPlayers",
      fields: [
        "Link=PlayerName",
        "Champion",
        "COUNT(*)=GamesPlayed",
        'SUM(CASE WHEN PlayerWin="Yes" THEN 1 ELSE 0 END)=Wins',
        "AVG(Kills)=AvgKills",
        "AVG(Deaths)=AvgDeaths",
        "AVG(Assists)=AvgAssists",
      ].join(","),
      where: `Link="${playerName}" AND Champion="${champion}" AND DateTime_UTC >= "2024-01-01"`,
      groupBy: "Link,Champion",
      limit: 1,
    });

    try {
      const res = await rateLimitedFetch(url);
      const data = await res.json();

      if (data.cargoquery && data.cargoquery.length > 0) {
        const row = data.cargoquery[0].title;
        const gamesPlayed = parseInt(row["GamesPlayed"] || "0");
        const wins = parseInt(row["Wins"] || "0");
        statsMap.set(`${playerName}|||${champion}`, {
          playerName,
          champion,
          gamesPlayed,
          wins,
          winRate: gamesPlayed > 0 ? wins / gamesPlayed : 0,
          avgKills: parseFloat(row["AvgKills"] || "0"),
          avgDeaths: parseFloat(row["AvgDeaths"] || "0"),
          avgAssists: parseFloat(row["AvgAssists"] || "0"),
        });
      }
    } catch (e) {
      console.error(`Failed to fetch stats for ${playerName} on ${champion}:`, e);
    }
  }

  return statsMap;
}
