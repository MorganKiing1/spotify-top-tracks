import express from "express";
import dotenv from "dotenv";
import request from "request";
import querystring from "querystring";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

// Setup __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// In-memory user store
const userSessions = {};

// Environment variables
const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

// ✅ Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🔐 Login route
app.get("/login", (req, res) => {
  const state = uuidv4(); // generate user session ID
  const scope = "user-top-read";

  userSessions[state] = { status: "pending" };

  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
    state,
  });

  res.redirect("https://accounts.spotify.com/authorize?" + auth_query_params);
});

// 🎯 Callback route
app.get("/callback", (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state;

  const authOptions = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      code,
      redirect_uri,
      grant_type: "authorization_code",
    },
    headers: {
      Authorization:
        "Basic " + Buffer.from(client_id + ":" + client_secret).toString("base64"),
    },
    json: true,
  };

  request.post(authOptions, (error, response, body) => {
    if (error || response.statusCode !== 200) {
      console.error("❌ Token error:", error || body);
      return res.redirect("/?error=token");
    }

    const access_token = body.access_token;

    // Store token against user session
    if (state && userSessions[state]) {
      userSessions[state].access_token = access_token;
      userSessions[state].status = "authenticated";
    }

    res.redirect("/#access_token=" + access_token);
  });
});

// 🎵 Fetch user's top tracks
app.get("/top-tracks", (req, res) => {
  const access_token = req.query.access_token;
  if (!access_token) return res.status(400).json({ error: "Missing access_token" });

  const options = {
    url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
    headers: { Authorization: "Bearer " + access_token },
    json: true,
  };

  request.get(options, (error, response, body) => {
    if (error) return res.status(500).json({ error: "Failed to fetch top tracks" });
    if (body.error) return res.status(body.error.status).json(body.error);

    res.json(body);
  });
});

// 🔢 Combine top tracks from all users
app.get("/combined-top-tracks", async (req, res) => {
  const allAccessTokens = Object.values(userSessions)
    .filter((session) => session.status === "authenticated")
    .map((session) => session.access_token);

  if (allAccessTokens.length === 0)
    return res.status(400).json({ error: "No logged-in users found." });

  const allTracks = [];

  let completed = 0;
  for (const token of allAccessTokens) {
    const options = {
      url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
      headers: { Authorization: "Bearer " + token },
      json: true,
    };

    await new Promise((resolve) => {
      request.get(options, (error, response, body) => {
        completed++;
        if (!error && body.items) {
          allTracks.push(...body.items);
        }
        resolve();
      });
    });
  }

  // Aggregate by track ID and count occurrences
  const trackMap = {};
  allTracks.forEach((track) => {
    if (!trackMap[track.id]) {
      trackMap[track.id] = { ...track, count: 1 };
    } else {
      trackMap[track.id].count += 1;
    }
  });

  const combinedSorted = Object.values(trackMap).sort((a, b) => b.count - a.count);
  res.json(combinedSorted);
});

// 🚀 Start server
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
