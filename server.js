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

const userTrackMap = {}; // Store user top tracks by user ID

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

app.get("/login", (req, res) => {
  const userId = uuidv4();
  const scope = "user-top-read";

  const queryParams = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
    state: userId,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
});

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
      return res.status(response.statusCode).json({ error: "Failed to get access token" });
    }

    const access_token = body.access_token;

    // Get user's top tracks
    const options = {
      url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    request.get(options, (error, response, body) => {
      if (!body || !body.items) {
        return res.send("⚠️ Failed to retrieve top tracks.");
      }

      const trackNames = body.items.map((track) => track.name);
      userTrackMap[userId] = trackNames;

      res.send("✅ Your tracks have been added to the group list. You can now close this tab.");
    });
  });
});

app.get("/aggregate", (req, res) => {
  const allTracks = Object.values(userTrackMap).flat();

  const trackCounts = allTracks.reduce((acc, track) => {
    acc[track] = (acc[track] || 0) + 1;
    return acc;
  }, {});

  const sortedTracks = Object.entries(trackCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([track, count]) => ({ track, count }));

  res.json(sortedTracks);
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
