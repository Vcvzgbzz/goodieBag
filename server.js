require('dotenv').config();
const express = require('express');
const app = express();
const lootboxRoutes = require('./routes/lootbox');

app.use(express.json());
app.use('/api', lootboxRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
