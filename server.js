// server.js
import express from "express";
import dotenv from "dotenv";
import request from "request";
import querystring from "querystring";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.static("public"));

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

const users = [];

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

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

app.get("/callback", (req, res) => {
  const code = req.query.code || null;
  if (!code) return res.status(400).send("No code received");

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

  request.post(authOptions, (err, response, body) => {
    if (err || response.statusCode !== 200) return res.status(500).send("Token error");

    const access_token = body.access_token;

    const profileOptions = {
      url: "https://api.spotify.com/v1/me",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    const topTracksOptions = {
      url: "https://api.spotify.com/v1/me/top/tracks?limit=50",
      headers: { Authorization: `Bearer ${access_token}` },
      json: true,
    };

    request.get(profileOptions, (err1, res1, profile) => {
      if (err1 || !profile.display_name) return res.status(500).send("Profile error");

      request.get(topTracksOptions, (err2, res2, data) => {
        if (err2 || !data.items) return res.status(500).send("Top tracks error");

        const userTracks = data.items.map(track => ({
          name: track.name,
          artists: track.artists.map(a => a.name).join(", "),
          url: track.external_urls.spotify,
        }));

        const userData = {
          name: profile.display_name,
          loginTime: new Date().toLocaleString(),
          topTracks: userTracks,
        };

        users.push(userData);
        res.redirect("/?added=true");
      });
    });
  });
});

app.get("/users", (req, res) => {
  res.json(users);
});

app.listen(process.env.PORT || 8888, () => {
  console.log("🚀 Server running");
});
