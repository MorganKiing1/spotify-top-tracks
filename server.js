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

const userStore = new Map();
const songCounts = new Map();

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
      console.error("❌ Failed to get access token", error || body);
      return res.status(400).send("Failed to get access token");
    }

    const access_token = body.access_token;

    const profileOptions = {
      url: "https://api.spotify.com/v1/me",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    request.get(profileOptions, (err, resp, profile) => {
      if (err || resp.statusCode !== 200) {
        console.error("❌ Failed to fetch user profile", err || profile);
        return res.status(400).send("Failed to fetch profile");
      }

      const userId = profile.id || uuidv4();
      const displayName = profile.display_name || "Anonymous";
      const loginTime = new Date().toLocaleString();
      userStore.set(userId, { displayName, loginTime });

      const topTracksOptions = {
        url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
        headers: { Authorization: `Bearer ${access_token}` },
        json: true,
      };

      request.get(topTracksOptions, (e, r, data) => {
        if (e || r.statusCode !== 200) {
          console.error("❌ Failed to fetch top tracks", e || data);
          return res.status(400).send("Failed to fetch top tracks");
        }

        for (const track of data.items) {
          const key = `${track.name}:::${track.artists.map(a => a.name).join(", ")}`;
          if (!songCounts.has(key)) {
            songCounts.set(key, { count: 0, url: track.external_urls.spotify });
          }
          songCounts.get(key).count++;
        }

        res.redirect("/?added=true");
      });
    });
  });
});

app.get("/aggregate", (req, res) => {
  const aggregated = Array.from(songCounts.entries())
    .map(([key, val]) => {
      const [name, artists] = key.split(":::");
      return { name, artists, url: val.url, count: val.count };
    })
    .sort((a, b) => b.count - a.count);

  res.json(aggregated);
});

app.get("/users", (req, res) => {
  const users = Array.from(userStore.values()).map((u, i) => {
    return `#${i + 1}: ${u.displayName} (Logged in at ${u.loginTime})`;
  });
  res.json(users);
});

app.get("/reset", (req, res) => {
  userStore.clear();
  songCounts.clear();
  res.send("✅ Group list and user log have been reset.");
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
