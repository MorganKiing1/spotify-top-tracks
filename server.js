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

// Environment variables
const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

// Root route to show the app is alive
app.get("/", (req, res) => {
  res.send("✅ Spotify Top Tracks backend is running.");
});

// Login route: sends user to Spotify login
app.get("/login", (req, res) => {
  const scope = "user-top-read";
  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
  });

  // Log for debugging
  console.log("➡️ Login route hit");
  console.log("Redirect URI used for Spotify authorization:", redirect_uri);
  console.log(`Full Spotify Auth URL: https://accounts.spotify.com/authorize?${auth_query_params}`);

  res.redirect(`https://accounts.spotify.com/authorize?${auth_query_params}`);
});

// Callback route: Spotify redirects here after login
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
        "Basic " + Buffer.from(client_id + ":" + client_secret).toString("base64"),
    },
    json: true,
  };

  request.post(authOptions, (error, response, body) => {
    if (error || response.statusCode !== 200) {
      console.error("❌ Error fetching access token", error || body);
      return res.status(response.statusCode).json({ error: "Failed to get access token" });
    }

    const access_token = body.access_token;
    console.log("✅ Access token received");
    res.redirect("/#access_token=" + access_token);
  });
});

// Top Tracks route: fetches user's top tracks using the access token
app.get("/top-tracks", (req, res) => {
  const access_token = req.query.access_token;
  const options = {
    url: "https://api.spotify.com/v1/me/top/tracks?limit=100",
    headers: { Authorization: "Bearer " + access_token },
    json: true,
  };

  request.get(options, (error, response, body) => {
    if (error) {
      console.error("❌ Error fetching top tracks", error);
      return res.status(500).json({ error: "Failed to fetch top tracks" });
    }
    res.json(body);
  });
});

// Start the server on Replit's port or default to 8888
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
