require('dotenv').config();
const fs = require('fs');
const https = require('https');
const express = require('express');
const app = express();
const lootboxRoutes = require('./routes/lootbox');

app.use(express.json());
app.use('/api', lootboxRoutes);

const PORT = process.env.PORT || 3000;

const options = {
  key: fs.readFileSync('./treggat.us.key'),
  cert: fs.readFileSync('./treggat.us.cer'),
};

https.createServer(options, app).listen(PORT, () => {
  console.log(`HTTPS Server running on port ${PORT}`);
});
