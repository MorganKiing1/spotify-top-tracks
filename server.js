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

// In-memory store of top tracks per user
const usersTopTracks = {};

app.get("/", (req, res) => {
  res.send("✅ Spotify Top Tracks backend is running.");
});

app.get("/login", (req, res) => {
  const user_id = uuidv4();
  const scope = "user-top-read";
  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
    state: user_id, // Pass user ID via state
  });

  res.redirect(`https://accounts.spotify.com/authorize?${auth_query_params}`);
});

app.get("/callback", (req, res) => {
  const code = req.query.code || null;
  const user_id = req.query.state || null; // Grab user ID from state

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
      return res.status(response.statusCode).json({ error: "Failed to get access token" });
    }

    const access_token = body.access_token;
    res.redirect(`/index.html?access_token=${access_token}&user_id=${user_id}`);
  });
});

app.get("/top-tracks", (req, res) => {
  const access_token = req.query.access_token;
  const user_id = req.query.user_id;

  if (!access_token || !user_id) {
    return res.status(400).json({ error: "Missing access_token or user_id" });
  }

  const options = {
    url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
    headers: { Authorization: `Bearer ${access_token}` },
    json: true,
  };

  request.get(options, (error, response, body) => {
    if (error) return res.status(500).json({ error: "Failed to fetch top tracks" });
    if (body.error) return res.status(body.error.status || 400).json(body.error);

    usersTopTracks[user_id] = body.items;
    res.json(body.items);
  });
});

app.get("/combined-tracks", (req, res) => {
  const allTracks = Object.values(usersTopTracks).flat();
  const trackMap = new Map();

  allTracks.forEach((track) => {
    if (trackMap.has(track.id)) {
      trackMap.get(track.id).count += 1;
    } else {
      trackMap.set(track.id, { ...track, count: 1 });
    }
  });

  const combined = Array.from(trackMap.values())
    .sort((a, b) => b.count - a.count)
    .map(({ count, ...track }) => ({ ...track, appearances: count }));

  res.json(combined);
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
