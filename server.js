import express from "express";
import dotenv from "dotenv";
import request from "request";
import querystring from "querystring";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.static("public"));

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

const userTracks = {}; // userId -> top tracks
const userNames = {};  // userId -> display name

console.log("🟢 Loaded SPOTIFY_CLIENT_ID:", client_id);
console.log("🟢 Loaded REDIRECT_URI:", redirect_uri);

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

app.get("/callback", (req, res) => {
  const code = req.query.code || null;
  if (!code) return res.status(400).send("No code received from Spotify.");

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
      console.error("❌ Failed to exchange code for token", body);
      return res.status(response.statusCode).send("Failed to get access token");
    }

    const access_token = body.access_token;

    // Get user profile for display name
    const profileOptions = {
      url: "https://api.spotify.com/v1/me",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    request.get(profileOptions, (err, resp, userProfile) => {
      const userId = userProfile.id || uuidv4();
      const displayName = userProfile.display_name || "Anonymous";
      userNames[userId] = displayName;

      const topOptions = {
        url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
        headers: { Authorization: `Bearer ${access_token}` },
        json: true,
      };

      request.get(topOptions, (err2, resp2, topData) => {
        if (topData.items) {
          userTracks[userId] = topData.items.map((track) => ({
            id: track.id,
            name: track.name,
            artists: track.artists.map((a) => a.name).join(", "),
            url: track.external_urls.spotify,
          }));
        }
        res.redirect("/?added=true");
      });
    });
  });
});

app.get("/aggregate", (req, res) => {
  const combined = {};
  Object.values(userTracks).forEach((tracks) => {
    tracks.forEach((track) => {
      if (!combined[track.id]) {
        combined[track.id] = { ...track, count: 1 };
      } else {
        combined[track.id].count++;
      }
    });
  });

  const sorted = Object.values(combined).sort((a, b) => b.count - a.count);
  res.json(sorted);
});

app.get("/users", (req, res) => {
  const users = Object.values(userNames);
  res.json(users);
});

app.get("/reset", (req, res) => {
  Object.keys(userTracks).forEach((k) => delete userTracks[k]);
  Object.keys(userNames).forEach((k) => delete userNames[k]);
  res.send("✅ Group track list has been reset.");
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
