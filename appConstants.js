require('dotenv').config();

function parseEnvJson(varName, defaultValue) {
  const raw = process.env[varName];
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Invalid JSON for ${varName}, using default.`);
    return defaultValue;
  }
}

function parseEnvList(varName, defaultValue) {
  const raw = process.env[varName];
  if (!raw) return defaultValue;
  // Try JSON array first
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // ignore and try CSV
  }
  // Fallback: comma-separated list
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseEnvNumber(varName, defaultValue) {
  const raw = process.env[varName];
  if (!raw) return defaultValue;
  const num = Number(raw);
  if (Number.isNaN(num)) {
    console.warn(`Invalid number for ${varName}, using default.`);
    return defaultValue;
  }
  return num;
}

const Admins = ["vechkabaz", "treggattv"];

const itemEmojiByRarity = {
  Common: "⚪",
  Uncommon: "🟢",
  Rare: "🔵",
  Epic: "🟣",
  Legendary: "🟡",
  Mythic: "🔴",
};

const defaultRarities = [
  { rarity: "Common", weight: 35 },
  { rarity: "Uncommon", weight: 40 },
  { rarity: "Rare", weight: 25 },
  { rarity: "Epic", weight: 15 },
  { rarity: "Legendary", weight: 1.25 },
  { rarity: "Mythic", weight: 0.2 },
];

const rarities = parseEnvJson('RARITIES', defaultRarities);

const defaultRarityBoxRarities = {
  common: {
    price: 12,
    rarityArray: defaultRarities,
  },
  uncommon: {
    price: 25,
    rarityArray: [
      { rarity: "Common", weight: 35 },
      { rarity: "Uncommon", weight: 55 },
      { rarity: "Rare", weight: 20 },
      { rarity: "Epic", weight: 10 },
      { rarity: "Legendary", weight: 1.25 },
      { rarity: "Mythic", weight: 0.2 },
    ],
  },
  rare: {
    price: 70,
    rarityArray: [
      { rarity: "Common", weight: 0 },
      { rarity: "Uncommon", weight: 35 },
      { rarity: "Rare", weight: 50 },
      { rarity: "Epic", weight: 25 },
      { rarity: "Legendary", weight: 1.25 },
      { rarity: "Mythic", weight: 0.2 },
    ],
  },
  epic: {
    price: 150,
    rarityArray: [
      { rarity: "Common", weight: 0 },
      { rarity: "Uncommon", weight: 0 },
      { rarity: "Rare", weight: 30 },
      { rarity: "Epic", weight: 65 },
      { rarity: "Legendary", weight: 2.25 },
      { rarity: "Mythic", weight: 0.4 },
    ],
  },
  legendary: {
    price: 550,
    rarityArray: [
      { rarity: "Common", weight: 0 },
      { rarity: "Uncommon", weight: 0 },
      { rarity: "Rare", weight: 0 },
      { rarity: "Epic", weight: 20 },
      { rarity: "Legendary", weight: 70 },
      { rarity: "Mythic", weight: 10 },
    ],
  },
};

const rarityBoxRarities = parseEnvJson('RARITY_BOX_RARITIES', defaultRarityBoxRarities);

const defaultRarityBasePrice = {
  Common: 10,
  Uncommon: 20,
  Rare: 50,
  Epic: 100,
  Legendary: 500,
  Mythic: 2500,
};

const rarityBasePrice = process.env.RARITY_BASE_PRICE
  ? parseEnvJson('RARITY_BASE_PRICE', defaultRarityBasePrice)
  : {
      Common: parseEnvNumber('COMMON_BASE_PRICE', defaultRarityBasePrice.Common),
      Uncommon: parseEnvNumber('UNCOMMON_BASE_PRICE', defaultRarityBasePrice.Uncommon),
      Rare: parseEnvNumber('RARE_BASE_PRICE', defaultRarityBasePrice.Rare),
      Epic: parseEnvNumber('EPIC_BASE_PRICE', defaultRarityBasePrice.Epic),
      Legendary: parseEnvNumber('LEGENDARY_BASE_PRICE', defaultRarityBasePrice.Legendary),
      Mythic: parseEnvNumber('MYTHIC_BASE_PRICE', defaultRarityBasePrice.Mythic),
    };

const defaultItemsByRarity = {
  Common: [
    " glorpShake ",
    " slumpe7PraiseGuangGuang ",
    " AlienDance ",
    " glorpHop ",
    " welcome ",
    " guuh ",
    " gambaGlorp ",
    " morp ",
  ],
  Uncommon: [
    " glorp4evil ",
    " GLORPSHIT ",
    " GlorpPriest ",
    " glorpPrayge ",
    " glorpWiggle ",
    " hyperCokeShakey ",
    " glorpoopoo ",
  ],
  Rare: [
    " slumpe7Sswang ",
    " glorprave ",
    " GlorpGun ",
    " slorpCALYPSO ",
    " snail ",
    " glorpCheer ",
    " glermStare ",
    " glorpCute ",
    " glorpSpin ",
  ],
  Epic: [
    " glorptwerk ",
    " glorpa ",
    " glorpRainbow ",
    " glorpkarting ",
    " glorp jiggy ",
    " glorpGang ",
    " glorpArrive ",
    " glorpCozy ",
    " cokeglorp ",
  ],
  Legendary: [
    " glorpmiku ",
    " zazaglorp ",
    " cockroachDance ",
    " RAGEEE ",
    " goldenGlorp ",
    " catJAM ",
    " glorpBus ",
  ],
  Mythic: [" GloriousGlorp ", " GLEX "],
};

let itemsByRarity;
if (process.env.ITEMS_BY_RARITY) {
  itemsByRarity = parseEnvJson('ITEMS_BY_RARITY', defaultItemsByRarity);
} else {
  itemsByRarity = {
    Common: parseEnvList('COMMON_ITEMS', defaultItemsByRarity.Common),
    Uncommon: parseEnvList('UNCOMMON_ITEMS', defaultItemsByRarity.Uncommon),
    Rare: parseEnvList('RARE_ITEMS', defaultItemsByRarity.Rare),
    Epic: parseEnvList('EPIC_ITEMS', defaultItemsByRarity.Epic),
    Legendary: parseEnvList('LEGENDARY_ITEMS', defaultItemsByRarity.Legendary),
    Mythic: parseEnvList('MYTHIC_ITEMS', defaultItemsByRarity.Mythic),
  };
}

const conditions = [
  { condition: "Battle-Scarred", weight: 20, multiplier: 0.6 },
  { condition: "Well-Worn", weight: 20, multiplier: 0.8 },
  { condition: "Field-Tested", weight: 30, multiplier: 1.0 },
  { condition: "Minimal Wear", weight: 20, multiplier: 1.25 },
  { condition: "Factory-New", weight: 10, multiplier: 1.5 },
];

const conditionEmojis = {
  "Battle-Scarred": "💀",
  "Well-Worn": "🥲",
  "Field-Tested": "⚙️",
  "Minimal Wear": "✨",
  "Factory-New": "💎",
};

const rarityEndpoints = parseEnvJson('RARITY_ENDPOINTS', [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Legendary",
  "Mythic",
]);

const rewardsTableTemplate = (rewardsTableName) => {
  return `CREATE TABLE IF NOT EXISTS \`${rewardsTableName}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255),
        reward_name VARCHAR(255),
        reward_rarity VARCHAR(50),
        reward_condition VARCHAR(50),
        reward_value INT,
        awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`;
};

const userTableTemplate = (userTableName) => {
  return `CREATE TABLE IF NOT EXISTS \`${userTableName}\` (
        user_id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255),
        total_opened INT DEFAULT 0,
        balance INT DEFAULT 0
      );`;
};

module.exports = {
  Admins,
  itemEmojiByRarity,
  rarities,
  rarityBoxRarities,
  rarityBasePrice,
  itemsByRarity,
  conditions,
  conditionEmojis,
  rarityEndpoints,
  rewardsTableTemplate,
  userTableTemplate,
};
