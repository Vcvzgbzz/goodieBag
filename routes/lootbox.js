const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

const Admins = ['Vechkabaz', 'TreggatTV'];

const rarities = [
  { rarity: "Common", weight: 60 },
  { rarity: "Uncommon", weight: 40 },
  { rarity: "Rare", weight: 20 },
  { rarity: "Epic", weight: 9 },
  { rarity: "Legendary", weight: 1 },
  { rarity: "Mythic", weight: 0.1 }
];

const itemsByRarity = {
  Common: ["Glorpshake", "GuangGuang Bible", "alienboogie", "glorpwork", "welcome", "xglorp"],
  Uncommon: ["Glorpscheme", "glorpshiz", "glorppray", "glorppop", "glorpwiggle", "angryglorpshake"],
  Rare: ["soul sword", "glorp glasses", "glorp gun", "glorpstrong", "glorpsnail", "glorpcheer", "glorpstare"],
  Epic: ["glorptwerk", "glorp griddy", "glorp rainbow", "glorp car", "glorp jiggy", "glorp group", "glorp ufo"],
  Legendary: ["glorp miku", "glorp doobie", "bewowow", "RAGEEEEE"],
  Mythic: ["GLORIOUS GLROP"]
};

const itemEmojiByRarity = {
  Common: "⚪",
  Uncommon: "🟢",
  Rare: "🔵",
  Epic: "🟣",
  Legendary: "🟡",
  Mythic: "🔴"
};

function pickRarity() {
  const totalWeight = rarities.reduce((sum, r) => sum + r.weight, 0);
  let rand = Math.random() * totalWeight;

  for (let r of rarities) {
    if (rand < r.weight) return r.rarity;
    rand -= r.weight;
  }
}

function pickRandomItem() {
  const rarity = pickRarity();
  const itemList = itemsByRarity[rarity];
  const name = itemList[Math.floor(Math.random() * itemList.length)];
  return { name, rarity };
}

const cooldowns = {}; 
const tableCache = new Set(); 

router.get('/lootbox', async (req, res) => {
  const { username, userId, textMode } = req.query;
  const channelId = req.headers['x-streamelements-channel'];



  console.log('Got a request:', {
    queryParams: req.query,
    userAgent: req.headers['user-agent'],
    channel: channelId,
    ip: req.headers['x-forwarded-for']
  });

  if (!channelId && !Admins.includes(userId)) {
    return res.status(400).json({ error: 'Missing StreamElements channel header' });
  }
  if (!username || !userId) {
    return res.status(400).json({ error: 'Missing user info' });
  }

  // === Cooldown check ===
  const now = Date.now();
  const lastCall = cooldowns[userId] || 0;
  const cooldownTime = 360 * 1000; // 15 seconds

  if (!Admins.includes(username) && (now - lastCall < cooldownTime)) {
    const timeLeft = Math.ceil((cooldownTime - (now - lastCall)) / 1000);
    const cooldownMsg = `⏳ Please wait ${timeLeft} more second${timeLeft > 1 ? 's' : ''} before opening another lootbox.`;
    if (textMode === 'true') return res.send(cooldownMsg);
    return res.status(429).json({ error: cooldownMsg });
  }

  cooldowns[userId] = now;

  const reward = pickRandomItem();
  console.log('Reward chosen:', reward);

  if(!channelId){
    return res.send("No databse to bind, reward: ",reward)
  }

  const conn = await pool.getConnection();
  try {
    const usersTable = `lootbox_users_${channelId}`;
    const rewardsTable = `lootbox_rewards_${channelId}`;

    // Create channel-specific tables if not exist
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
          awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      tableCache.add(channelId);
      console.log(`✅ Tables ready for channel ${channelId}`);
    }

    // === Transaction logic ===
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO \`${usersTable}\` (user_id, username, total_opened)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE total_opened = total_opened + 1`,
      [userId, username]
    );

    await conn.query(
      `INSERT INTO \`${rewardsTable}\` (user_id, reward_name, reward_rarity)
       VALUES (?, ?, ?)`,
      [userId, reward.name, reward.rarity]
    );

    await conn.commit();

    const rarityEmoji = itemEmojiByRarity?.[reward.rarity] ?? '⚫';
    const message = `${rarityEmoji} 🎁 ${username} opened a lootbox and received a ${reward.rarity.toUpperCase()} item: "${reward.name}"! ${rarityEmoji}`;

    if (textMode === 'true') {
      res.send(message);
    } else {
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

module.exports = router;
