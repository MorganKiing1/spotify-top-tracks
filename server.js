// server.js
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
app.use(express.json());

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

console.log("\uD83D\uDFE2 Loaded SPOTIFY_CLIENT_ID:", client_id);
console.log("\uD83D\uDFE2 Loaded REDIRECT_URI:", redirect_uri);

// In-memory group storage
let groupTracks = {};
let userList = [];

app.get("/", (req, res) => {
  res.send("\uD83C\uDFB5 Spotify Party App backend is running.");
});

// Step 1: Login
app.get("/login", (req, res) => {
  const userId = uuidv4();
  const scope = "user-top-read";
  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
    state: userId,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${auth_query_params}`);
});

// Step 2: Callback
app.get("/callback", (req, res) => {
  const code = req.query.code;
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
      console.error("\u274C Failed to get access token:", body);
      return res.status(500).send("Error fetching access token");
    }

    const access_token = body.access_token;
    const options = {
      url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    request.get(options, (err, resp, data) => {
      if (err || data.error) {
        console.error("\u274C Failed to get top tracks:", err || data.error);
        return res.status(500).send("Error fetching top tracks");
      }

      if (!userList.includes(userId)) userList.push(userId);

      data.items.forEach((track) => {
        const id = track.id;
        if (!groupTracks[id]) {
          groupTracks[id] = {
            id,
            name: track.name,
            artists: track.artists.map((a) => a.name).join(", "),
            url: track.external_urls.spotify,
            count: 1,
          };
        } else {
          groupTracks[id].count += 1;
        }
      });

      res.redirect("/?added=true");
    });
  });
});

// Get aggregated top tracks
app.get("/aggregate", (req, res) => {
  const allTracks = Object.values(groupTracks);
  allTracks.sort((a, b) => b.count - a.count);
  res.json(allTracks);
});

// Get logged-in users
app.get("/users", (req, res) => {
  res.json(userList);
});

// Reset group data
app.post("/reset", (req, res) => {
  groupTracks = {};
  userList = [];
  res.json({ message: "Group list has been reset." });
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`\uD83D\uDE80 Server running at http://localhost:${PORT}`);
});
