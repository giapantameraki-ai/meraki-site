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
<body style="font-family: sans-serif; padding: 40px; text-align: center;">
  <p id="status">Concluindo autenticação…</p>
  <p id="detail" style="color: #999; font-size: 13px;"></p>
  <script>
    (function() {
      var statusEl = document.getElementById("status");
      var detailEl = document.getElementById("detail");

      function showError(msg) {
        statusEl.textContent = "Não foi possível concluir o login automaticamente.";
        detailEl.textContent = msg + " — feche esta janela e tente de novo.";
      }

      if (!window.opener) {
        showError("Esta janela perdeu a referência da janela principal (window.opener ausente).");
        return;
      }

      function receiveMessage(e) {
        window.opener.postMessage(
          'authorization:github:${status}:${JSON.stringify(message)}',
          e.origin
        );
        window.removeEventListener("message", receiveMessage, false);
        statusEl.textContent = "Login concluído. Pode fechar esta janela.";
        setTimeout(function() { window.close(); }, 800);
      }

      window.addEventListener("message", receiveMessage, false);
      window.opener.postMessage("authorizing:github", "*");

      // Se em 4 segundos a janela principal não responder, avisa o motivo mais provável.
      setTimeout(function() {
        if (statusEl.textContent === "Concluindo autenticação…") {
          showError("A janela principal não respondeu a tempo.");
        }
      }, 4000);
    })();
  </script>
</body>
</html>`;
}

