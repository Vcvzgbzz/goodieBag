const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

const items = [
    { name: "Common Item", rarity: "Common", weight: 60 },
    { name: "Rare Item", rarity: "Rare", weight: 30 },
    { name: "Epic Item", rarity: "Epic", weight: 9 },
    { name: "Legendary Item", rarity: "Legendary", weight: 1 }
];

function pickRandomItem() {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let rand = Math.random() * totalWeight;

    for (let item of items) {
        if (rand < item.weight) return item;
        rand -= item.weight;
    }
}

router.get('/lootbox', async (req, res) => {
    
    const { username, userId } = req.query;
    console.log("Got a requst for",userId)

    if (!username || !userId) {
        return res.status(400).json({ error: 'Missing user info' });
    }

    const reward = pickRandomItem();

    console.log('Reward chosen: ', reward)

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
        res.json({ reward });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
    } finally {
        conn.release();
    }
});

module.exports = router;
