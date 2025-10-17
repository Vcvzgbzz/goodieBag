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

const sellAllByRarity = async (rarity, userId, channelId, conn) => {
  const usersTable = `lootbox_users_${channelId}`;
  const rewardsTable = `lootbox_rewards_${channelId}`;

  const normalizedRarity = rarity?.toLowerCase();
  const validRarities = Object.keys(itemEmojiByRarity).map((r) =>
    r.toLowerCase(),
  );
  if (!validRarities.includes(normalizedRarity)) {
    throw new Error(`Invalid rarity: ${rarity}`);
  }

  const matchedRarity = Object.keys(itemEmojiByRarity).find(
    (r) => r.toLowerCase() === normalizedRarity,
  );

  const emoji = itemEmojiByRarity[matchedRarity] || "⚫";

  // Ensure tables exist
  await conn.query(userTableTemplate(usersTable));
  await conn.query(rewardsTableTemplate(rewardsTable));

  // Select items to sell
  const [items] = await conn.query(
    `SELECT id, reward_value FROM \`${rewardsTable}\`
     WHERE user_id = ? AND LOWER(reward_rarity) = ?`,
    [userId, normalizedRarity],
  );

  if (!items.length) {
    return {
      sold: 0,
      value: 0,
      message: `🫥 No ${matchedRarity} items found to sell.`,
    };
  }

  const idsToDelete = items.map((item) => item.id);
  const totalValue = items.reduce((sum, item) => sum + item.reward_value, 0);

  // Delete sold items
  const deleteQuery = `
    DELETE FROM \`${rewardsTable}\`
    WHERE id IN (${idsToDelete.map(() => "?").join(",")})`;
  await conn.query(deleteQuery, idsToDelete);

  // Update balance
  await conn.query(
    `UPDATE \`${usersTable}\` SET balance = balance + ? WHERE user_id = ?`,
    [totalValue, userId],
  );

  return {
    sold: idsToDelete.length,
    value: totalValue,
    message: `✅ Sold ${idsToDelete.length} ${matchedRarity} item(s) for 💰${totalValue}. ${emoji}`,
  };
};

router.get("/sellAll", async (req, res) => {
  const { channelId } = req.query;
  console.log("Receiving call to sellAll:", { ...req.query, channelId });

  function stripQuotes(str) {
    return typeof str === "string" ? str.replace(/^"(.*)"$/, "$1") : str;
  }

  const username = stripQuotes(req.query.username);
  const userId = stripQuotes(req.query.userId);
  const textMode = stripQuotes(req.query.textMode);

  if (!username || !userId)
    return res.status(400).json({ error: "Missing user info" });

  if (!channelId) return res.status(400).json({ error: "Missing channel ID" });

  const usersTable = `lootbox_users_${channelId}`;
  const rewardsTable = `lootbox_rewards_${channelId}`;
  const conn = await pool.getConnection();

  try {
    await conn.query(userTableTemplate(usersTable));
    await conn.query(rewardsTableTemplate(rewardsTable));

    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, reward_value FROM \`${rewardsTable}\` WHERE user_id = ?`,
      [userId],
    );

    if (!rows.length) {
      const emptyMsg = `🫥 ${username} has no items to sell.`;
      if (textMode === "true") return res.send(emptyMsg);
      return res.status(404).json({ error: emptyMsg });
    }

    const idsToDelete = rows.map((row) => row.id);
    const totalValue = rows.reduce((sum, row) => sum + row.reward_value, 0);

    const deleteQuery = `DELETE FROM \`${rewardsTable}\` WHERE id IN (${idsToDelete.map(() => "?").join(",")})`;
    await conn.query(deleteQuery, idsToDelete);

    await conn.query(
      `UPDATE \`${usersTable}\` SET balance = balance + ? WHERE user_id = ?`,
      [totalValue, userId],
    );

    await conn.commit();

    const message = `✅ ${username} sold ALL items (${idsToDelete.length}) for 💰${totalValue}.`;

    if (textMode === "true") return res.send(message);
    else
      return res.json({ sold: idsToDelete.length, value: totalValue, message });
  } catch (err) {
    await conn.rollback();
    console.error("❌ Error processing sellAll:", err);
    res.status(500).json({ error: "Failed to process sellAll" });
  } finally {
    conn.release();
  }
});

for (const rarity of rarityEndpoints) {
  router.get(`/sellAll${rarity}`, async (req, res) => {
    const channelId = req.query.channelId;
    console.log(`Receiving call to sellAll${rarity}:`, {
      ...req.query,
      channelId,
    });

    function stripQuotes(str) {
      return typeof str === "string" ? str.replace(/^"(.*)"$/, "$1") : str;
    }

    const username = stripQuotes(req.query.username);
    const userId = stripQuotes(req.query.userId);
    const textMode = stripQuotes(req.query.textMode);

    if (!username || !userId)
      return res.status(400).json({ error: "Missing user info" });
    if (!channelId)
      return res.status(400).json({ error: "Missing channel ID" });

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const result = await sellAllByRarity(rarity, userId, channelId, conn);

      await conn.commit();

      if (textMode === "true") {
        return res.send(result.message);
      } else {
        return res.json(result);
      }
    } catch (err) {
      await conn.rollback();
      console.error(`❌ Error processing sellAll${rarity}:`, err);
      res.status(500).json({ error: `Failed to process sellAll${rarity}` });
    } finally {
      conn.release();
    }
  });
}

router.get("/sell", async (req, res) => {
  const {
    username,
    userId,
    channelId,
    itemName,
    itemCondition,
    quantity,
    textMode,
  } = req.query;

  console.log("🔍 /sell called with:", {
    username,
    userId,
    channelId,
    itemName,
    itemCondition,
    quantity,
    textMode,
  });

  const parsedQty = parseInt(quantity, 10);

  if (
    !username ||
    !userId ||
    !channelId ||
    !itemName ||
    !itemCondition ||
    isNaN(parsedQty) ||
    parsedQty < 1
  ) {
    console.warn("⚠️ Invalid parameters detected");
    return res.status(400).json({ error: "Missing or invalid parameters." });
  }

  const usersTable = `lootbox_users_${channelId}`;
  const rewardsTable = `lootbox_rewards_${channelId}`;
  const conn = await pool.getConnection();

  try {
    console.log(`📦 Ensuring tables exist: ${usersTable}, ${rewardsTable}`);
    await conn.query(userTableTemplate(usersTable));
    await conn.query(rewardsTableTemplate(rewardsTable));
    await conn.beginTransaction();
    console.log("🚀 Started DB transaction");

    const selectQuery = `
      SELECT id, reward_value, reward_rarity 
      FROM \`${rewardsTable}\`
      WHERE user_id = ? AND reward_name = ? AND reward_condition = ?
      LIMIT ?`;
    console.log("🔎 Executing SELECT query:", selectQuery, [
      userId,
      itemName,
      itemCondition,
      parsedQty,
    ]);

    const [items] = await conn.query(selectQuery, [
      userId,
      itemName,
      itemCondition,
      parsedQty,
    ]);

    console.log("📥 Items found:", items);

    if (!items.length) {
      const msg = `❌ ${username}, you don't have ${parsedQty}x "${itemCondition}" "${itemName}" to sell.`;
      console.warn(msg);
      if (textMode === "true") return res.send(msg);
      return res.status(404).json({ error: msg });
    }

    const ids = items.map((item) => item.id);
    const totalValue = items.reduce((sum, item) => sum + item.reward_value, 0);
    const rarity = items[0].reward_rarity;

    console.log(`🧾 Preparing to delete ${ids.length} item(s) with IDs:`, ids);
    const deleteQuery = `DELETE FROM \`${rewardsTable}\` WHERE id IN (${ids.map(() => "?").join(",")})`;
    console.log("🗑️ DELETE query:", deleteQuery);
    await conn.query(deleteQuery, ids);

    console.log(
      `💸 Updating balance by +${totalValue} in ${usersTable} for user: ${userId}`,
    );
    await conn.query(
      `UPDATE \`${usersTable}\` SET balance = balance + ? WHERE user_id = ?`,
      [totalValue, userId],
    );

    await conn.commit();
    console.log("✅ Transaction committed");

    const emoji = itemEmojiByRarity[rarity] || "🪙";
    const conditionEmoji = conditionEmojis[itemCondition] || "❔";
    const message = `✅ ${username} sold ${ids.length}x ${emoji} "${itemName}" ${conditionEmoji} (${itemCondition}) for 💰${totalValue}!`;

    console.log("📤 Returning message:", message);
    if (textMode === "true") return res.send(message);
    return res.json({ sold: ids.length, value: totalValue, message });
  } catch (err) {
    await conn.rollback();
    console.error("❌ Error processing /sell:", err);
    return res.status(500).json({ error: "Failed to sell item(s)." });
  } finally {
    conn.release();
    console.log("🔚 Connection released");
  }
});

module.exports = router;
