const express = require('express');
const router = express.Router();
const pool = require('../db/connection');


const Admins = ['Vechkabaz','TreggatTV']

const rarities = [
    { rarity: "Common", weight: 60 },
    { rarity: "Uncommon", weight: 40 },
    { rarity: "Rare", weight: 20 },
    { rarity: "Epic", weight: 9 },
    { rarity: "Legendary", weight: 1 },
    { rarity: "Mythic", weight: .1 }

];

const itemsByRarity = {
    Common: ["Glorpshake", "GuangGuang Bible", "alienboogie", "glorpwork", "welcome", "xglorp"],
    Uncommon: ["Glorpscheme", "glorpshiz", "glorppray", "glorppop", "glorpwiggle", "angryglorpshake"],
    Rare: ["soul sword", "glorp glasses", "glorp gun", "glorpstrong", "glorpsnail", "glorpcheer", "glorpstare"],
    Epic: ["glorptwerk", "glorp griddy", "glorp rainbow", "glorp car", "glorp jiggy", "glorp group", "glorp ufo"],
    Legendary: ["glorp miku", "glorp doobie", "bewowow", "RAGEEEEE"],
    Mythic:["GLORIOUS GLROP"]
};

const itemEmojiByRarity = {
    Common: "⚪",        // white circle
    Uncommon: "🟢",      // green circle
    Rare: "🔵",          // blue circle
    Epic: "🟣",          // purple circle
    Legendary: "🟡",     // yellow circle
    Mythic: "🔴"         // red circle
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

const cooldowns = {}; // key: userId, value: timestamp of last call

router.get('/lootbox', async (req, res) => {
  const { username, userId, textMode } = req.query;

  console.log('Got a request: ', {
    queryParams: req.query,
    userAgent: req.headers['user-agent'],
    channel: req.headers['x-streamelements-channel'],
    ip: req.headers['x-forwarded-for']
  });

  if (!username || !userId) {
    return res.status(400).json({ error: 'Missing user info' });
  }



  const now = Date.now();
  const lastCall = cooldowns[userId] || 0;
  const cooldownTime = 15 * 1000;

  if (!Admins.includes(userId)&&(now - lastCall < cooldownTime)) {
    const timeLeft = Math.ceil((cooldownTime - (now - lastCall)) / 1000);
    const cooldownMsg = `⏳ Please wait ${timeLeft} more second${timeLeft > 1 ? 's' : ''} before opening another lootbox.`;

    if (textMode === 'true') {
      return res.send(cooldownMsg);
    } else {
      return res.status(429).json({ error: cooldownMsg });
    }
  }

  cooldowns[userId] = now;

  const reward = pickRandomItem();
  console.log('Reward chosen:', reward);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO lootbox_users (user_id, username, total_opened)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE total_opened = total_opened + 1`,
      [userId, username]
    );

    await conn.query(
      `INSERT INTO lootbox_rewards (user_id, reward_name, reward_rarity)
       VALUES (?, ?, ?)`,
      [userId, reward.name, reward.rarity]
    );

    await conn.commit();

    const rarityEmoji = itemEmojiByRarity?.[reward.rarity] ?? '⚫';
    if (textMode === 'true') {
      res.send(`${rarityEmoji} 🎁 ${username} opened a lootbox and received a ${reward.rarity.toUpperCase()} item: "${reward.name}"! ${rarityEmoji}`);
    } else {
      res.json({ reward });
    }
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    conn.release();
  }
});

module.exports = router;
