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

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

// In-memory storage
let allTracks = {}; // { trackId: { name, artists, url, count } }
let users = [];     // [{ id, name, loginTime }]

// Root page
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// Login
app.get("/login", (req, res) => {
  const scope = "user-top-read user-read-private";
  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${auth_query_params}`);
});

// Callback from Spotify
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
      return res.status(400).send("Failed to get access token");
    }

    const access_token = body.access_token;

    // Get user profile name
    request.get(
      {
        url: "https://api.spotify.com/v1/me",
        headers: { Authorization: `Bearer ${access_token}` },
        json: true,
      },
      (err, resp, userBody) => {
        const userName = userBody.display_name || "Unknown User";
        const userId = uuidv4();
        const loginTime = new Date().toLocaleString();

        users.push({ id: userId, name: userName, loginTime });

        // Now fetch their top tracks
        request.get(
          {
            url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
            headers: { Authorization: `Bearer ${access_token}` },
            json: true,
          },
          (err2, resp2, tracksBody) => {
            if (Array.isArray(tracksBody.items)) {
              tracksBody.items.forEach((track) => {
                const id = track.id;
                if (!allTracks[id]) {
                  allTracks[id] = {
                    name: track.name,
                    artists: track.artists.map((a) => a.name).join(", "),
                    url: track.external_urls.spotify,
                    count: 0,
                  };
                }
                allTracks[id].count++;
              });
            }

            res.redirect("/?added=true");
          }
        );
      }
    );
  });
});

// Aggregate popular tracks
app.get("/aggregate", (req, res) => {
  const sorted = Object.values(allTracks).sort((a, b) => b.count - a.count);
  res.json(sorted);
});

// Logged-in user info
app.get("/users", (req, res) => {
  res.json(users);
});

// Reset everything
app.get("/reset", (req, res) => {
  allTracks = {};
  users = [];
  res.send("✅ Group list and user log have been reset.");
});

// Port
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
