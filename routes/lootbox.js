const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

const {
  Admins,
  itemEmojiByRarity,
  rarities,
  rarityBasePrice,
  itemsByRarity,
  conditions,
  conditionEmojis,
  rarityEndpoints,
  rewardsTableTemplate,
  userTableTemplate
} = require('../appConstants');



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


const sellAllByRarity = async (rarity, userId, channelId, conn) => {

  const usersTable = `lootbox_users_${channelId}`;
  const rewardsTable = `lootbox_rewards_${channelId}`;

  const normalizedRarity = rarity?.toLowerCase();
  const validRarities = Object.keys(itemEmojiByRarity).map(r => r.toLowerCase());
  if (!validRarities.includes(normalizedRarity)) {
    throw new Error(`Invalid rarity: ${rarity}`);
  }

  const matchedRarity = Object.keys(itemEmojiByRarity).find(
    r => r.toLowerCase() === normalizedRarity
  );

  const emoji = itemEmojiByRarity[matchedRarity] || '⚫';

  // Ensure tables exist
  await conn.query(userTableTemplate(usersTable));
  await conn.query(rewardsTableTemplate(rewardsTable));

  // Select items to sell
  const [items] = await conn.query(
    `SELECT id, reward_value FROM \`${rewardsTable}\`
     WHERE user_id = ? AND LOWER(reward_rarity) = ?`,
    [userId, normalizedRarity]
  );

  if (!items.length) {
    return {
      sold: 0,
      value: 0,
      message: `🫥 No ${matchedRarity} items found to sell.`
    };
  }

  const idsToDelete = items.map(item => item.id);
  const totalValue = items.reduce((sum, item) => sum + item.reward_value, 0);

  // Delete sold items
  const deleteQuery = `
    DELETE FROM \`${rewardsTable}\`
    WHERE id IN (${idsToDelete.map(() => '?').join(',')})`;
  await conn.query(deleteQuery, idsToDelete);

  // Update balance
  await conn.query(
    `UPDATE \`${usersTable}\` SET balance = balance + ? WHERE user_id = ?`,
    [totalValue, userId]
  );

  return {
    sold: idsToDelete.length,
    value: totalValue,
    message: `✅ Sold ${idsToDelete.length} ${matchedRarity} item(s) for 💰${totalValue}. ${emoji}`
  };
};


// === LOOTBOX ROUTE ===
router.get('/lootbox', async (req, res) => {
  const { username, userId, textMode } = req.query;
  const channelId = req.headers['x-streamelements-channel'];


  console.log('Receiving call to open a lootbox: ',{...req.query,channelId:channelId})

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


    console.log('Receiving call to check the inventory: ',{...req.query,channelId:channelId})

  if (!username || !userId) return res.status(400).json({ error: 'Missing user info' });
  if (!channelId) return res.status(400).json({ error: 'Missing StreamElements channel header' });

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

router.get('/sell', async (req, res) => {
  const channelId = req.headers['x-streamelements-channel'];

    console.log('Receiving call to sell: ',{...req.query,channelId:channelId})


  function stripQuotes(str) {
    return typeof str === 'string' ? str.replace(/^"(.*)"$/, '$1') : str;
  }

  const username = stripQuotes(req.query.username);
  const userId = stripQuotes(req.query.userId);
  const textMode = stripQuotes(req.query.textMode);
  const quantity = stripQuotes(req.query.quantity);
  const conditionOrRarity = stripQuotes(req.query.conditionOrRarity);
  const itemName = stripQuotes(req.query.itemName);

  if (!username || !userId)
    return res.status(400).json({ error: 'Missing user info' });
  if (!channelId)
    return res.status(400).json({ error: 'Missing StreamElements channel header' });

  if (!quantity) return res.status(400).json({ error: 'Quantity must be specified' });

  const usersTable = `lootbox_users_${channelId}`;
  const rewardsTable = `lootbox_rewards_${channelId}`;
  const conn = await pool.getConnection();

  try {
    await conn.query(userTableTemplate(usersTable));
    await conn.query(rewardsTableTemplate(rewardsTable));

    await conn.beginTransaction();

    let query = '';
    let queryParams = [userId];
    let itemsSold = [];
    let totalValue = 0;

    const lowerRarity = conditionOrRarity?.toLowerCase();
    const validRarities = Object.keys(itemEmojiByRarity).map(r => r.toLowerCase());
    const validConditions = Object.keys(conditionEmojis).map(c => c.toLowerCase());

    if (quantity === 'all' && !conditionOrRarity && !itemName) {
      query = `
        SELECT id, reward_value FROM \`${rewardsTable}\`
        WHERE user_id = ?`;
    }

    else if (quantity === 'all' && conditionOrRarity && validRarities.includes(lowerRarity)) {
      query = `
        SELECT id, reward_value FROM \`${rewardsTable}\`
        WHERE user_id = ? AND LOWER(reward_rarity) = ?`;
      queryParams.push(lowerRarity);
    }

    else if (quantity && conditionOrRarity && itemName) {
      if (!validConditions.includes(conditionOrRarity.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid item condition' });
      }

      query = `
        SELECT id, reward_value FROM \`${rewardsTable}\`
        WHERE user_id = ? AND reward_name = ? AND LOWER(reward_condition) = ?
        LIMIT ?`;
      queryParams.push(itemName, conditionOrRarity.toLowerCase(), parseInt(quantity));
    }

    else {
      return res.status(400).json({ error: 'Invalid sell parameters' });
    }

    const [rows] = await conn.query(query, queryParams);

    if (!rows.length) {
      const emptyMsg = `🫥 ${username} has no items matching that criteria.`;
      if (textMode === 'true') return res.send(emptyMsg);
      return res.status(404).json({ error: emptyMsg });
    }

    const idsToDelete = rows.map(row => row.id);
    totalValue = rows.reduce((sum, row) => sum + row.reward_value, 0);

    if (idsToDelete.length) {
      const deleteQuery = `DELETE FROM \`${rewardsTable}\` WHERE id IN (${idsToDelete.map(() => '?').join(',')})`;
      await conn.query(deleteQuery, idsToDelete);

      await conn.query(
        `UPDATE \`${usersTable}\` SET balance = balance + ? WHERE user_id = ?`,
        [totalValue, userId]
      );
    }

    await conn.commit();

    const message = `✅ ${username} sold ${idsToDelete.length} item(s) for 💰${totalValue}.`;

    if (textMode === 'true') return res.send(message);
    else return res.json({ sold: idsToDelete.length, value: totalValue, message });

  } catch (err) {
    await conn.rollback();
    console.error('❌ Error processing sell:', err);
    res.status(500).json({ error: 'Failed to process sell' });
  } finally {
    conn.release();
  }
});

router.get('/sellAll', async (req, res) => {
  const channelId = req.headers['x-streamelements-channel'];
  console.log('Receiving call to sellAll:', { ...req.query, channelId });

  function stripQuotes(str) {
    return typeof str === 'string' ? str.replace(/^"(.*)"$/, '$1') : str;
  }

  const username = stripQuotes(req.query.username);
  const userId = stripQuotes(req.query.userId);
  const textMode = stripQuotes(req.query.textMode);

  if (!username || !userId)
    return res.status(400).json({ error: 'Missing user info' });

  if (!channelId)
    return res.status(400).json({ error: 'Missing StreamElements channel header' });

  const usersTable = `lootbox_users_${channelId}`;
  const rewardsTable = `lootbox_rewards_${channelId}`;
  const conn = await pool.getConnection();

  try {
    await conn.query(userTableTemplate(usersTable));
    await conn.query(rewardsTableTemplate(rewardsTable));

    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, reward_value FROM \`${rewardsTable}\` WHERE user_id = ?`,
      [userId]
    );

    if (!rows.length) {
      const emptyMsg = `🫥 ${username} has no items to sell.`;
      if (textMode === 'true') return res.send(emptyMsg);
      return res.status(404).json({ error: emptyMsg });
    }

    const idsToDelete = rows.map(row => row.id);
    const totalValue = rows.reduce((sum, row) => sum + row.reward_value, 0);

    const deleteQuery = `DELETE FROM \`${rewardsTable}\` WHERE id IN (${idsToDelete.map(() => '?').join(',')})`;
    await conn.query(deleteQuery, idsToDelete);

    await conn.query(
      `UPDATE \`${usersTable}\` SET balance = balance + ? WHERE user_id = ?`,
      [totalValue, userId]
    );

    await conn.commit();

    const message = `✅ ${username} sold ALL items (${idsToDelete.length}) for 💰${totalValue}.`;

    if (textMode === 'true') return res.send(message);
    else return res.json({ sold: idsToDelete.length, value: totalValue, message });

  } catch (err) {
    await conn.rollback();
    console.error('❌ Error processing sellAll:', err);
    res.status(500).json({ error: 'Failed to process sellAll' });
  } finally {
    conn.release();
  }
});


for (const rarity of rarityEndpoints) {
  router.get(`/sellAll${rarity}`, async (req, res) => {
    const channelId = req.headers['x-streamelements-channel'];
    console.log(`Receiving call to sellAll${rarity}:`, { ...req.query, channelId });

    function stripQuotes(str) {
      return typeof str === 'string' ? str.replace(/^"(.*)"$/, '$1') : str;
    }

    const username = stripQuotes(req.query.username);
    const userId = stripQuotes(req.query.userId);
    const textMode = stripQuotes(req.query.textMode);

    if (!username || !userId)
      return res.status(400).json({ error: 'Missing user info' });
    if (!channelId)
      return res.status(400).json({ error: 'Missing StreamElements channel header' });

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const result = await sellAllByRarity(rarity, userId, channelId, conn);

      await conn.commit();

      if (textMode === 'true') {
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

router.get('/slots', async (req, res) => {
  const channelId = req.headers['x-streamelements-channel'];
  console.log('Receiving call to /slots:', { ...req.query, channelId });

  function stripQuotes(str) {
    return typeof str === 'string' ? str.replace(/^"(.*)"$/, '$1') : str;
  }

  const username = stripQuotes(req.query.username);
  const userId = stripQuotes(req.query.userId);
  const textMode = stripQuotes(req.query.textMode);
  const betAmount = parseInt(stripQuotes(req.query.balance), 10);

  const emojiSet = ['🍒', '🍋', '🍇', '🍉', '💎'];

  if (!username || !userId)
    return res.status(400).json({ error: 'Missing user info' });
  if (!channelId)
    return res.status(400).json({ error: 'Missing StreamElements channel header' });
  if (!betAmount || betAmount <= 0)
    return res.status(400).json({ error: 'Invalid or missing bet amount' });

  const usersTable = `lootbox_users_${channelId}`;
  const conn = await pool.getConnection();

  try {
    await conn.query(userTableTemplate(usersTable));

    // Check balance
    const [[userRow]] = await conn.query(
      `SELECT balance FROM \`${usersTable}\` WHERE user_id = ?`,
      [userId]
    );

    const currentBalance = userRow?.balance ?? 0;

    if (currentBalance < betAmount) {
      const msg = `❌ ${username}, you don't have enough 💰 to bet ${betAmount}. Current balance: ${currentBalance}`;
      if (textMode === 'true') return res.send(msg);
      return res.status(400).json({ error: msg });
    }

    // Spin the slots
    const spin = () => {
      const pick = () => emojiSet[Math.floor(Math.random() * emojiSet.length)];
      return [pick(), pick(), pick()];
    };

    const [a, b, c] = spin();
    const cherry = '🍒';
    let multiplier = 0;
    let result = '';
    let outcome = '';

    if (a === b && b === c) {
      if (a === cherry) {
        multiplier = 10;
        outcome = 'JACKPOT 🍒🍒🍒!';
      } else {
        multiplier = 5;
        outcome = 'Triple match!';
      }
    } else if (a === b || b === c || a === c) {
      multiplier = 1.2;
      outcome = 'Nice! You got a pair.';
    } else {
      multiplier = 0;
      outcome = 'No match 😢';
    }

    const winnings = Math.floor(betAmount * multiplier);
    const newBalance = multiplier > 0
      ? currentBalance + (winnings - betAmount)
      : currentBalance - betAmount;

    // Update balance
    await conn.query(
      `INSERT INTO \`${usersTable}\` (user_id, username, balance)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE balance = ?`,
      [userId, username, newBalance, newBalance]
    );

    const display = `[ ${a} | ${b} | ${c} ]`;
    const message = `${display} — ${outcome} ${multiplier > 0 ? `You won 💰${winnings}` : `You lost 💀${betAmount}`} | New balance: 💼 ${newBalance}`;

    if (textMode === 'true') return res.send(message);
    else return res.json({ result: [a, b, c], multiplier, winnings, newBalance, message });

  } catch (err) {
    console.error('❌ Error running slots:', err);
    res.status(500).json({ error: 'Something went wrong' });
  } finally {
    conn.release();
  }
});

  
  
module.exports = router;
