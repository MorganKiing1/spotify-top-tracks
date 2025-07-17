import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import querystring from "querystring";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

const userStore = new Map(); // userId -> { displayName, loginTime }
const songCounts = new Map(); // trackId -> { name, artists, url, count }
const userTracks = new Map(); // userId -> [ { name, artists, url } ]

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

app.get("/login", (req, res) => {
  const state = uuidv4();
  const scope = "user-top-read user-read-private";
  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
    state,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${auth_query_params}`);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code || null;

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${client_id}:${client_secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: querystring.stringify({
      code,
      redirect_uri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    console.error("❌ Failed to get access token");
    return res.status(400).send("Failed to get access token");
  }

  const { access_token } = await tokenResponse.json();

  const profileResp = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!profileResp.ok) {
    console.error("❌ Failed to fetch user profile");
    return res.status(400).send("Failed to fetch profile");
  }

  const profile = await profileResp.json();
  const userId = profile.id || uuidv4();
  const displayName = profile.display_name || "Anonymous";
  const loginTime = new Date().toLocaleString();
  userStore.set(userId, { displayName, loginTime });

  const topTracksResp = await fetch(
    "https://api.spotify.com/v1/me/top/tracks?limit=50",
    {
      headers: { Authorization: `Bearer ${access_token}` },
    }
  );

  if (!topTracksResp.ok) {
    console.error("❌ Failed to fetch top tracks");
    return res.status(400).send("Failed to fetch top tracks");
  }

  const { items } = await topTracksResp.json();
  const userTop = [];

  for (const track of items) {
    const key = track.id;
    if (!songCounts.has(key)) {
      songCounts.set(key, {
        name: track.name,
        artists: track.artists.map((a) => a.name).join(", "),
        url: track.external_urls.spotify,
        count: 0,
      });
    }
    songCounts.get(key).count++;

    userTop.push({
      name: track.name,
      artists: track.artists.map((a) => a.name).join(", "),
      url: track.external_urls.spotify,
    });
  }

  userTracks.set(userId, userTop);
  res.redirect("/?added=true");
});

app.get("/aggregate", (req, res) => {
  const aggregated = Array.from(songCounts.values()).sort(
    (a, b) => b.count - a.count
  );
  res.json(aggregated);
});

app.get("/user-tracks", (req, res) => {
  const result = Array.from(userTracks.entries()).map(([userId, tracks]) => {
    const user = userStore.get(userId);
    return { user: user?.displayName || "Unknown", tracks };
  });
  res.json(result);
});

app.get("/users", (req, res) => {
  const users = Array.from(userStore.values()).map(
    (u, i) => `#${i + 1}: ${u.displayName} (Logged in at ${u.loginTime})`
  );
  res.json(users);
});

app.post("/reset", (req, res) => {
  userStore.clear();
  songCounts.clear();
  userTracks.clear();
  res.send("✅ Group list and user log have been reset.");
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
