const express = require("express");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "Find My Family" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Find My Family is running at http://127.0.0.1:${PORT}`);
});