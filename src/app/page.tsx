"use client";

import { useState, useEffect, useCallback } from "react";
import { GameWithPlayerStats, BacktestPrediction, League } from "@/lib/types";
import { loadGamesFromSeed } from "@/lib/load-games";
import GameCard from "@/components/GameCard";
import ScoreTracker from "@/components/ScoreTracker";
import LeagueFilter from "@/components/LeagueFilter";

const STORAGE_KEY = "lol-backtest-predictions";

function loadPredictions(): BacktestPrediction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePredictions(predictions: BacktestPrediction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(predictions));
}

export default function Home() {
  const [games, setGames] = useState<GameWithPlayerStats[]>([]);
  const [predictions, setPredictions] = useState<BacktestPrediction[]>([]);
  const [activeLeagues, setActiveLeagues] = useState<Set<League>>(
    new Set(["LCK", "LPL", "LEC", "LCS"])
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Load predictions from localStorage
  useEffect(() => {
    setPredictions(loadPredictions());
  }, []);

  // Load games from bundled seed data (no API call needed)
  useEffect(() => {
    setLoading(true);
    setError(null);
    try {
      const leagues = Array.from(activeLeagues) as League[];
      const loaded = loadGamesFromSeed(leagues, 14);
      setGames(loaded);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeLeagues]);

  // Calculate current index based on predictions
  useEffect(() => {
    if (games.length === 0) return;
    const predictedIds = new Set(predictions.map((p) => p.gameId));
    const firstUnpredicted = games.findIndex((g) => !predictedIds.has(g.gameId));
    setCurrentIndex(firstUnpredicted >= 0 ? firstUnpredicted : games.length);
  }, [games, predictions]);

  const handlePredict = useCallback(
    (gameId: string, predictedWinner: string) => {
      const game = games.find((g) => g.gameId === gameId);
      if (!game) return;

      const newPrediction: BacktestPrediction = {
        gameId,
        predictedWinner,
        actualWinner: game.winTeam,
        correct: predictedWinner === game.winTeam,
        timestamp: Date.now(),
      };

      const updated = [...predictions.filter((p) => p.gameId !== gameId), newPrediction];
      setPredictions(updated);
      savePredictions(updated);
    },
    [games, predictions]
  );

  const handleToggleLeague = useCallback((league: League) => {
    setActiveLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(league)) {
        if (next.size > 1) next.delete(league);
      } else {
        next.add(league);
      }
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setPredictions([]);
    savePredictions([]);
    setCurrentIndex(0);
  }, []);

  // Filter predictions to only current games
  const relevantPredictions = predictions.filter((p) =>
    games.some((g) => g.gameId === p.gameId)
  );

  // Group games by date
  const gamesByDate = games.reduce<Record<string, GameWithPlayerStats[]>>(
    (acc, game) => {
      const date = game.dateUtc.split(" ")[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(game);
      return acc;
    },
    {}
  );

  const allDone = currentIndex >= games.length && games.length > 0;

  return (
    <main className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0f0f1a]/95 backdrop-blur-sm border-b border-[#2a2a42]">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold">
                LoL Backtest
                <span className="text-gray-500 text-sm font-normal ml-2">
                  Last 7 Days
                </span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <LeagueFilter
                activeLeagues={activeLeagues}
                onToggle={handleToggleLeague}
              />
              {predictions.length > 0 && (
                <button
                  onClick={handleReset}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-red-800"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {games.length > 0 && (
            <ScoreTracker
              predictions={relevantPredictions}
              totalGames={games.length}
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 mt-3 text-sm">
              Fetching games from Leaguepedia...
            </p>
            <p className="text-gray-600 mt-1 text-xs">
              Rate-limited to 1 request per 5 seconds. This may take a moment.
            </p>
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-400 text-sm">Error: {error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 text-sm text-blue-400 hover:text-blue-300"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && games.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">No games found</p>
            <p className="text-gray-600 text-sm mt-2">
              Try selecting different leagues or check back later.
            </p>
          </div>
        )}

        {allDone && (
          <div className="text-center py-8 mb-6 rounded-xl bg-gradient-to-b from-blue-900/20 to-transparent border border-blue-800/30">
            <p className="text-xl font-bold text-blue-400">Session Complete!</p>
            <p className="text-gray-400 text-sm mt-1">
              You predicted {relevantPredictions.filter((p) => p.correct).length}/
              {relevantPredictions.length} correct (
              {relevantPredictions.length > 0
                ? (
                    (relevantPredictions.filter((p) => p.correct).length /
                      relevantPredictions.length) *
                    100
                  ).toFixed(1)
                : 0}
              %)
            </p>
            <button
              onClick={handleReset}
              className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Start Over
            </button>
          </div>
        )}

        {/* Game Cards */}
        <div className="space-y-8">
          {Object.entries(gamesByDate).map(([date, dateGames]) => (
            <div key={date}>
              <h2 className="text-sm font-medium text-gray-500 mb-3 sticky top-28 bg-[#0f0f1a] py-1 z-10">
                {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              <div className="space-y-4">
                {dateGames.map((game) => {
                  const globalIndex = games.indexOf(game);
                  const pred =
                    predictions.find((p) => p.gameId === game.gameId) || null;
                  return (
                    <GameCard
                      key={game.gameId}
                      game={game}
                      prediction={pred}
                      onPredict={handlePredict}
                      cardIndex={globalIndex}
                      currentIndex={currentIndex}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
