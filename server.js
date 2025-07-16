// server.js
import express from "express";
import dotenv from "dotenv";
import request from "request";
import querystring from "querystring";
import cors from "cors";

// Load env vars
dotenv.config();

const app = express();
app.use(cors());
app.use(express.static("public"));

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

console.log("\uD83D\uDFE2 Loaded SPOTIFY_CLIENT_ID:", client_id);
console.log("\uD83D\uDFE2 Loaded REDIRECT_URI:", redirect_uri);

const groupTracks = []; // All users' tracks
const loggedUsers = []; // Names & times

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// Login
app.get("/login", (req, res) => {
  const scope = "user-top-read";
  const auth_query_params = querystring.stringify({
    response_type: "code",
    client_id,
    scope,
    redirect_uri,
  });

  const loginURL = `https://accounts.spotify.com/authorize?${auth_query_params}`;
  console.log("\uD83D\uDD01 Redirecting to Spotify:", loginURL);

  res.redirect(loginURL);
});

// Callback
app.get("/callback", (req, res) => {
  const code = req.query.code || null;
  if (!code) return res.status(400).send("Missing code");

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
      console.error("❌ Token error:", error || body);
      return res.redirect("/?added=false");
    }

    const access_token = body.access_token;

    const profileOptions = {
      url: "https://api.spotify.com/v1/me",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    request.get(profileOptions, (err, resp, profile) => {
      if (err || resp.statusCode !== 200) {
        console.error("❌ Profile error:", err || profile);
        return res.redirect("/?added=false");
      }

      const displayName = profile.display_name || profile.id || "Anonymous";
      const loginTime = new Date().toLocaleString();

      const trackOptions = {
        url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
        headers: { Authorization: `Bearer ${access_token}` },
        json: true,
      };

      request.get(trackOptions, (err, resp, trackBody) => {
        if (err || resp.statusCode !== 200 || !trackBody.items) {
          console.error("❌ Track fetch error:", err || trackBody);
          return res.redirect("/?added=false");
        }

        const userTracks = trackBody.items.map((track) => ({
          id: track.id,
          name: track.name,
          artists: track.artists.map((a) => a.name).join(", "),
          url: track.external_urls.spotify,
        }));

        groupTracks.push(...userTracks);

        loggedUsers.push({ name: displayName, time: loginTime });

        return res.redirect("/?added=true");
      });
    });
  });
});

// Aggregate
app.get("/aggregate", (req, res) => {
  const countMap = {};

  groupTracks.forEach((track) => {
    const key = track.id;
    if (!countMap[key]) {
      countMap[key] = { ...track, count: 1 };
    } else {
      countMap[key].count++;
    }
  });

  const sorted = Object.values(countMap).sort((a, b) => b.count - a.count);
  res.json(sorted);
});

// Users list
app.get("/users", (req, res) => {
  res.json(
    loggedUsers.map((u, index) => `#${index + 1}: ${u.name} (Logged in at ${u.time})`)
  );
});

// Reset list
app.get("/reset", (req, res) => {
  groupTracks.length = 0;
  loggedUsers.length = 0;
  res.json({ success: true, message: "Group list reset." });
});

const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
