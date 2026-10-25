const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const frontendDist = path.join(__dirname, "frontend", "dist");
const buildReady = fs.existsSync(path.join(frontendDist, "index.html"));

app.disable("x-powered-by");
app.get("/health", (_req, res) => {
  res.status(buildReady ? 200 : 503).json({
    ok: buildReady,
    app: "Find My Family",
    frontend: buildReady ? "react-build" : "missing-build"
  });
});

app.use(express.static(frontendDist, { etag: true, maxAge: "1h" }));
app.use((req, res) => {
  if (!buildReady) {
    return res.status(503).type("text").send(
      "Find My Family React build is missing. In the repository folder, run: npm install --prefix frontend && npm run build, then restart with npm start."
    );
  }
  return res.sendFile(path.join(frontendDist, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Find My Family is running at http://127.0.0.1:" + PORT);
  if (!buildReady) {
    console.error("React build not found. Run npm install --prefix frontend && npm run build before sharing the app.");
  }
});
