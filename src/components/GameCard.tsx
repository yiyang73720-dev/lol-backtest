"use client";

import { GameWithPlayerStats, PlayerInGame, BacktestPrediction } from "@/lib/types";

const LEAGUE_COLORS: Record<string, string> = {
  LCK: "#c8aa6e",
  LPL: "#e84057",
  LEC: "#00c8ff",
  LCS: "#00b4d8",
};

const ROLE_LABELS: Record<string, string> = {
  top: "TOP",
  jungle: "JNG",
  mid: "MID",
  bot: "BOT",
  support: "SUP",
};

function WinRateBadge({ stats }: { stats: PlayerInGame["championStats"] }) {
  if (!stats || stats.gamesPlayed === 0) {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
        No data
      </span>
    );
  }

  const wr = stats.winRate * 100;
  const color =
    wr >= 60 ? "text-green-400" : wr >= 50 ? "text-yellow-400" : "text-red-400";
  const bgColor =
    wr >= 60
      ? "bg-green-900/40"
      : wr >= 50
      ? "bg-yellow-900/40"
      : "bg-red-900/40";

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${bgColor} ${color} font-mono`}>
      {wr.toFixed(0)}% ({stats.gamesPlayed}g)
    </span>
  );
}

function PlayerRow({ player }: { player: PlayerInGame }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[10px] text-gray-500 w-7 font-mono">
        {ROLE_LABELS[player.role.toLowerCase()] || player.role}
      </span>
      {player.playerName ? (
        <span className="text-sm font-medium w-28 truncate" title={player.playerName}>
          {player.playerName}
        </span>
      ) : (
        <span className="text-sm text-gray-600 w-28 italic">—</span>
      )}
      <span className="text-sm text-blue-300 w-24 truncate" title={player.champion}>
        {player.champion}
      </span>
      <WinRateBadge stats={player.championStats} />
    </div>
  );
}

function BanList({ bans, label }: { bans: string[]; label: string }) {
  if (bans.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] text-gray-500 uppercase mr-1">{label}:</span>
      {bans.map((ban, i) => (
        <span
          key={i}
          className="text-[11px] px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-800/30"
        >
          {ban}
        </span>
      ))}
    </div>
  );
}

function TeamCompSummary({ players }: { players: PlayerInGame[] }) {
  if (players.length === 0) return null;

  const totalGames = players.reduce(
    (sum, p) => sum + (p.championStats?.gamesPlayed || 0),
    0
  );
  const avgWinRate =
    players.filter((p) => p.championStats && p.championStats.gamesPlayed > 0).length >
    0
      ? players
          .filter((p) => p.championStats && p.championStats.gamesPlayed > 0)
          .reduce((sum, p) => sum + (p.championStats?.winRate || 0), 0) /
        players.filter((p) => p.championStats && p.championStats.gamesPlayed > 0)
          .length
      : 0;

  const avgWrPct = (avgWinRate * 100).toFixed(0);
  const wrColor =
    avgWinRate >= 0.55
      ? "text-green-400"
      : avgWinRate >= 0.48
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1">
      <span>
        Avg champ WR: <span className={`font-mono ${wrColor}`}>{avgWrPct}%</span>
      </span>
      <span>
        Total champ exp: <span className="font-mono text-gray-300">{totalGames}g</span>
      </span>
    </div>
  );
}

interface GameCardProps {
  game: GameWithPlayerStats;
  prediction: BacktestPrediction | null;
  onPredict: (gameId: string, predictedWinner: string) => void;
  cardIndex: number;
  currentIndex: number;
}

export default function GameCard({
  game,
  prediction,
  onPredict,
  cardIndex,
  currentIndex,
}: GameCardProps) {
  const isActive = cardIndex === currentIndex;
  const isPast = cardIndex < currentIndex;
  const isFuture = cardIndex > currentIndex;
  const isRevealed = prediction !== null;
  const leagueColor = LEAGUE_COLORS[game.league] || "#888";

  if (isFuture) {
    return (
      <div className="rounded-xl border border-[#2a2a42] bg-[#1a1a2e]/50 p-4 opacity-40">
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded"
            style={{ color: leagueColor, backgroundColor: `${leagueColor}20` }}
          >
            {game.league}
          </span>
          <span className="text-xs text-gray-500">
            {new Date(game.dateUtc).toLocaleDateString()}
          </span>
        </div>
        <div className="text-center text-gray-500 mt-3">
          {game.team1} vs {game.team2}
        </div>
        <div className="text-center text-[11px] text-gray-600 mt-1">
          Waiting...
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-5 transition-all duration-300 ${
        isActive
          ? "border-blue-500/50 bg-[#1a1a2e] shadow-lg shadow-blue-900/20 scale-[1.01]"
          : isPast
          ? "border-[#2a2a42] bg-[#1a1a2e]/80"
          : "border-[#2a2a42] bg-[#1a1a2e]/50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded"
            style={{ color: leagueColor, backgroundColor: `${leagueColor}20` }}
          >
            {game.league}
          </span>
          <span className="text-xs text-gray-500">{game.tournament}</span>
        </div>
        <div className="flex items-center gap-2">
          {game.patch && (
            <span className="text-[10px] text-gray-600">Patch {game.patch}</span>
          )}
          <span className="text-xs text-gray-500">
            {new Date(game.dateUtc).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* Teams */}
      <div className="grid grid-cols-2 gap-4">
        {/* Team 1 */}
        <div
          className={`rounded-lg p-3 ${
            isRevealed && game.winTeam === game.team1
              ? "bg-green-900/20 border border-green-700/30"
              : isRevealed && game.winTeam === game.team2
              ? "bg-red-900/10 border border-red-800/20"
              : "bg-[#12121f] border border-transparent"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-base">{game.team1}</h3>
            {isRevealed && game.winTeam === game.team1 && (
              <span className="text-xs font-bold text-green-400 bg-green-900/40 px-2 py-0.5 rounded">
                WINNER
              </span>
            )}
          </div>
          <div className="space-y-0.5">
            {game.team1Players.map((p, i) => (
              <PlayerRow key={i} player={p} />
            ))}
          </div>
          <TeamCompSummary players={game.team1Players} />
          <div className="mt-2">
            <BanList bans={game.team1Bans} label="Bans" />
          </div>
        </div>

        {/* Team 2 */}
        <div
          className={`rounded-lg p-3 ${
            isRevealed && game.winTeam === game.team2
              ? "bg-green-900/20 border border-green-700/30"
              : isRevealed && game.winTeam === game.team1
              ? "bg-red-900/10 border border-red-800/20"
              : "bg-[#12121f] border border-transparent"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-base">{game.team2}</h3>
            {isRevealed && game.winTeam === game.team2 && (
              <span className="text-xs font-bold text-green-400 bg-green-900/40 px-2 py-0.5 rounded">
                WINNER
              </span>
            )}
          </div>
          <div className="space-y-0.5">
            {game.team2Players.map((p, i) => (
              <PlayerRow key={i} player={p} />
            ))}
          </div>
          <TeamCompSummary players={game.team2Players} />
          <div className="mt-2">
            <BanList bans={game.team2Bans} label="Bans" />
          </div>
        </div>
      </div>

      {/* Game Length (only after reveal) */}
      {isRevealed && game.gameLength && (
        <div className="text-center text-xs text-gray-500 mt-2">
          Game length: {game.gameLength}
        </div>
      )}

      {/* Prediction Buttons / Result */}
      {isActive && !isRevealed && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-sm text-gray-400 mb-1">Who wins this game?</p>
          <div className="flex gap-3">
            <button
              onClick={() => onPredict(game.gameId, game.team1)}
              className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors"
            >
              {game.team1}
            </button>
            <button
              onClick={() => onPredict(game.gameId, game.team2)}
              className="px-6 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-colors"
            >
              {game.team2}
            </button>
          </div>
        </div>
      )}

      {isRevealed && (
        <div
          className={`mt-4 text-center py-2 rounded-lg ${
            prediction.correct
              ? "bg-green-900/20 text-green-400"
              : "bg-red-900/20 text-red-400"
          }`}
        >
          <span className="text-sm font-bold">
            {prediction.correct ? "Correct!" : "Wrong"} — You picked{" "}
            {prediction.predictedWinner}
          </span>
        </div>
      )}
    </div>
  );
}
