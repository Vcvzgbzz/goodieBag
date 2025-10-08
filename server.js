require('dotenv').config();
const express = require('express');
const app = express();
const lootboxRoutes = require('./routes/lootbox');

app.use(express.json());
app.use('/api', lootboxRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${process.env.PORT || PORT}`);
  });