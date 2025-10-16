require("dotenv").config();
const express = require("express");
const app = express();
const lootboxRoutes = require("./routes/lootbox");
const slotRoutes = require("./routes/slots");
const { version } = require("./package.json");

app.use(express.json());
app.use("/api", lootboxRoutes);
app.use("/api", slotRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${process.env.PORT || PORT}`);
  console.log("Current Version of the app: ", version);
});
