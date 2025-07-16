// server.js
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

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

const groupTopTracks = []; // Shared group list for all users

// ✅ Homepage
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// 🔐 Login
app.get("/login", (req, res) => {
  const scope = "user-top-read";
  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
  });

  const fullURL = `https://accounts.spotify.com/authorize?${auth_query_params}`;
  console.log("🔁 Using redirect URI:", redirect_uri);
  console.log("📡 Final login URL to Spotify:", fullURL);

  res.redirect(fullURL);
});

// 🎯 Callback
app.get("/callback", (req, res) => {
  const code = req.query.code || null;
  if (!code) {
    console.error("❌ No code received in callback.");
    return res.status(400).send("No code received from Spotify.");
  }

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
      console.error("❌ Failed to exchange code for token.", body);
      return res.status(response.statusCode).send("❌ Failed to get access token");
    }

    const access_token = body.access_token;
    console.log("✅ Access token received");

    // Fetch user's top tracks
    const options = {
      url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    request.get(options, (err, resp, data) => {
      if (err || data.error) {
        console.error("❌ Error fetching top tracks:", err || data.error);
        return res.status(500).send("Failed to fetch top tracks");
      }

      const userTracks = data.items.map(track => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map(a => a.name).join(", "),
        url: track.external_urls.spotify,
      }));

      // Add to shared group list
      groupTopTracks.push(...userTracks);
      console.log(`✅ Added ${userTracks.length} tracks to group list`);

      res.redirect("/?added=true");
    });
  });
});

// 🎵 Aggregate endpoint
app.get("/aggregate", (req, res) => {
  const countMap = {};
  for (const track of groupTopTracks) {
    const key = track.id;
    if (!countMap[key]) {
      countMap[key] = { ...track, count: 0 };
    }
    countMap[key].count += 1;
  }

  const sorted = Object.values(countMap).sort((a, b) => b.count - a.count);
  res.json(sorted);
});

// ✅ Start server
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
