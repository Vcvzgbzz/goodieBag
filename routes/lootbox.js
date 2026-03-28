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

function pickWeighted(array) {
  const total = array.reduce((sum, a) => sum + a.weight, 0);
  let rand = Math.random() * total;
  for (let a of array) {
    if (rand < a.weight) return a;
    rand -= a.weight;
  }
}

function pickRarity(customRarityArray) {
  const pool = customRarityArray || rarities;
  return pickWeighted(pool).rarity;
}

function pickCondition() {
  return pickWeighted(conditions);
}

function pickRandomItem(customRarityArray = null) {
  const rarity = customRarityArray
    ? pickRarity(customRarityArray)
    : pickRarity();

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

function formatCompactLootboxMessage({
  username,
  action,
  boxLabel,
  reward,
}) {
  const rarityEmoji = itemEmojiByRarity?.[reward.rarity] ?? "⚫";
  const conditionEmoji = conditionEmojis[reward.condition] || "❔";
  const value = reward.value ?? 0;
  const compactCondition = String(reward.condition || "Unknown").trim();
  const compactBoxLabel = boxLabel ? ` ${boxLabel}` : "";

  return `${rarityEmoji} ${username} ${action}${compactBoxLabel} -> ${reward.rarity.toUpperCase()} \"${reward.name}\" ${conditionEmoji}${compactCondition} | 💰${value}`;
}

// === LOOTBOX ROUTE ===
router.get("/lootbox", async (req, res) => {
  const { username, userId, textMode, channelId } = req.query;

  const now = Date.now();
  const lastCall = cooldowns[userId] || 0;
  const cooldownTime = 360 * 1000;

  if (!username || !userId) {
    return res.status(400).json({ error: "Missing user info" });
  }
  if (!channelId && !Admins.includes(username)) {
    return res.status(400).json({ error: "Missing channel ID" });
  }

  if (!Admins.includes(username) && now - lastCall < cooldownTime) {
    const timeLeft = Math.ceil((cooldownTime - (now - lastCall)) / 1000);
    const cooldownMsg = `⏳ Please wait ${timeLeft}s before opening another lootbox.`;
    if (textMode === "true") return res.send(cooldownMsg);
    return res.status(429).json({ error: cooldownMsg });
  }

  if (Admins.includes(username) && now - lastCall < cooldownTime) {
    console.log(`Admin ${username} Overriding cooldown on lootbox `);
  }
  cooldowns[userId] = now;
  const reward = pickRandomItem();

  console.log("Receiving call to open a lootbox: ", {
    ...req.query,
    channelId: channelId,
    reward: reward,
  });
  const conn = await pool.getConnection();

  try {
    const usersTable = `lootbox_users_${channelId}`;
    const rewardsTable = `lootbox_rewards_${channelId}`;

    // Create tables if not exist
    if (!tableCache.has(channelId)) {
      await conn.query(userTableTemplate(usersTable));

      await conn.query(rewardsTableTemplate(rewardsTable));

      tableCache.add(channelId);
      console.log(`✅ Tables ready for channel ${channelId}`);
    }

    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO \`${usersTable}\` (user_id, username, total_opened)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE total_opened = total_opened + 1`,
      [userId, username],
    );

    await conn.query(
      `INSERT INTO \`${rewardsTable}\` (user_id, reward_name, reward_rarity, reward_condition, reward_value)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, reward.name, reward.rarity, reward.condition, reward.value],
    );

    await conn.commit();

    const message = formatCompactLootboxMessage({
      username,
      action: "opened",
      boxLabel: "lootbox",
      reward,
    });

    if (textMode === "true") {
      res.send(message);
    } else {
      res.json({ reward, message });
    }
  } catch (err) {
    await conn.rollback();
    console.error("❌ Database error:", err);
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    conn.release();
  }
});

router.get("/buylootbox", async (req, res) => {
  const { username, userId, channelId, rarityType, textMode } = req.query;

  console.log("🟢 /buylootbox called with params:", req.query);

  if (!username || !userId || !rarityType) {
    console.warn("⚠️ Missing required fields:", {
      username,
      userId,
      rarityType,
    });
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!channelId && !Admins.includes(username)) {
    console.warn("⚠️ Missing channel ID:", { username, channelId });
    return res.status(400).json({ error: "Missing channel ID" });
  }

  const conn = await pool.getConnection();
  try {
    const usersTable = `lootbox_users_${channelId}`;
    const rewardsTable = `lootbox_rewards_${channelId}`;
    console.log(`📦 Using tables: ${usersTable}, ${rewardsTable}`);

    // Ensure tables exist
    if (!tableCache.has(channelId)) {
      console.log(`🛠️ Creating tables for channel ${channelId}...`);
      await conn.query(userTableTemplate(usersTable));
      await conn.query(rewardsTableTemplate(rewardsTable));
      tableCache.add(channelId);
      console.log(`✅ Tables ready for ${channelId}`);
    }

    const lootboxData = rarityBoxRarities[rarityType];
    if (!lootboxData) {
      console.warn(`❌ Invalid lootbox rarity type: ${rarityType}`);
      return res.status(400).json({ error: "Invalid lootbox rarity type" });
    }

    const { price, rarityArray } = lootboxData;
    console.log(`💰 Lootbox type "${rarityType}" selected. Price: ${price}`);

    // Fetch user balance
    console.log(`🔍 Checking user balance for ${username} (${userId})...`);
    const [userRows] = await conn.query(
      `SELECT balance FROM \`${usersTable}\` WHERE user_id = ?`,
      [userId],
    );

    let userBalance = 0;
    if (userRows.length === 0) {
      console.log(
        `🆕 User not found, creating record for ${username} (${userId})`,
      );
      await conn.query(
        `INSERT INTO \`${usersTable}\` (user_id, username, total_opened, balance)
         VALUES (?, ?, 0, 0)`,
        [userId, username],
      );
    } else {
      userBalance = userRows[0].balance;
      console.log(`💵 Current balance for ${username}: ${userBalance}`);
    }

    // Balance check
    if (userBalance < price) {
      const msg = `💸 You need ${price} coins to buy a ${rarityType} lootbox, but only have ${userBalance}.`;
      console.warn(`❌ Insufficient balance: ${userBalance} < ${price}`);
      return textMode === "true"
        ? res.send(msg)
        : res.status(400).json({ error: msg });
    }

    console.log(`✅ Deducting ${price} from ${username}'s balance...`);
    await conn.beginTransaction();
    await conn.query(
      `UPDATE \`${usersTable}\` 
       SET balance = balance - ?, total_opened = total_opened + 1 
       WHERE user_id = ?`,
      [price, userId],
    );

    // Pick reward
    console.log(`🎲 Rolling reward for ${rarityType} box...`);
    const reward = pickRandomItem(rarityArray);
    console.log("🎁 Reward rolled:", reward);

    // Store reward
    console.log("🗃️ Inserting reward into DB...");
    await conn.query(
      `INSERT INTO \`${rewardsTable}\` 
        (user_id, reward_name, reward_rarity, reward_condition, reward_value)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, reward.name, reward.rarity, reward.condition, reward.value],
    );

    await conn.commit();
    console.log("✅ Transaction committed successfully.");

    const message = formatCompactLootboxMessage({
      username,
      action: "bought",
      boxLabel: `${rarityType} lootbox`,
      reward,
    });

    console.log("📤 Sending response:", message);

    if (textMode === "true") {
      res.send(message);
    } else {
      res.json({ reward, message });
    }
  } catch (err) {
    console.error("❌ Error in /buylootbox:", err);
    try {
      await conn.rollback();
      console.error("↩️ Transaction rolled back.");
    } catch (rollbackErr) {
      console.error("⚠️ Rollback failed:", rollbackErr);
    }
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    conn.release();
    console.log("🔚 Connection released.");
  }
});

// === INVENTORY ROUTE ===
router.get("/inventory", async (req, res) => {
  const { username, userId, textMode, channelId } = req.query;

  const cleanRewardName = (name) => {
    if (typeof name !== "string") return "Unknown Item";
    let cleaned = name.replace(/\s+/g, " ").trim();

    // Strip common wrapper junk from legacy item names while preserving inner text.
    cleaned = cleaned
      .replace(/^[\s\[\]\(\)"']+/, "")
      .replace(/[\s\[\]\(\)"']+$/, "")
      .trim();

    return cleaned || "Unknown Item";
  };

  const truncate = (text, maxLen) => {
    if (!text || text.length <= maxLen) return text;
    if (maxLen <= 3) return text.slice(0, maxLen);
    return `${text.slice(0, maxLen - 3)}...`;
  };

  console.log("Receiving call to check the inventory: ", {
    ...req.query,
    channelId: channelId,
  });

  if (!username || !userId)
    return res.status(400).json({ error: "Missing user info" });
  if (!channelId) return res.status(400).json({ error: "Missing channel ID" });

  const rewardsTable = `lootbox_rewards_${channelId}`;
  const conn = await pool.getConnection();

  try {
    await conn.query(rewardsTableTemplate(rewardsTable));

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
      [userId],
    );

    if (rows.length === 0) {
      const emptyMsg = `${username} has no loot yet. 🕳️`;
      if (textMode === "true") return res.send(emptyMsg);
      return res.json({ inventory: [], message: emptyMsg });
    }

    const inventory = {};
    const groupedInventory = new Map();
    const rarityStats = {};
    let totalWealth = 0;
    let totalStacks = 0;
    let totalItems = 0;

    for (const {
      reward_name,
      reward_rarity,
      reward_condition,
      count,
      total_value,
    } of rows) {
      const normalizedName = cleanRewardName(reward_name);
      const numericCount = Number(count) || 0;
      const numericValue = Number(total_value) || 0;
      const groupKey = `${reward_rarity}::${reward_condition}::${normalizedName.toLowerCase()}`;

      if (!groupedInventory.has(groupKey)) {
        groupedInventory.set(groupKey, {
          reward_name: normalizedName,
          reward_rarity,
          reward_condition,
          count: 0,
          total_value: 0,
        });
      }

      const existing = groupedInventory.get(groupKey);
      existing.count += numericCount;
      existing.total_value += numericValue;

      if (!rarityStats[reward_rarity]) {
        rarityStats[reward_rarity] = { items: 0, stacks: 0, value: 0 };
      }
      rarityStats[reward_rarity].items += numericCount;
      rarityStats[reward_rarity].value += numericValue;
      totalItems += numericCount;

      totalWealth += numericValue;
    }

    const groupedRows = Array.from(groupedInventory.values()).sort((a, b) => {
      if (b.total_value !== a.total_value) return b.total_value - a.total_value;
      return a.reward_name.localeCompare(b.reward_name);
    });

    for (const row of groupedRows) {
      if (!inventory[row.reward_rarity]) inventory[row.reward_rarity] = [];
      inventory[row.reward_rarity].push(
        `${row.reward_name} (${row.reward_condition}) x${row.count} — 💰${row.total_value}`,
      );
      totalStacks += 1;
      rarityStats[row.reward_rarity].stacks += 1;
    }

    const rarityOrder = [
      "Mythic",
      "Legendary",
      "Epic",
      "Rare",
      "Uncommon",
      "Common",
    ];

    const rarityShort = {
      Mythic: "M",
      Legendary: "L",
      Epic: "E",
      Rare: "R",
      Uncommon: "U",
      Common: "C",
    };

    const display = rarityOrder
      .filter((r) => inventory[r])
      .map(
        (r) =>
          `${itemEmojiByRarity[r]} ${r.toUpperCase()}: ${inventory[r].join(", ")}`,
      )
      .join(" | ");

    const raritySummary = rarityOrder
      .filter((r) => rarityStats[r])
      .map(
        (r) =>
          `${itemEmojiByRarity[r]}${rarityShort[r]}:${rarityStats[r].items}`,
      )
      .join(" ");

    const topItems = groupedRows.slice(0, 3).map((item) => {
      const shortName = truncate(item.reward_name, 16);
      return `${shortName} x${item.count} 💰${item.total_value}`;
    });

    const summaryMessage = [
      `🎒 ${username}'s Inventory Summary`,
      `🏦 💰${totalWealth}`,
      `🧾 ${totalItems} items (${totalStacks} stacks)`,
      raritySummary ? `📊 ${raritySummary}` : null,
      topItems.length ? `🔝 ${topItems.join(" | ")}` : null,
    ]
      .filter(Boolean)
      .join(" • ");

    const safeSummaryMessage = truncate(summaryMessage, 430);

    const message = `🎒 ${username}'s Inventory → ${display} | 🏦 Total Value: 💰${totalWealth}`;

    if (textMode === "true") res.send(safeSummaryMessage);
    else res.json({ inventory, totalWealth, message });
  } catch (err) {
    console.error("❌ Error fetching inventory:", err);
    res.status(500).json({ error: "Failed to fetch inventory" });
  } finally {
    conn.release();
  }
});

module.exports = router;
