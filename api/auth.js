module.exports = (req, res) => {
  const clientId = process.env.OAUTH_CLIENT_ID;

  if (!clientId) {
    res.statusCode = 500;
    res.end("Variável de ambiente OAUTH_CLIENT_ID não configurada na Vercel.");
    return;
  }

  const host = req.headers.host;
  const redirectUri = `https://${host}/api/callback`;
  const authorizeUrl =
    `https://github.com/login/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("repo,user")}`;

  res.writeHead(302, { Location: authorizeUrl });
  res.end();
};
