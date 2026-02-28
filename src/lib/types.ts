export interface Game {
  gameId: string;
  dateUtc: string;
  tournament: string;
  league: string; // LCK, LPL, LEC, LCS
  team1: string;
  team2: string;
  winTeam: string;
  team1Picks: string[]; // champion names
  team2Picks: string[]; // champion names
  team1Bans: string[];
  team2Bans: string[];
  team1Score: string;
  team2Score: string;
  gameLength: string;
  patch: string;
}

export interface PlayerGameRecord {
  gameId: string;
  dateUtc: string;
  tournament: string;
  playerName: string;
  champion: string;
  role: string;
  team: string;
  teamVs: string;
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  cs: number;
  playerWin: boolean;
}

export interface PlayerChampionStats {
  playerName: string;
  champion: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
}

export interface GameWithPlayerStats extends Game {
  team1Players: PlayerInGame[];
  team2Players: PlayerInGame[];
}

export interface PlayerInGame {
  playerName: string;
  champion: string;
  role: string;
  championStats: PlayerChampionStats | null; // their historical stats on this champ
}

export interface BacktestPrediction {
  gameId: string;
  predictedWinner: string;
  actualWinner: string;
  correct: boolean;
  timestamp: number;
}

export type League = "LCK" | "LPL" | "LEC" | "LCS";

export const LEAGUES: { id: League; name: string; color: string }[] = [
  { id: "LCK", name: "LCK", color: "#c8aa6e" },
  { id: "LPL", name: "LPL", color: "#e84057" },
  { id: "LEC", name: "LEC", color: "#00c8ff" },
  { id: "LCS", name: "LCS", color: "#00b4d8" },
];
