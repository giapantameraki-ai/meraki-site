const https = require("https");

module.exports = (req, res) => {
  const host = req.headers.host;
  const fullUrl = new URL(req.url, `https://${host}`);
  const code = fullUrl.searchParams.get("code");

  if (!code) {
    res.statusCode = 400;
    res.end("Código de autorização ausente.");
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

      const status = token ? "success" : "error";
      const message = token ? { token, provider: "github" } : { error: error || "unknown_error" };

      res.setHeader("Content-Type", "text/html");
      res.end(`<!doctype html>
<html><body>
<script>
  (function() {
    function receiveMessage(e) {
      window.opener.postMessage(
        'authorization:github:${status}:${JSON.stringify(message)}',
        e.origin
      );
      window.removeEventListener("message", receiveMessage, false);
    }
    window.addEventListener("message", receiveMessage, false);
    window.opener.postMessage("authorizing:github", "*");
  })();
</script>
</body></html>`);
    });
  });

  ghReq.on("error", (e) => {
    res.statusCode = 500;
    res.end("Erro na troca do token: " + e.message);
  });

  ghReq.write(postData);
  ghReq.end();
};
