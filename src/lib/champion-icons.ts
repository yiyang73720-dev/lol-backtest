// Riot Data Dragon CDN for champion images
const DDRAGON_VERSION = "15.4.1"; // Latest patch
const BASE_URL = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion`;

// Map display names / API names to Data Dragon filenames
const NAME_OVERRIDES: Record<string, string> = {
  // Esports API uses these names
  MonkeyKing: "MonkeyKing", // Wukong
  XinZhao: "XinZhao",
  "Xin Zhao": "XinZhao",
  "Dr. Mundo": "DrMundo",
  DrMundo: "DrMundo",
  "Jarvan IV": "JarvanIV",
  JarvanIV: "JarvanIV",
  "Lee Sin": "LeeSin",
  LeeSin: "LeeSin",
  "Master Yi": "MasterYi",
  MasterYi: "MasterYi",
  "Miss Fortune": "MissFortune",
  MissFortune: "MissFortune",
  "Tahm Kench": "TahmKench",
  TahmKench: "TahmKench",
  "Twisted Fate": "TwistedFate",
  TwistedFate: "TwistedFate",
  "Aurelion Sol": "AurelionSol",
  AurelionSol: "AurelionSol",
  "Kog'Maw": "KogMaw",
  KogMaw: "KogMaw",
  "Cho'Gath": "Chogath",
  ChoGath: "Chogath",
  "Kha'Zix": "Khazix",
  KhaZix: "Khazix",
  "Vel'Koz": "Velkoz",
  VelKoz: "Velkoz",
  "Rek'Sai": "RekSai",
  RekSai: "RekSai",
  "Kai'Sa": "Kaisa",
  KaiSa: "Kaisa",
  "Bel'Veth": "Belveth",
  BelVeth: "Belveth",
  "K'Sante": "KSante",
  KSante: "KSante",
  "Nunu & Willump": "Nunu",
  Nunu: "Nunu",
  Wukong: "MonkeyKing",
  "Renata Glasc": "Renata",
  RenataGlasc: "Renata",
  LeBlanc: "Leblanc",
  Seraphine: "Seraphine",
};

export function getChampionIconUrl(championName: string): string {
  if (!championName) return "";

  // Check overrides first
  const override = NAME_OVERRIDES[championName];
  if (override) {
    return `${BASE_URL}/${override}.png`;
  }

  // Default: remove spaces and special characters, capitalize first letter
  const cleaned = championName
    .replace(/['\s.]/g, "")
    .replace(/^(.)/, (c) => c.toUpperCase());

  return `${BASE_URL}/${cleaned}.png`;
}
