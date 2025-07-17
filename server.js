// server.js
import express from "express";
import dotenv from "dotenv";
import request from "request";
import querystring from "querystring";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.static("public"));

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

// In-memory user and track data
const users = new Map(); // userId -> { name, loginTime, tracks }

// Homepage
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// Login
app.get("/login", (req, res) => {
  const userId = uuidv4();
  const scope = "user-top-read user-read-private";
  const queryParams = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
    state: userId,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
});

// Callback
app.get("/callback", (req, res) => {
  const code = req.query.code || null;
  const userId = req.query.state;

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
      return res.status(400).send("Failed to get access token");
    }

    const access_token = body.access_token;

    const userOptions = {
      url: "https://api.spotify.com/v1/me",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    request.get(userOptions, (err, resp, userData) => {
      if (err || userData.error) {
        return res.status(400).send("Failed to get user profile");
      }

      const topTrackOptions = {
        url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
        headers: { Authorization: `Bearer ${access_token}` },
        json: true,
      };

      request.get(topTrackOptions, (e2, r2, trackData) => {
        if (e2 || trackData.error) {
          return res.status(400).send("Failed to get top tracks");
        }

        users.set(userId, {
          name: userData.display_name || "Unknown",
          loginTime: new Date().toLocaleString(),
          tracks: trackData.items.map(track => ({
            name: track.name,
            artists: track.artists.map(a => a.name).join(", "),
            url: track.external_urls.spotify,
            id: track.id,
          })),
        });

        res.redirect("/?added=true");
      });
    });
  });
});

// Get list of logged-in users
app.get("/users", (req, res) => {
  const result = [...users.entries()].map(([id, user]) => ({
    name: user.name,
    loginTime: user.loginTime,
  }));
  res.json(result);
});

// Get all users and their top tracks
app.get("/users-with-tracks", (req, res) => {
  const result = [...users.entries()].map(([id, user]) => ({
    name: user.name,
    loginTime: user.loginTime,
    tracks: user.tracks,
  }));
  res.json(result);
});

// Aggregate top tracks
app.get("/aggregate", (req, res) => {
  const trackMap = new Map();
  for (const [, user] of users) {
    user.tracks.forEach(track => {
      const key = track.id;
      if (!trackMap.has(key)) {
        trackMap.set(key, { ...track, count: 1 });
      } else {
        trackMap.get(key).count++;
      }
    });
  }

  const aggregated = [...trackMap.values()].sort((a, b) => b.count - a.count);
  res.json(aggregated);
});

// Reset all group data
app.get("/reset", (req, res) => {
  users.clear();
  res.json({ message: "Group list and users reset." });
});

// Start server
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
