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
  { rarity: "Common", weight: 35 },
  { rarity: "Uncommon", weight: 40 },
  { rarity: "Rare", weight: 25 },
  { rarity: "Epic", weight: 15 },
  { rarity: "Legendary", weight: 1.25 },
  { rarity: "Mythic", weight: 0.2 },
];

const rarityBoxRarities = {
  common: {
    price: 12,
    rarityArray: rarities,
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

const rarityBasePrice = {
  Common: 250,
  Uncommon: 650,
  Rare: 1550,
  Epic: 3550,
  Legendary: 8500,
  Mythic: 35550,
};

const itemsByRarity = {
  Common: [
    " Bottle ",
    " brokenGlass ",
    " Radio ",
    " brainlet ",
    " WELCUM ",
    " cokeHead ",
    " scale ",
  ],
  Uncommon: [
    " USBdrive ",
    " weed ",
    " ShroomDumpy ",
    " JointTime ",
    " KETAMINE ",
    " Lockpicking ",
  ],
  Rare: [
    " gtfo ",
    " methbert ",
    " cokee ",
    " Heroinbert ",
    " RP ",
    " GLOCK ",
    " DES ",
  ],
  Epic: [
    " plasmagun ",
    " cokeblueprint"
  ],
  Legendary: [
    " AR15 ",
    " AngleGrinder ",
    " Shotgun ",
    " RAGEEE ",
    " goldenGlorp ",
  ],
  Mythic: [
    " GloriousGlorp ", 
    " refinery ",
    "LARGE DIAMOND 💎",
    "Diamond Studded Rolex ⌚"
  ],
};

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
  rarityBoxRarities,
  rarityBasePrice,
  itemsByRarity,
  conditions,
  conditionEmojis,
  rarityEndpoints,
  rewardsTableTemplate,
  userTableTemplate,
};
