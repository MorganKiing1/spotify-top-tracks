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

// Spotify API credentials
const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

let groupTracks = []; // Stores tracks from all users

// ✅ Root page (index.html)
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "./public" });
});

// 🔐 Spotify Login
app.get("/login", (req, res) => {
  const scope = "user-top-read";
  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${auth_query_params}`);
});

// 🎯 Spotify Redirect Callback
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
      console.error("❌ Failed to get access token");
      console.error("Error:", error);
      console.error("Status Code:", response?.statusCode);
      console.error("Body:", body);
      return res.status(500).send("❌ Failed to get access token");
    }

    const access_token = body.access_token;

    // After receiving token, fetch top tracks
    const options = {
      url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    request.get(options, (err, response, body) => {
      if (err || body.error) {
        console.error("❌ Failed to fetch top tracks");
        return res.status(500).send("❌ Failed to fetch top tracks");
      }

      // Add new user's top tracks to groupTracks
      if (body.items) {
        groupTracks.push(...body.items.map((track) => ({
          id: track.id,
          name: track.name,
          artists: track.artists.map((a) => a.name).join(", "),
          url: track.external_urls.spotify,
        })));
        console.log(`✅ Added ${body.items.length} tracks to group list`);
      }

      // Redirect to home with confirmation
      res.redirect("/?added=true");
    });
  });
});

// 🎵 Show aggregated popular tracks
app.get("/aggregate", (req, res) => {
  // Count how many times each track appears
  const trackMap = {};
  for (let track of groupTracks) {
    if (trackMap[track.id]) {
      trackMap[track.id].count += 1;
    } else {
      trackMap[track.id] = { ...track, count: 1 };
    }
  }

  // Convert to array and sort by count
  const popular = Object.values(trackMap).sort((a, b) => b.count - a.count);
  res.json(popular);
});

// ✅ Start the server
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
