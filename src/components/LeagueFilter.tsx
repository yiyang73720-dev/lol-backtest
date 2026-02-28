"use client";

import { League, LEAGUES } from "@/lib/types";

interface LeagueFilterProps {
  activeLeagues: Set<League>;
  onToggle: (league: League) => void;
}

export default function LeagueFilter({ activeLeagues, onToggle }: LeagueFilterProps) {
  return (
    <div className="flex gap-2">
      {LEAGUES.map((league) => {
        const active = activeLeagues.has(league.id);
        return (
          <button
            key={league.id}
            onClick={() => onToggle(league.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
              active
                ? "border-2"
                : "border-2 border-transparent opacity-40 hover:opacity-70"
            }`}
            style={
              active
                ? {
                    color: league.color,
                    borderColor: league.color,
                    backgroundColor: `${league.color}15`,
                  }
                : { color: league.color }
            }
          >
            {league.name}
          </button>
        );
      })}
    </div>
  );
}
