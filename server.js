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

// Spotify credentials from .env
const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

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

    // Redirect back to frontend with access_token in hash
    res.redirect("/#access_token=" + access_token);
  });
});

// 🎵 Top Tracks route
app.get("/top-tracks", (req, res) => {
  const access_token = req.query.access_token;
  if (!access_token) {
    return res.status(400).json({ error: "Missing access_token" });
  }

  const options = {
    url: "https://api.spotify.com/v1/me/top/tracks?limit=50", // ✅ Spotify's max allowed
    headers: { Authorization: `Bearer ${access_token}` },
    json: true,
  };

  request.get(options, (error, response, body) => {
    if (error) {
      console.error("❌ Error fetching top tracks:", error);
      return res.status(500).json({ error: "Failed to fetch top tracks" });
    }

    if (body.error) {
      console.error("⚠️ Spotify API error:", body.error);
      return res.status(body.error.status || 400).json(body.error);
    }

    res.json(body);
  });
});

// ✅ Start the server
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
