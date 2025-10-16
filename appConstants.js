const Admins = ["vechkabaz", "treggattv"];

const itemEmojiByRarity = {
  Common: "⚪",
  Uncommon: "🟢",
  Rare: "🔵",
  Epic: "🟣",
  Legendary: "🟡",
  Mythic: "🔴",
};

const rarities = [
  { rarity: "Common", weight: 55 },
  { rarity: "Uncommon", weight: 35 },
  { rarity: "Rare", weight: 20 },
  { rarity: "Epic", weight: 10 },
  { rarity: "Legendary", weight: 1.25 },
  { rarity: "Mythic", weight: 0.2 },
];

const rarityBoxRarities = {
  Common: {
    price: 12,
    rarityArray: rarities,
  },
  Uncommon: {
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
  Rare: {
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
  Epic: {
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
  Legendary: {
    price: 700,
    rarityArray: [
      { rarity: "Common", weight: 0 },
      { rarity: "Uncommon", weight: 0 },
      { rarity: "Rare", weight: 0 },
      { rarity: "Epic", weight: 30 },
      { rarity: "Legendary", weight: 60 },
      { rarity: "Mythic", weight: 10 },
    ],
  },
};

const rarityBasePrice = {
  Common: 10,
  Uncommon: 20,
  Rare: 50,
  Epic: 100,
  Legendary: 500,
  Mythic: 2500,
};

const itemsByRarity = {
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

const conditions = [
  { condition: "Battle-Scarred", weight: 25, multiplier: 0.6 },
  { condition: "Well-Worn", weight: 25, multiplier: 0.8 },
  { condition: "Field-Tested", weight: 30, multiplier: 1.0 },
  { condition: "Minimal Wear", weight: 15, multiplier: 1.25 },
  { condition: "Factory-New", weight: 5, multiplier: 1.5 },
];

const conditionEmojis = {
  "Battle-Scarred": "💀",
  "Well-Worn": "🥲",
  "Field-Tested": "⚙️",
  "Minimal Wear": "✨",
  "Factory-New": "💎",
};

const rarityEndpoints = [
  "Common",
  "Uncommon",
  "Rare",
  "Epic",
  "Legendary",
  "Mythic",
];

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
  rarityBasePrice,
  itemsByRarity,
  conditions,
  conditionEmojis,
  rarityEndpoints,
  rewardsTableTemplate,
  userTableTemplate,
};
