const https = require("https");

module.exports = (req, res) => {
  const host = req.headers.host;
  const fullUrl = new URL(req.url, `https://${host}`);
  const code = fullUrl.searchParams.get("code");

  if (!code) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(renderBody("error", { error: "missing_code" }));
    return;
  }

  const postData = JSON.stringify({
    client_id: process.env.OAUTH_CLIENT_ID,
    client_secret: process.env.OAUTH_CLIENT_SECRET,
    code,
  });

  const options = {
    hostname: "github.com",
    path: "/login/oauth/access_token",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postData),
      Accept: "application/json",
    },
  };

  const ghReq = https.request(options, (ghRes) => {
    let data = "";
    ghRes.on("data", (chunk) => (data += chunk));
    ghRes.on("end", () => {
      let token, error;
      try {
        const parsed = JSON.parse(data);
        token = parsed.access_token;
        error = parsed.error_description || parsed.error;
      } catch (e) {
        error = "invalid_response";
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html");
      if (token) {
        res.end(renderBody("success", { token, provider: "github" }));
      } else {
        res.end(renderBody("error", { error: error || "unknown_error" }));
      }
    });
  });

  ghReq.on("error", (e) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(renderBody("error", { error: e.message }));
  });

  ghReq.write(postData);
  ghReq.end();
};

function renderBody(status, content) {
  return `
    <script>
      const receiveMessage = (message) => {
        window.opener.postMessage(
          'authorization:github:${status}:${JSON.stringify(content)}',
          message.origin
        );
        window.removeEventListener("message", receiveMessage, false);
      }
      window.addEventListener("message", receiveMessage, false);
      window.opener.postMessage("authorizing:github", "*");
    </script>
  `;
}
