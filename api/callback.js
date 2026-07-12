const https = require("https");

module.exports = (req, res) => {
  // Garante que o navegador não bloqueie a comunicação entre esta janela (pop-up)
  // e a janela principal que a abriu — sem isso, alguns navegadores quebram o
  // window.opener silenciosamente, sem mostrar erro nenhum.
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");

  const host = req.headers.host;
  const fullUrl = new URL(req.url, `https://${host}`);
  const code = fullUrl.searchParams.get("code");

  if (!code) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderStatusPage("Código de autorização ausente. Feche esta janela e tente novamente.", true));
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

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(renderAuthPage(status, message));
    });
  });

  ghReq.on("error", (e) => {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderStatusPage("Erro na troca do token: " + e.message, true));
  });

  ghReq.write(postData);
  ghReq.end();
};

function renderStatusPage(text, isError) {
  return `<!doctype html>
<html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
  <p style="color: ${isError ? "#c00" : "#333"};">${text}</p>
</body></html>`;
}

function renderAuthPage(status, message) {
  return `<!doctype html>
<html>
<body
