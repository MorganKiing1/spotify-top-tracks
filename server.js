// server.js
import express from "express";
import dotenv from "dotenv";
import request from "request";
import querystring from "querystring";
import cors from "cors";
import { v4 as uuidv4 } from "uuid"; // To generate user IDs

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json()); // to receive JSON POST bodies

// Spotify credentials
const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

// Temporary in-memory stores
const userTokens = {}; // { userId: accessToken }
const userTracks = {}; // { userId: [track1, track2, ...] }

// ✅ Root
app.get("/", (req, res) => {
  res.send("✅ Spotify Top Tracks backend is running.");
});

// 🔐 Login
app.get("/login", (req, res) => {
  const scope = "user-top-read";
  const userId = uuidv4();
  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri: `${redirect_uri}?user_id=${userId}`,
    state: userId,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${auth_query_params}`);
});

// 🎯 Callback
app.get("/callback", (req, res) => {
  const code = req.query.code;
  const userId = req.query.user_id || req.query.state; // fallback to state if needed

  const authOptions = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      code,
      redirect_uri: `${redirect_uri}?user_id=${userId}`,
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
      console.error("❌ Failed to fetch access token", body);
      return res.status(response.statusCode).json({ error: "Access token error" });
    }

    const access_token = body.access_token;
    userTokens[userId] = access_token;
    res.redirect(`/index.html?user_id=${userId}`);
  });
});

// 🎵 Get Top Tracks (and store them)
app.get("/top-tracks", (req, res) => {
  const userId = req.query.user_id;
  const access_token = userTokens[userId];

  if (!access_token) {
    return res.status(400).json({ error: "Access token missing for user." });
  }

  const options = {
    url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
    headers: { Authorization: `Bearer ${access_token}` },
    json: true,
  };

  request.get(options, (error, response, body) => {
    if (error || body.error) {
      return res.status(500).json({ error: "Failed to fetch top tracks" });
    }
    userTracks[userId] = body.items;
    res.json(body.items);
  });
});

// 📊 Get Combined Tracks
app.get("/combined-tracks", (req, res) => {
  const allTracks = {};

  Object.values(userTracks).forEach((tracks) => {
    tracks.forEach((track, index) => {
      const id = track.id;
      if (!allTracks[id]) {
        allTracks[id] = {
          count: 1,
          score: 50 - index, // higher score = higher rank
          track: track,
        };
      } else {
        allTracks[id].count++;
        allTracks[id].score += 50 - index;
      }
    });
  });

  const sorted = Object.values(allTracks)
    .sort((a, b) => b.count - a.count || b.score - a.score)
    .map((entry) => entry.track);

  res.json(sorted);
});

// ✅ Start server
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
