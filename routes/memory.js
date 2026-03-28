const express = require("express");
const router = express.Router();
const pool = require("../db/connection");

const {
	commandEventsTableTemplate,
	askMemoryTableTemplate,
} = require("../appConstants");

const COMMAND_EVENTS_TABLE = "glorp_command_events";
const ASK_MEMORY_TABLE = "glorp_ask_memory";

let memoryTablesReady = false;
let retentionJobStarted = false;
let nightlyDigestJobStarted = false;

function safeInt(value, fallback = 0) {
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
}

function parseWindowDays(value, fallback = 30) {
	const parsed = safeInt(value, fallback);
	return Math.max(1, Math.min(parsed, 365));
}

function parseWindowFilter(value, fallback = 30) {
	if (typeof value === "string" && value.trim().toLowerCase() === "all") {
		return null;
	}

	return parseWindowDays(value, fallback);
}

function parseLimit(value, fallback = 10, max = 50) {
	const parsed = safeInt(value, fallback);
	return Math.max(1, Math.min(parsed, max));
}

const RAW_RETENTION_DAYS = Math.max(
	31,
	safeInt(process.env.MEMORY_RAW_RETENTION_DAYS, 35),
);
const CLEANUP_INTERVAL_MS = Math.max(
	60 * 60 * 1000,
	safeInt(process.env.MEMORY_CLEANUP_INTERVAL_MS, 12 * 60 * 60 * 1000),
);
const DIGEST_HOUR_UTC = Math.max(
	0,
	Math.min(23, safeInt(process.env.MEMORY_DIGEST_HOUR_UTC, 8)),
);

function formatDateUTC(date) {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function msUntilNextDigest(hourUtc) {
	const now = new Date();
	const next = new Date(now);
	next.setUTCHours(hourUtc, 0, 0, 0);

	if (next <= now) {
		next.setUTCDate(next.getUTCDate() + 1);
	}

	return next.getTime() - now.getTime();
}

async function buildChannelMoodDigest(conn, channelId, windowDays = 7) {
	const safeWindow = parseWindowDays(windowDays, 7);

	const [[overallStats]] = await conn.query(
		`SELECT
			 COUNT(*) AS total_asks,
			 ROUND(AVG(delta_score), 2) AS avg_delta,
			 ROUND(AVG(feeling_after), 2) AS avg_feeling,
			 SUM(CASE WHEN safety_blocked = 1 THEN 1 ELSE 0 END) AS safety_blocks
		 FROM \`${ASK_MEMORY_TABLE}\`
		 WHERE channel_id = ?
			 AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
		[channelId, safeWindow],
	);

	const [themeRows] = await conn.query(
		`SELECT
			 LOWER(TRIM(SUBSTRING(question_text, 1, 80))) AS theme,
			 COUNT(*) AS count
		 FROM \`${ASK_MEMORY_TABLE}\`
		 WHERE channel_id = ?
			 AND question_text IS NOT NULL
			 AND question_text <> ''
			 AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
		 GROUP BY theme
		 ORDER BY count DESC
		 LIMIT 5`,
		[channelId, safeWindow],
	);

	const [trendRows] = await conn.query(
		`SELECT
			 DATE(created_at) AS day,
			 COUNT(*) AS ask_count,
			 ROUND(AVG(delta_score), 2) AS avg_delta,
			 ROUND(AVG(feeling_after), 2) AS avg_feeling,
			 SUM(CASE WHEN safety_blocked = 1 THEN 1 ELSE 0 END) AS safety_blocks
		 FROM \`${ASK_MEMORY_TABLE}\`
		 WHERE channel_id = ?
			 AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
		 GROUP BY DATE(created_at)
		 ORDER BY day ASC`,
		[channelId, safeWindow],
	);

	const [emotionRows] = await conn.query(
		`SELECT emotion, COUNT(*) AS count
		 FROM \`${ASK_MEMORY_TABLE}\`
		 WHERE channel_id = ?
			 AND emotion IS NOT NULL
			 AND emotion <> ''
			 AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
		 GROUP BY emotion
		 ORDER BY count DESC
		 LIMIT 5`,
		[channelId, safeWindow],
	);

	const totalAsks = safeInt(overallStats?.total_asks, 0);
	const safetyBlocks = safeInt(overallStats?.safety_blocks, 0);
	const safetyBlockRate = totalAsks > 0 ? Number((safetyBlocks / totalAsks).toFixed(4)) : 0;

	return {
		channelId,
		windowDays: safeWindow,
		overall: {
			total_asks: totalAsks,
			avg_delta: Number(overallStats?.avg_delta || 0),
			avg_feeling: Number(overallStats?.avg_feeling || 5),
			safety_blocks: safetyBlocks,
			safety_block_rate: safetyBlockRate,
		},
		topThemes: themeRows.map((row) => ({
			theme: row.theme,
			count: safeInt(row.count, 0),
		})),
		sentimentTrend: trendRows.map((row) => ({
			day: formatDateUTC(new Date(row.day)),
			ask_count: safeInt(row.ask_count, 0),
			avg_delta: Number(row.avg_delta || 0),
			avg_feeling: Number(row.avg_feeling || 5),
			safety_blocks: safeInt(row.safety_blocks, 0),
		})),
		topEmotions: emotionRows,
	};
}

async function ensureMemoryTables(conn) {
	if (memoryTablesReady) return;

	await conn.query(commandEventsTableTemplate(COMMAND_EVENTS_TABLE));
	await conn.query(askMemoryTableTemplate(ASK_MEMORY_TABLE));

	const indexStatements = [
		`CREATE INDEX idx_cmd_created_at ON \`${COMMAND_EVENTS_TABLE}\` (created_at)`,
		`CREATE INDEX idx_cmd_user_channel ON \`${COMMAND_EVENTS_TABLE}\` (user_id, channel_id)`,
		`CREATE INDEX idx_cmd_command_name ON \`${COMMAND_EVENTS_TABLE}\` (command_name)`,
		`CREATE INDEX idx_ask_created_at ON \`${ASK_MEMORY_TABLE}\` (created_at)`,
		`CREATE INDEX idx_ask_user_channel ON \`${ASK_MEMORY_TABLE}\` (user_id, channel_id)`,
		`CREATE INDEX idx_ask_emotion ON \`${ASK_MEMORY_TABLE}\` (emotion)`,
	];

	for (const stmt of indexStatements) {
		try {
			await conn.query(stmt);
		} catch (err) {
			// Duplicate index names are expected on subsequent boots.
			if (err && err.code !== "ER_DUP_KEYNAME") {
				throw err;
			}
		}
	}

	memoryTablesReady = true;
}

async function cleanupOldAskRows() {
	const conn = await pool.getConnection();
	try {
		await ensureMemoryTables(conn);

		const [result] = await conn.query(
			`DELETE FROM \`${ASK_MEMORY_TABLE}\`
			 WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
			[RAW_RETENTION_DAYS],
		);

		if (result && result.affectedRows > 0) {
			console.log(
				`🧹 Memory cleanup removed ${result.affectedRows} rows older than ${RAW_RETENTION_DAYS} days`,
			);
		}
	} catch (err) {
		console.error("❌ Memory cleanup job error:", err);
	} finally {
		conn.release();
	}
}

function startRetentionJob() {
	if (retentionJobStarted) return;
	retentionJobStarted = true;

	// Run once shortly after boot, then on interval.
	setTimeout(() => {
		cleanupOldAskRows();
	}, 5000);

	setInterval(() => {
		cleanupOldAskRows();
	}, CLEANUP_INTERVAL_MS);

	console.log(
		`🕒 Memory retention enabled: deleting raw ask rows older than ${RAW_RETENTION_DAYS} days every ${Math.round(CLEANUP_INTERVAL_MS / (60 * 60 * 1000))}h`,
	);
}

async function runNightlyDigest() {
	const conn = await pool.getConnection();
	try {
		await ensureMemoryTables(conn);

		const [channelRows] = await conn.query(
			`SELECT DISTINCT channel_id
			 FROM \`${ASK_MEMORY_TABLE}\`
			 WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
				 AND channel_id IS NOT NULL
				 AND channel_id <> ''`,
		);

		for (const row of channelRows) {
			const channelId = String(row.channel_id || "").trim();
			if (!channelId) continue;

			const digest = await buildChannelMoodDigest(conn, channelId, 1);
			console.log("🌙 Nightly channel digest:", JSON.stringify(digest));
		}
	} catch (err) {
		console.error("❌ Nightly digest job error:", err);
	} finally {
		conn.release();
	}
}

function startNightlyDigestJob() {
	if (nightlyDigestJobStarted) return;
	nightlyDigestJobStarted = true;

	const initialDelay = msUntilNextDigest(DIGEST_HOUR_UTC);
	setTimeout(() => {
		runNightlyDigest();
		setInterval(() => {
			runNightlyDigest();
		}, 24 * 60 * 60 * 1000);
	}, initialDelay);

	console.log(
		`🌙 Nightly digest enabled: running daily at ${String(DIGEST_HOUR_UTC).padStart(2, "0")}:00 UTC`,
	);
}

router.post("/memory/event", async (req, res) => {
	const { username, userId, channelId, commandName, success, metadata } =
		req.body || {};

	if (!username || !userId || !channelId || !commandName) {
		return res.status(400).json({ error: "Missing required memory event fields" });
	}

	const conn = await pool.getConnection();
	try {
		await ensureMemoryTables(conn);

		await conn.query(
			`INSERT INTO \`${COMMAND_EVENTS_TABLE}\`
			 (channel_id, user_id, username, command_name, was_success, metadata_json)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[
				channelId,
				userId,
				username,
				commandName,
				success === false ? 0 : 1,
				metadata ? JSON.stringify(metadata) : null,
			],
		);

		return res.json({ ok: true });
	} catch (err) {
		console.error("❌ /memory/event error:", err);
		return res.status(500).json({ error: "Failed to store memory event" });
	} finally {
		conn.release();
	}
});

router.post("/memory/glorp", async (req, res) => {
	const {
		username,
		userId,
		channelId,
		question,
		reply,
		delta,
		feeling,
		emotion,
		reason,
		safetyBlocked,
		safetyReason,
	} = req.body || {};

	if (!username || !userId || !channelId || !question) {
		return res.status(400).json({ error: "Missing required glorp memory fields" });
	}

	const conn = await pool.getConnection();
	try {
		await ensureMemoryTables(conn);

		await conn.query(
			`INSERT INTO \`${ASK_MEMORY_TABLE}\`
			 (channel_id, user_id, username, question_text, reply_text, delta_score, feeling_after, emotion, reason_text, safety_blocked, safety_reason)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				channelId,
				userId,
				username,
				String(question).slice(0, 2000),
				String(reply || "").slice(0, 2000),
				safeInt(delta, 0),
				safeInt(feeling, 5),
				emotion ? String(emotion).slice(0, 64) : null,
				reason ? String(reason).slice(0, 255) : null,
				safetyBlocked ? 1 : 0,
				safetyReason ? String(safetyReason).slice(0, 100) : null,
			],
		);

		return res.json({ ok: true });
	} catch (err) {
		console.error("❌ /memory/glorp error:", err);
		return res.status(500).json({ error: "Failed to store glorp memory" });
	} finally {
		conn.release();
	}
});

router.get("/memory/user-summary", async (req, res) => {
	const { userId, channelId } = req.query;
	const windowDays = parseWindowFilter(req.query.windowDays, 30);

	if (!userId || !channelId) {
		return res.status(400).json({ error: "userId and channelId are required" });
	}

	const conn = await pool.getConnection();
	try {
		await ensureMemoryTables(conn);

		const commandWindowClause =
			windowDays === null
				? ""
				: " AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)";
		const commandParams = [userId, channelId];
		if (windowDays !== null) {
			commandParams.push(windowDays);
		}

		const [commandRows] = await conn.query(
			`SELECT command_name, COUNT(*) AS command_count
			 FROM \`${COMMAND_EVENTS_TABLE}\`
			 WHERE user_id = ?
				 AND channel_id = ?
				${commandWindowClause}
			 GROUP BY command_name
			 ORDER BY command_count DESC`,
			commandParams,
		);

		const askWindowClause =
			windowDays === null
				? ""
				: " AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)";
		const askParams = [userId, channelId];
		if (windowDays !== null) {
			askParams.push(windowDays);
		}

		const [[glorpStats]] = await conn.query(
			`SELECT
				 COUNT(*) AS total_asks,
				 ROUND(AVG(delta_score), 2) AS avg_delta,
				 ROUND(AVG(feeling_after), 2) AS avg_feeling,
				 SUM(CASE WHEN safety_blocked = 1 THEN 1 ELSE 0 END) AS safety_blocks
			 FROM \`${ASK_MEMORY_TABLE}\`
			 WHERE user_id = ?
				 AND channel_id = ?
				${askWindowClause}`,
			askParams,
		);

		const emotionParams = [userId, channelId];
		if (windowDays !== null) {
			emotionParams.push(windowDays);
		}

		const [emotionRows] = await conn.query(
			`SELECT emotion, COUNT(*) AS count
			 FROM \`${ASK_MEMORY_TABLE}\`
			 WHERE user_id = ?
				 AND channel_id = ?
				 AND emotion IS NOT NULL
				 AND emotion <> ''
				${askWindowClause}
			 GROUP BY emotion
			 ORDER BY count DESC
			 LIMIT 5`,
			emotionParams,
		);

		return res.json({
			userId,
			channelId,
			windowDays: windowDays === null ? "all" : windowDays,
			commands: commandRows,
			glorp: glorpStats || {
				total_asks: 0,
				avg_delta: 0,
				avg_feeling: 5,
				safety_blocks: 0,
			},
			topEmotions: emotionRows,
		});
	} catch (err) {
		console.error("❌ /memory/user-summary error:", err);
		return res.status(500).json({ error: "Failed to build user summary" });
	} finally {
		conn.release();
	}
});

router.get("/memory/weekly-questions", async (req, res) => {
	const { channelId } = req.query;
	const limit = parseLimit(req.query.weeks, 4, 26);

	if (!channelId) {
		return res.status(400).json({ error: "channelId is required" });
	}

	const conn = await pool.getConnection();
	try {
		await ensureMemoryTables(conn);

		const [weeklyRows] = await conn.query(
			`SELECT
				 YEARWEEK(created_at, 1) AS iso_week,
				 COUNT(*) AS question_count,
				 ROUND(AVG(delta_score), 2) AS avg_delta,
				 SUM(CASE WHEN safety_blocked = 1 THEN 1 ELSE 0 END) AS safety_blocks
			 FROM \`${ASK_MEMORY_TABLE}\`
			 WHERE channel_id = ?
			 GROUP BY iso_week
			 ORDER BY iso_week DESC
			 LIMIT ?`,
			[channelId, limit],
		);

		const [emotionRows] = await conn.query(
			`SELECT
				 YEARWEEK(created_at, 1) AS iso_week,
				 emotion,
				 COUNT(*) AS emotion_count
			 FROM \`${ASK_MEMORY_TABLE}\`
			 WHERE channel_id = ?
				 AND emotion IS NOT NULL
				 AND emotion <> ''
			 GROUP BY iso_week, emotion
			 ORDER BY iso_week DESC, emotion_count DESC
			 LIMIT ?`,
			[channelId, limit * 5],
		);

		return res.json({
			channelId,
			weeksRequested: limit,
			weekly: weeklyRows,
			weeklyEmotionBreakdown: emotionRows,
		});
	} catch (err) {
		console.error("❌ /memory/weekly-questions error:", err);
		return res.status(500).json({ error: "Failed to build weekly summary" });
	} finally {
		conn.release();
	}
});

router.get("/memory/channel-mood", async (req, res) => {
	const { channelId } = req.query;
	const windowDays = parseWindowDays(req.query.windowDays, 7);

	if (!channelId) {
		return res.status(400).json({ error: "channelId is required" });
	}

	const conn = await pool.getConnection();
	try {
		await ensureMemoryTables(conn);
		const digest = await buildChannelMoodDigest(conn, channelId, windowDays);
		return res.json(digest);
	} catch (err) {
		console.error("❌ /memory/channel-mood error:", err);
		return res.status(500).json({ error: "Failed to build channel mood summary" });
	} finally {
		conn.release();
	}
});

startRetentionJob();
startNightlyDigestJob();

module.exports = router;
