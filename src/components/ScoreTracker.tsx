"use client";

import { BacktestPrediction } from "@/lib/types";

interface ScoreTrackerProps {
  predictions: BacktestPrediction[];
  totalGames: number;
}

export default function ScoreTracker({ predictions, totalGames }: ScoreTrackerProps) {
  const correct = predictions.filter((p) => p.correct).length;
  const total = predictions.length;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : "—";
  const remaining = totalGames - total;

  return (
    <div className="flex items-center gap-6 px-6 py-3 rounded-xl bg-[#1a1a2e] border border-[#2a2a42]">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-white">{correct}</span>
        <span className="text-gray-500">/</span>
        <span className="text-xl text-gray-400">{total}</span>
        <span className="text-xs text-gray-500 ml-1">correct</span>
      </div>

      <div className="h-8 w-px bg-[#2a2a42]" />

      <div className="flex items-center gap-1">
        <span
          className={`text-2xl font-bold font-mono ${
            total === 0
              ? "text-gray-500"
              : parseFloat(accuracy) >= 55
              ? "text-green-400"
              : parseFloat(accuracy) >= 45
              ? "text-yellow-400"
              : "text-red-400"
          }`}
        >
          {accuracy}%
        </span>
        <span className="text-xs text-gray-500">accuracy</span>
      </div>

      <div className="h-8 w-px bg-[#2a2a42]" />

      <div className="flex items-center gap-1">
        <span className="text-sm text-gray-400">{remaining}</span>
        <span className="text-xs text-gray-500">remaining</span>
      </div>

      {/* Win streak indicator */}
      <div className="ml-auto flex gap-0.5">
        {predictions.slice(-10).map((p, i) => (
          <div
            key={i}
            className={`w-2.5 h-2.5 rounded-full ${
              p.correct ? "bg-green-400" : "bg-red-400"
            }`}
            title={`${p.correct ? "Correct" : "Wrong"}: ${p.predictedWinner}`}
          />
        ))}
      </div>
    </div>
  );
}
