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


router.get('/slots', async (req, res) => {
  const channelId = req.query.channelId
  console.log('Receiving call to /slots:', { ...req.query, channelId });

  function stripQuotes(str) {
    return typeof str === 'string' ? str.replace(/^"(.*)"$/, '$1') : str;
  }

  const username = stripQuotes(req.query.username);
  const userId = stripQuotes(req.query.userId);
  const textMode = stripQuotes(req.query.textMode);
  const betAmount = parseInt(stripQuotes(req.query.balance), 10);

  const emojiSet = ['🍒', '🍋', '🍇', '🍉', '💎', '🍆'];

  if (!username || !userId)
    return res.status(400).json({ error: 'Missing user info' });
  if (!channelId)
    return res.status(400).json({ error: 'Missing channel ID' });
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

    const itemArray = spin();
    const [a, b, c] = itemArray;
    const cherry = '🍒';
    const diamond = '💎';
    const eggplant = '🍆';

    let multiplier = 0;
    let result = '';
    let outcome = '';

    if (a === b && b === c) {
    if (a === cherry) {
        multiplier = 5;
        outcome = 'Delicious 🍒🍒🍒!';
    } else if (a === diamond) {
        multiplier = 10;
        outcome = 'BLING BLING BOY 💎💎💎!';
    } else {
        if (itemArray.includes(eggplant)) {
        outcome = 'Smh, we just got egged :(';
        multiplier = 0.9;
        } else {
        multiplier = 3;
        outcome = 'Triple match!';
        }
    }
    } else if (a === b || b === c || a === c) {
    if (itemArray.includes(eggplant)) {
        outcome = 'Smh, we just got egged :(';
        multiplier = 0.8;
    } else {
        multiplier = 2;
        outcome = 'Nice! You got a pair.';
    }
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
