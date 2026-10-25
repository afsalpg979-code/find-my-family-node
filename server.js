const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const frontendDist = path.join(__dirname, "frontend", "dist");
const staticRoot = fs.existsSync(path.join(frontendDist, "index.html"))
  ? frontendDist
  : path.join(__dirname, "public");

app.disable("x-powered-by");
app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "Find My Family", frontend: staticRoot === frontendDist ? "react-build" : "legacy-fallback" });
});
app.use(express.static(staticRoot, { etag: true, maxAge: "1h" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log("Find My Family is running at http://127.0.0.1:" + PORT);
  if (staticRoot !== frontendDist) {
    console.log("React build not found. Run npm install --prefix frontend && npm run build to serve the latest app.");
  }
});