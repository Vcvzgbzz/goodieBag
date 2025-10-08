const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

const Admins = ['Vechkabaz', 'TreggatTV'];

const itemEmojiByRarity = {
  Common: "⚪",
  Uncommon: "🟢",
  Rare: "🔵",
  Epic: "🟣",
  Legendary: "🟡",
  Mythic: "🔴"
};

const rarities = [
  { rarity: "Common", weight: 60 },
  { rarity: "Uncommon", weight: 40 },
  { rarity: "Rare", weight: 20 },
  { rarity: "Epic", weight: 9 },
  { rarity: "Legendary", weight: 1 },
  { rarity: "Mythic", weight: 0.1 }
];

const rarityBasePrice = {
  Common: 10,
  Uncommon: 20,
  Rare: 50,
  Epic: 100,
  Legendary: 500,
  Mythic: 2500
};

const itemsByRarity = {
  Common: ["Glorpshake", "GuangGuang Bible", "alienboogie", "glorpwork", "welcome", "xglorp"],
  Uncommon: ["Glorpscheme", "glorpshiz", "glorppray", "glorppop", "glorpwiggle", "angryglorpshake"],
  Rare: ["soul sword", "glorp glasses", "glorp gun", "glorpstrong", "glorpsnail", "glorpcheer", "glorpstare"],
  Epic: ["glorptwerk", "glorp griddy", "glorp rainbow", "glorp car", "glorp jiggy", "glorp group", "glorp ufo"],
  Legendary: ["glorp miku", "glorp doobie", "bewowow", "RAGEEEEE"],
  Mythic: ["GLORIOUS GLROP"]
};

const conditions = [
  { condition: "Battle-Scarred", weight: 25, multiplier: 0.6 },
  { condition: "Well-Worn", weight: 25, multiplier: 0.8 },
  { condition: "Field-Tested", weight: 30, multiplier: 1.0 },
  { condition: "Minimal Wear", weight: 15, multiplier: 1.25 },
  { condition: "Factory-New", weight: 5, multiplier: 1.5 }
];

const conditionEmojis = {
    "Battle-Scarred": "💀",     
    "Well-Worn": "🥲",         
    "Field-Tested": "⚙️",       
    "Minimal Wear": "✨",       
    "Factory-New": "💎"    
  }; 
  

function pickWeighted(array) {
  const total = array.reduce((sum, a) => sum + a.weight, 0);
  let rand = Math.random() * total;
  for (let a of array) {
    if (rand < a.weight) return a;
    rand -= a.weight;
  }
}

function pickRarity() {
  return pickWeighted(rarities).rarity;
}

function pickCondition() {
  return pickWeighted(conditions);
}

function pickRandomItem() {
  const rarity = pickRarity();
  const condition = pickCondition();
  const itemList = itemsByRarity[rarity];
  const name = itemList[Math.floor(Math.random() * itemList.length)];

  const baseValue = rarityBasePrice[rarity] || 0;
  const value = Math.round(baseValue * condition.multiplier);

  return { name, rarity, condition: condition.condition, value };
}

// === Core variables ===
const cooldowns = {};
const tableCache = new Set();

// === LOOTBOX ROUTE ===
router.get('/lootbox', async (req, res) => {
  const { username, userId, textMode } = req.query;
  const channelId = req.headers['x-streamelements-channel'];

  const now = Date.now();
  const lastCall = cooldowns[userId] || 0;
  const cooldownTime = 360 * 1000; // 360 seconds

  if (!username || !userId) {
    return res.status(400).json({ error: 'Missing user info' });
  }
  if (!channelId && !Admins.includes(userId)) {
    return res.status(400).json({ error: 'Missing StreamElements channel header' });
  }

  if (!Admins.includes(username) && (now - lastCall < cooldownTime)) {
    const timeLeft = Math.ceil((cooldownTime - (now - lastCall)) / 1000);
    const cooldownMsg = `⏳ Please wait ${timeLeft}s before opening another lootbox.`;
    if (textMode === 'true') return res.send(cooldownMsg);
    return res.status(429).json({ error: cooldownMsg });
  }

  cooldowns[userId] = now;
  const reward = pickRandomItem();
  const conn = await pool.getConnection();

  try {
    const usersTable = `lootbox_users_${channelId}`;
    const rewardsTable = `lootbox_rewards_${channelId}`;

    // Create tables if not exist
    if (!tableCache.has(channelId)) {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`${usersTable}\` (
          user_id VARCHAR(255) PRIMARY KEY,
          username VARCHAR(255),
          total_opened INT DEFAULT 0
        );
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`${rewardsTable}\` (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(255),
          reward_name VARCHAR(255),
          reward_rarity VARCHAR(50),
          reward_condition VARCHAR(50),
          reward_value INT,
          awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      tableCache.add(channelId);
      console.log(`✅ Tables ready for channel ${channelId}`);
    }

    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO \`${usersTable}\` (user_id, username, total_opened)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE total_opened = total_opened + 1`,
      [userId, username]
    );

    await conn.query(
      `INSERT INTO \`${rewardsTable}\` (user_id, reward_name, reward_rarity, reward_condition, reward_value)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, reward.name, reward.rarity, reward.condition, reward.value]
    );

    await conn.commit();

    const rarityEmoji = itemEmojiByRarity?.[reward.rarity] ?? '⚫';
    const condition = reward.condition;
    const conditionEmoji = conditionEmojis[condition] || '❔';
    const value = reward.value ?? 0;

    const message = `${rarityEmoji} 🎁 ${username} opened a lootbox and received a ${reward.rarity.toUpperCase()} item: "${reward.name}" ${conditionEmoji} (${condition}) worth 💰${value}! ${rarityEmoji}`;

    

    if (textMode === 'true'){
        res.send(message);
    }else{
        res.json({ reward, message });
    }

  } catch (err) {
    await conn.rollback();
    console.error('❌ Database error:', err);
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    conn.release();
  }
});

// === INVENTORY ROUTE ===
router.get('/inventory', async (req, res) => {
  const { username, userId, textMode } = req.query;
  const channelId = req.headers['x-streamelements-channel'];

  if (!username || !userId) return res.status(400).json({ error: 'Missing user info' });
  if (!channelId) return res.status(400).json({ error: 'Missing StreamElements channel header' });

  const rewardsTable = `lootbox_rewards_${channelId}`;
  const conn = await pool.getConnection();

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`${rewardsTable}\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255),
        reward_name VARCHAR(255),
        reward_rarity VARCHAR(50),
        reward_condition VARCHAR(50),
        reward_value INT,
        awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const [rows] = await conn.query(
        `SELECT 
            reward_name, 
            reward_rarity, 
            reward_condition, 
            COUNT(*) as count, 
            SUM(reward_value) as total_value
         FROM \`${rewardsTable}\`
         WHERE user_id = ?
         GROUP BY reward_name, reward_rarity, reward_condition
         ORDER BY 
           FIELD(reward_rarity, 'Mythic', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'),
           total_value DESC`,
        [userId]
      );
      

    if (rows.length === 0) {
      const emptyMsg = `${username} has no loot yet. 🕳️`;
      if (textMode === 'true') return res.send(emptyMsg);
      return res.json({ inventory: [], message: emptyMsg });
    }

    const inventory = {};
    let totalWealth = 0;

    for (const { reward_name, reward_rarity, reward_condition, count, total_value } of rows) {
      const numericValue = Number(total_value) || 0; // convert string → number safely
    
      if (!inventory[reward_rarity]) inventory[reward_rarity] = [];
      inventory[reward_rarity].push(
        `${reward_name} (${reward_condition}) x${count} — 💰${numericValue}`
      );
    
      totalWealth += numericValue;
    }
    
    const rarityOrder = ["Mythic", "Legendary", "Epic", "Rare", "Uncommon", "Common"];
    const display = rarityOrder
      .filter(r => inventory[r])
      .map(r => `${itemEmojiByRarity[r]} ${r.toUpperCase()}: ${inventory[r].join(', ')}`)
      .join(' | ');
    
    const message = `🎒 ${username}'s Inventory → ${display} | 🏦 Total Value: 💰${totalWealth}`;
    
    if (textMode === 'true') res.send(message);
    else res.json({ inventory, totalWealth, message });

  } catch (err) {
    console.error('❌ Error fetching inventory:', err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  } finally {
    conn.release();
  }
});

module.exports = router;
