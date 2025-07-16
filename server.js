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

const userTracks = {}; // Store tracks per user

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

app.get("/login", (req, res) => {
  const scope = "user-top-read";
  const state = uuidv4();
  const queryParams = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
    state,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
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
      console.error("Token error:", error || body);
      return res.status(400).send("❌ Failed to get access token");
    }

    const access_token = body.access_token;

    // Fetch user's top tracks now
    const options = {
      url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    request.get(options, (err, resp, data) => {
      if (err || !data.items) {
        console.error("❌ Failed to fetch top tracks:", err || data);
        return res.redirect("/?added=false");
      }

      const userId = uuidv4();
      userTracks[userId] = data.items.map((track) => ({
        name: track.name,
        artists: track.artists.map((a) => a.name).join(", "),
        url: track.external_urls.spotify,
        id: track.id,
      }));

      console.log(`✅ Stored tracks for user ${userId}`);
      res.redirect("/?added=true");
    });
  });
});

app.get("/aggregate", (req, res) => {
  const allTracks = {};

  Object.values(userTracks).forEach((tracks) => {
    tracks.forEach((track) => {
      if (!allTracks[track.id]) {
        allTracks[track.id] = { ...track, count: 1 };
      } else {
        allTracks[track.id].count++;
      }
    });
  });

  const sorted = Object.values(allTracks)
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  res.json(sorted);
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
