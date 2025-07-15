// ===== server.js =====
import express from "express";
import dotenv from "dotenv";
import request from "request";
import querystring from "querystring";
import cors from "cors";

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

// Spotify credentials from .env
const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

// In-memory storage of all users' top tracks
let userTopTracks = [];

// ✅ Root route
app.get("/", (req, res) => {
  res.send("✅ Spotify Top Tracks backend is running.");
});

// 🔐 Login route
app.get("/login", (req, res) => {
  const scope = "user-top-read";
  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
  });

  console.log("➡️ Redirecting to Spotify login...");
  res.redirect(`https://accounts.spotify.com/authorize?${auth_query_params}`);
});

// 🎯 Callback route from Spotify
app.get("/callback", (req, res) => {
  const code = req.query.code || null;

  const authOptions = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      code,
      redirect_uri,
      grant_type: "authorization_code",
    },
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${client_id}:${client_secret}`).toString("base64"),
    },
    json: true,
  };

  request.post(authOptions, (error, response, body) => {
    if (error || response.statusCode !== 200) {
      console.error("❌ Error fetching access token:", error || body);
      return res.status(response.statusCode).json({ error: "Failed to get access token" });
    }

    const access_token = body.access_token;
    console.log("✅ Access token received");

    // Redirect to frontend with token
    res.redirect("/#access_token=" + access_token);
  });
});

// 🎵 Store token and fetch user's top tracks
app.post("/store-token", (req, res) => {
  const access_token = req.body.access_token;
  if (!access_token) {
    return res.status(400).json({ error: "Missing access token" });
  }

  const options = {
    url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
    headers: { Authorization: `Bearer ${access_token}` },
    json: true,
  };

  request.get(options, (error, response, body) => {
    if (error || body.error) {
      console.error("❌ Error fetching top tracks:", error || body.error);
      return res.status(500).json({ error: "Failed to fetch top tracks" });
    }

    const trackNames = body.items.map(track => track.name);
    userTopTracks.push(...trackNames);
    console.log(`🎉 Stored ${trackNames.length} tracks. Total: ${userTopTracks.length}`);
    res.json({ success: true });
  });
});

// 📊 Aggregate top tracks
app.get("/aggregate", (req, res) => {
  if (userTopTracks.length === 0) {
    return res.send("<h1>No data yet. Ask users to log in at /login</h1>");
  }

  const countMap = {};
  for (const name of userTopTracks) {
    countMap[name] = (countMap[name] || 0) + 1;
  }

  const sorted = Object.entries(countMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `<li>${name} — ${count} votes</li>`)
    .join("");

  res.send(`<h1>🎶 Most Popular Songs</h1><ul>${sorted}</ul>`);
});

// ✅ Start the server
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
