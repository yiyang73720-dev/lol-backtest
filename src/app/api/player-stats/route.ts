import { NextResponse } from "next/server";
import { fetchPlayerGamesOnChampion } from "@/lib/leaguepedia";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const player = searchParams.get("player");
  const champion = searchParams.get("champion");

  if (!player || !champion) {
    return NextResponse.json(
      { error: "Missing player or champion parameter" },
      { status: 400 }
    );
  }

  try {
    const records = await fetchPlayerGamesOnChampion(player, champion);

    const wins = records.filter((r) => r.playerWin).length;
    const total = records.length;

    return NextResponse.json({
      player,
      champion,
      gamesPlayed: total,
      wins,
      winRate: total > 0 ? wins / total : 0,
      avgKDA:
        total > 0
          ? {
              kills: records.reduce((s, r) => s + r.kills, 0) / total,
              deaths: records.reduce((s, r) => s + r.deaths, 0) / total,
              assists: records.reduce((s, r) => s + r.assists, 0) / total,
            }
          : null,
      recentGames: records.slice(0, 10),
    });
  } catch (error) {
    console.error("Error fetching player stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch player stats", details: String(error) },
      { status: 500 }
    );
  }
}
