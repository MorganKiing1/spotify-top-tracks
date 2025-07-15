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

// Diagnostics: log what's loaded
console.log("🟢 Loaded SPOTIFY_CLIENT_ID:", client_id);
console.log("🟢 Loaded REDIRECT_URI:", redirect_uri);

// ✅ Homepage
app.get("/", (req, res) => {
  res.send("🎵 Spotify Party App backend is running.");
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
      console.error("❌ Failed to exchange code for token.");
      console.error("Status:", response.statusCode);
      console.error("Error:", error);
      console.error("Response Body:", body);
      return res.status(response.statusCode).send("❌ Failed to get access token");
    }

    const access_token = body.access_token;
    console.log("✅ Access token received");
    res.redirect("/#access_token=" + access_token);
  });
});

// 🎵 Top tracks route (optional)
app.get("/top-tracks", (req, res) => {
  const access_token = req.query.access_token;
  if (!access_token) {
    return res.status(400).json({ error: "Missing access_token" });
  }

  const options = {
    url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
    headers: { Authorization: `Bearer ${access_token}` },
    json: true,
  };

  request.get(options, (error, response, body) => {
    if (error) {
      console.error("❌ Error fetching top tracks:", error);
      return res.status(500).json({ error: "Failed to fetch top tracks" });
    }

    res.json(body);
  });
});

// Start server
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
