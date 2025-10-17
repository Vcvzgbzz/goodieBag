const express = require("express");
const router = express.Router();
const pool = require("../db/connection");

const {
  Admins,
  itemEmojiByRarity,
  rarities,
  rarityBasePrice,
  itemsByRarity,
  conditions,
  conditionEmojis,
  rarityEndpoints,
  rarityBoxRarities,
  rewardsTableTemplate,
  userTableTemplate,
} = require("../appConstants");

router.get("/balance", async (req, res) => {
  const { username, userId, channelId, textMode } = req.query;

  console.log("📥 Receiving call to /balance:", req.query);

  if (!username || !userId)
    return res.status(400).json({ error: "Missing user info" });
  if (!channelId) return res.status(400).json({ error: "Missing channel ID" });

  const usersTable = `lootbox_users_${channelId}`;
  const conn = await pool.getConnection();

  try {
    await conn.query(userTableTemplate(usersTable));

    const [rows] = await conn.query(
      `SELECT balance FROM \`${usersTable}\` WHERE user_id = ?`,
      [userId],
    );

    let balance = 0;

    if (rows.length === 0) {
      await conn.query(
        `INSERT INTO \`${usersTable}\` (user_id, username, balance, total_opened)
         VALUES (?, ?, 0, 0)`,
        [userId, username],
      );
      console.log(`🆕 Created new user record for ${username}`);
    } else {
      balance = rows[0].balance;
    }

    const message = `🏦 ${username}'s balance: 💰${balance}`;

    if (textMode === "true") {
      res.send(message);
    } else {
      res.json({ username, userId, balance, message });
    }
  } catch (err) {
    console.error("❌ Error checking balance:", err);
    res.status(500).json({ error: "Failed to fetch balance" });
  } finally {
    conn.release();
  }
});

module.exports = router;
