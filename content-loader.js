/**
 * content-loader.js
 * Busca as entradas publicadas via CMS (arquivos .json em /vestigios ou /arquivo
 * no repositório GitHub) e renderiza tanto a listagem quanto o artigo individual.
 * Não exige build: os arquivos são lidos diretamente do GitHub em tempo real.
 */

const CONTENT_REPO = "giapantameraki-ai/meraki-site";
const CONTENT_BRANCH = "main";

const MESES_PT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

// Converte "9 de agosto de 2026" em Date. Retorna null se não reconhecer o formato
// (nesse caso a entrada é tratada como já publicada, pra nunca esconder conteúdo por engano).
function parseDataPt(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).toLowerCase().match(/(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/);
  if (!m) return null;
  const dia = parseInt(m[1], 10);
  const mesIdx = MESES_PT.indexOf(m[2]);
  const ano = parseInt(m[3], 10);
  if (mesIdx === -1) return null;
  return new Date(ano, mesIdx, dia, 9, 5, 0); // 09h05 = mesmo horário do post no Instagram
}

// Uma entrada está publicada quando a data dela já chegou (ou não tem data reconhecível).
function jaPublicado(dateStr) {
  const d = parseDataPt(dateStr);
  if (!d) return true;
  return d.getTime() <= Date.now();
}

async function listContentFiles(folder) {
  const url = `https://api.github.com/repos/${CONTENT_REPO}/contents/${folder}?ref=${CONTENT_BRANCH}`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) return [];
  const files = await res.json();
  if (!Array.isArray(files)) return [];
  return files.filter((f) => f.name.endsWith(".json"));
}

async function fetchEntry(downloadUrl) {
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error("Não foi possível carregar o conteúdo.");
  return res.json();
}

function slugFromFilename(name) {
  return name.replace(/\.json$/, "");
}

function formatDateSort(dateStr) {
  // aceita "D de MMMM de YYYY" (pt-BR) já formatado pelo CMS — usamos como string comparável
  // fallback: tenta Date.parse
  const t = Date.parse(dateStr);
  return isNaN(t) ? 0 : t;
}

// Renderização simples de markdown -> HTML (subset: negrito, itálico, parágrafos, citação)
function renderMarkdown(md) {
  if (!md) return "";
  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = md.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return paragraphs
    .map((block) => {
      let html = escapeHtml(block);
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
      if (block.startsWith(">")) {
        return `<blockquote>${html.replace(/^&gt;\s?/, "")}</blockquote>`;
      }
      return `<p>${html}</p>`;
    })
    .join("\n");
}

/**
 * Renderiza a listagem (usado em vestigios.html e arquivo.html)
 * @param {string} folder - "vestigios" ou "arquivo"
 * @param {string} containerSelector - seletor do elemento onde inserir os cards
 * @param {string} basePath - "vestigios" ou "arquivo" (usado no link do artigo)
 */
async function renderListing(folder, containerSelector, basePath) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  try {
    const files = await listContentFiles(folder);
    if (files.length === 0) {
      container.innerHTML = `<p class="vestigio-vazio">Nenhum texto publicado ainda. Em breve, novos registros aparecem aqui.</p>`;
      return;
    }

    const entries = await Promise.all(
      files.map(async (f) => {
        const data = await fetchEntry(f.download_url);
        return { ...data, slug: slugFromFilename(f.name) };
      })
    );

    const publicados = entries.filter((e) => jaPublicado(e.date));

    if (publicados.length === 0) {
      container.innerHTML = `<p class="vestigio-vazio">Nenhum texto publicado ainda. Em breve, novos registros aparecem aqui.</p>`;
      return;
    }

    publicados.sort((a, b) => formatDateSort(b.date) - formatDateSort(a.date));

    container.innerHTML = publicados
      .map(
        (e) => `
        <a href="${basePath}/artigo.html?slug=${encodeURIComponent(e.slug)}" class="vestigio-item${e.imagem ? " tem-imagem" : ""}">
          ${e.imagem ? `<img src="${e.imagem}" alt="${e.title || ""}" class="vestigio-thumb" loading="lazy">` : ""}
          <div class="vestigio-item-texto">
            <div class="vestigio-meta">
              <span class="vestigio-categoria gold">${e.categoria || ""}</span>
              <span class="vestigio-data">${e.date || ""}</span>
            </div>
            <h2>${e.title || "Sem título"}</h2>
            <p class="vestigio-resumo">${e.resumo || ""}</p>
          </div>
        </a>`
      )
      .join("\n");
  } catch (err) {
    container.innerHTML = `<p class="vestigio-vazio">Não foi possível carregar os textos agora. Tente novamente em instantes.</p>`;
    console.error(err);
  }
}

/**
 * Renderiza um artigo individual (usado em vestigios/artigo.html e arquivo/artigo.html)
 * @param {string} folder - "vestigios" ou "arquivo"
 */
async function renderArticle(folder) {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  const root = document.querySelector("[data-artigo-root]");
  if (!root) return;

  if (!slug) {
    root.innerHTML = `<p class="vestigio-vazio">Texto não encontrado.</p>`;
    return;
  }

  try {
    const url = `https://raw.githubusercontent.com/${CONTENT_REPO}/${CONTENT_BRANCH}/${folder}/${slug}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("not found");
    const data = await res.json();

    if (!jaPublicado(data.date)) {
      root.innerHTML = `<p class="vestigio-vazio">Este texto ainda não foi publicado. Volte em ${data.date}.</p>`;
      return;
    }

    document.title = `${data.title} — Gia Pànta Meráki`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", data.resumo || "");

    root.querySelector("[data-categoria]").textContent = data.categoria || "";
    root.querySelector("[data-data]").textContent = data.date || "";
    root.querySelector("[data-titulo]").textContent = data.title || "";
    root.querySelector("[data-corpo]").innerHTML = renderMarkdown(data.corpo || "");

    const imgEl = root.querySelector("[data-imagem]");
    if (imgEl) {
      if (data.imagem) {
        imgEl.src = data.imagem;
        imgEl.alt = data.title || "";
        imgEl.style.display = "";
      } else {
        imgEl.style.display = "none";
      }
    }
  } catch (err) {
    root.innerHTML = `<p class="vestigio-vazio">Não foi possível carregar este texto.</p>`;
    console.error(err);
  }
}
