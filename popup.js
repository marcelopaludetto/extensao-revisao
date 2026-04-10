const KEY = "aluraRevisorRunState";
const KEY_HISTORY = "aluraRevisorHistory";

// ---------- Ordem das atividades ----------
const ACTIVITY_ORDERS = {
  startlab: [
    { label: "Vídeo 1.1 - O que vamos aprender?", note: "apenas aula 01", optional: true },
    { label: "Preparando o ambiente", note: "caso tenha", optional: true },
    { label: "Projeto Startlab" },
    { label: "Vídeo X.X" },
    { label: "Vídeo X.X" },
    { label: "Faça como eu fiz" },
    { label: "Exercício" },
    { label: "Exercício" },
    { label: "Exercício" },
    { label: "Para saber mais", note: "caso tenha", optional: true },
    { label: "Hora do desafio" },
    { label: "Compartilhe seu projeto", note: "quando houver entrega", optional: true },
    { label: "Glossário", note: "caso tenha", optional: true },
    { label: "O que aprendemos (em vídeo)" },
    { label: "Vídeo X.X - Conclusão", note: "apenas no último vídeo", optional: true },
  ],
  vscode: [
    { label: "Vídeo 1.1 - O que vamos aprender?", note: "apenas aula 01", optional: true },
    { label: "Preparando o ambiente", note: "caso tenha", optional: true },
    { label: "Vídeo X.X" },
    { label: "Vídeo X.X" },
    { label: "Faça como eu fiz" },
    { label: "Exercício" },
    { label: "Exercício" },
    { label: "Exercício" },
    { label: "Para saber mais", note: "caso tenha", optional: true },
    { label: "Hora do desafio" },
    { label: "Compartilhe seu projeto", note: "quando houver entrega", optional: true },
    { label: "Videos para SP", note: "aula 1 de código, aula 2 de código", optional: true },
    { label: "Glossário", note: "caso tenha", optional: true },
    { label: "O que aprendemos (em vídeo)" },
    { label: "Vídeo X.X - Conclusão", note: "apenas no último vídeo", optional: true },
  ],
  figma: [
    { label: "Vídeo 1.1 - O que vamos aprender?", note: "apenas aula 01", optional: true },
    { label: "Preparando o ambiente", note: "caso tenha", optional: true },
    { label: "Vídeo X.X" },
    { label: "Faça como eu fiz" },
    { label: "Exercício" },
    { label: "Exercício" },
    { label: "Exercício" },
    { label: "Para saber mais", note: "caso tenha", optional: true },
    { label: "Hora do desafio" },
    { label: "Compartilhe seu projeto", note: "quando houver entrega", optional: true },
    { label: "Glossário", note: "caso tenha", optional: true },
    { label: "O que aprendemos (em vídeo)" },
    { label: "Vídeo X.X - Conclusão", note: "apenas no último vídeo", optional: true },
  ],
  robotica: [
    { label: "Vídeo 1.1 - O que vamos aprender?", note: "apenas aula 01", optional: true },
    { label: "Preparando o ambiente", note: "caso tenha", optional: true },
    { label: "Preparando o ambiente: Lista de materiais", note: "em todas as aulas com componentes físicos", optional: true },
    { label: "Vídeo X.X" },
    { label: "Faça como eu fiz" },
    { label: "Exercício" },
    { label: "Exercício" },
    { label: "Exercício" },
    { label: "Para saber mais", note: "caso tenha", optional: true },
    { label: "Hora do desafio" },
    { label: "Compartilhe seu projeto", note: "quando houver entrega", optional: true },
    { label: "Glossário", note: "caso tenha", optional: true },
    { label: "O que aprendemos (em vídeo)" },
    { label: "Vídeo X.X - Conclusão", note: "apenas no último vídeo", optional: true },
  ],
  tecnico: [
    { label: "Vídeo 1.1 - O que vamos aprender?", note: "apenas aula 01", optional: true },
    { label: "Preparando o ambiente", note: "caso tenha", optional: true },
    { label: "Vídeo X.X" },
    { label: "Aprofundamento" },
    { label: "Exercício" },
    { label: "Exercício" },
    { label: "Vídeo X.X - Conclusão", note: "apenas no último vídeo", optional: true },
  ],
};

function renderActivityChecklist(platform) {
  const container = document.getElementById("activity-checklist");
  if (!container) return;

  if (!platform || !ACTIVITY_ORDERS[platform]) {
    container.innerHTML = "";
    return;
  }

  const items = ACTIVITY_ORDERS[platform];
  const fragment = document.createDocumentFragment();

  items.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "act-item" + (item.optional ? " optional" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `act-cb-${i}`;

    const lbl = document.createElement("label");
    lbl.htmlFor = `act-cb-${i}`;
    lbl.innerHTML = item.label + (item.note ? ` <span class="act-note">(${item.note})</span>` : "");

    div.appendChild(cb);
    div.appendChild(lbl);
    fragment.appendChild(div);
  });

  const resetBtn = document.createElement("button");
  resetBtn.className = "act-reset-btn";
  resetBtn.textContent = "Limpar";
  resetBtn.addEventListener("click", () => {
    container.querySelectorAll("input[type='checkbox']").forEach((cb) => (cb.checked = false));
  });
  fragment.appendChild(resetBtn);

  container.innerHTML = "";
  container.appendChild(fragment);
}

const platformSelect = document.getElementById("platform-select");
if (platformSelect) {
  platformSelect.addEventListener("change", () => renderActivityChecklist(platformSelect.value));
}

const statusEl = document.getElementById("status");
const btn = document.getElementById("start");
const historyEl = document.getElementById("history");

let isRunning = false;
let currentHistory = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function setRunningUI(running) {
  isRunning = running;
  btn.textContent = running ? "Parar revisão" : "Start revisão";
  btn.style.background = running ? "#e53935" : "#00c86f";
  btn.style.color = "#fff";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Não achei a aba ativa.");
  return tab;
}

function formatDate(ts) {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${h}:${m}`;
}

function renderHistory(history) {
  currentHistory = history || [];
  if (!historyEl) return;
  if (currentHistory.length === 0) {
    historyEl.innerHTML = "";
    return;
  }

  const fragment = document.createDocumentFragment();

  const title = document.createElement("div");
  title.className = "hist-title";
  title.textContent = "Histórico";
  fragment.appendChild(title);

  currentHistory.forEach((entry, i) => {
    const dateStr = formatDate(entry.runAt);
    const isBatch = entry.type === "batchAudit";

    const item = document.createElement("div");
    item.className = "hist-item";

    const idSpan = document.createElement("span");
    idSpan.className = "hist-id";
    if (isBatch) {
      idSpan.textContent = `Auditoria (${entry.totalCourses} curso${entry.totalCourses > 1 ? "s" : ""})`;
    } else {
      idSpan.textContent = entry.courseId || "?";
    }
    item.appendChild(idSpan);

    item.appendChild(document.createTextNode(` · ${dateStr} · `));

    if (entry.ok) {
      const okSpan = document.createElement("span");
      okSpan.className = "hist-ok";
      okSpan.textContent = "Tudo OK";
      item.appendChild(okSpan);
    } else {
      const btn = document.createElement("button");
      btn.className = "hist-report";
      btn.dataset.i = String(i);
      btn.dataset.type = isBatch ? "batchAudit" : "review";
      btn.textContent = "abrir relatório";
      item.appendChild(btn);
    }

    fragment.appendChild(item);
  });

  historyEl.innerHTML = "";
  historyEl.appendChild(fragment);

  historyEl.querySelectorAll(".hist-report").forEach((reportBtn) => {
    reportBtn.addEventListener("click", async () => {
      try {
        const i = Number(reportBtn.dataset.i);
        const entry = currentHistory[i];
        if (!entry) return;
        const tab = await getActiveTab();
        if (reportBtn.dataset.type === "batchAudit") {
          await chrome.tabs.sendMessage(tab.id, {
            type: "ALURA_REVISOR_SHOW_BATCH_REPORT",
            allResults: entry.batchResults || [],
            totalCourses: entry.totalCourses,
            courseIds: entry.courseIds,
            textualResults: entry.textualResults || [],
            checks: entry.checks || {},
          });
        } else {
          await chrome.tabs.sendMessage(tab.id, { type: "ALURA_REVISOR_SHOW_REPORT", state: entry.state });
        }
      } catch (e) {
        setStatus(`Erro ao abrir relatório: ${e.message}`);
      }
    });
  });
}

// ---------- Token GitHub ----------
const githubTokenEl = document.getElementById("github-token");
const githubTokenSaveBtn = document.getElementById("github-token-save-btn");
const githubTokenStatusEl = document.getElementById("github-token-status");

if (githubTokenSaveBtn) {
  githubTokenSaveBtn.addEventListener("click", async () => {
    const token = githubTokenEl.value.trim();
    await chrome.storage.local.set({ aluraRevisorGithubToken: token });
    githubTokenStatusEl.textContent = token ? "✅ Token salvo." : "Token removido.";
    setTimeout(() => { githubTokenStatusEl.textContent = ""; }, 2000);
  });
}

// ---------- Desativar atividades em lote ----------
const deactCourseIdEl  = document.getElementById("deact-course-id");
const deactFetchBtn    = document.getElementById("deact-fetch-btn");
const deactStatusEl    = document.getElementById("deact-status");
const deactListEl      = document.getElementById("deact-list");
const deactActionsEl   = document.getElementById("deact-actions");
const deactConfirmBtn  = document.getElementById("deact-confirm-btn");
const deactSelectAllBtn= document.getElementById("deact-select-all-btn");
const deactCountEl     = document.getElementById("deact-count");

let deactAllTasks = [];

function updateDeactCount() {
  const checked = deactListEl.querySelectorAll("input[type='checkbox']:checked").length;
  deactCountEl.textContent = checked ? `${checked} selecionada(s)` : "";
}

function renderDeactList(sections) {
  deactListEl.innerHTML = "";
  deactAllTasks = [];

  sections.forEach(sec => {
    if (!sec.tasks.length) return;

    const secLabel = document.createElement("div");
    secLabel.className = "deact-section-label";
    secLabel.textContent = sec.title || `Seção ${sec.id}`;
    deactListEl.appendChild(secLabel);

    sec.tasks.forEach(task => {
      deactAllTasks.push({ ...task, sectionTitle: sec.title });

      const item = document.createElement("div");
      item.className = "deact-task-item" + (task.active ? "" : " inactive");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = `deact-cb-${task.id}`;
      cb.dataset.editUrl = task.editUrl;
      cb.disabled = !task.active;
      cb.addEventListener("change", updateDeactCount);

      const lbl = document.createElement("label");
      lbl.htmlFor = cb.id;
      lbl.innerHTML = `${task.title} <span class="deact-type">${task.type}</span>`;

      item.appendChild(cb);
      item.appendChild(lbl);
      deactListEl.appendChild(item);
    });
  });

  deactActionsEl.style.display = deactAllTasks.length ? "flex" : "none";
  updateDeactCount();
}

deactFetchBtn?.addEventListener("click", async () => {
  const courseId = deactCourseIdEl.value.trim();
  if (!courseId) { deactStatusEl.textContent = "Informe o ID do curso."; return; }

  deactFetchBtn.disabled = true;
  deactStatusEl.textContent = "Buscando seções…";
  deactListEl.innerHTML = "";
  deactActionsEl.style.display = "none";

  try {
    const tab = await getActiveTab();
    const secResp = await chrome.tabs.sendMessage(tab.id, {
      type: "ALURA_REVISOR_DEACT_GET_SECTIONS", courseId
    });
    if (!secResp?.ok) throw new Error(secResp?.error || "Erro ao buscar seções");

    const sections = secResp.sections;
    deactStatusEl.textContent = `Buscando atividades de ${sections.length} seção(ões)…`;

    const results = [];
    for (let i = 0; i < sections.length; i += 3) {
      const batch = sections.slice(i, i + 3);
      const batchResults = await Promise.all(batch.map(sec =>
        chrome.tabs.sendMessage(tab.id, {
          type: "ALURA_REVISOR_DEACT_GET_TASKS",
          courseId, sectionId: sec.id, sectionTitle: sec.title
        })
      ));
      results.push(...batchResults);
    }

    const sectionsWithTasks = results
      .filter(r => r?.ok)
      .map(r => ({ id: r.sectionId, title: r.sectionTitle, tasks: r.tasks }));

    const total = sectionsWithTasks.reduce((a, s) => a + s.tasks.length, 0);
    deactStatusEl.textContent = `${total} atividade(s) encontrada(s).`;
    renderDeactList(sectionsWithTasks);
  } catch (e) {
    deactStatusEl.textContent = `Erro: ${e.message}`;
  } finally {
    deactFetchBtn.disabled = false;
  }
});

deactSelectAllBtn?.addEventListener("click", () => {
  const cbs = deactListEl.querySelectorAll("input[type='checkbox']:not(:disabled)");
  const allChecked = [...cbs].every(cb => cb.checked);
  cbs.forEach(cb => cb.checked = !allChecked);
  updateDeactCount();
});

deactConfirmBtn?.addEventListener("click", async () => {
  const selected = [...deactListEl.querySelectorAll("input[type='checkbox']:checked")];
  if (!selected.length) { deactStatusEl.textContent = "Nenhuma atividade selecionada."; return; }

  if (!confirm(`Desativar ${selected.length} atividade(s)?`)) return;

  deactConfirmBtn.disabled = true;
  let done = 0;
  const tab = await getActiveTab();

  for (const cb of selected) {
    deactStatusEl.textContent = `Desativando ${done + 1} de ${selected.length}…`;
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: "ALURA_REVISOR_DEACTIVATE_TASK",
        editUrl: cb.dataset.editUrl,
      });
      if (resp?.ok) {
        cb.disabled = true;
        cb.checked = false;
        cb.closest(".deact-task-item")?.classList.add("inactive");
      }
    } catch { /* continua */ }
    done++;
  }

  deactStatusEl.textContent = `✅ ${done} atividade(s) desativada(s).`;
  deactConfirmBtn.disabled = false;
  updateDeactCount();
});

// ---------- Tab switching ----------
const tabReviewBtn = document.getElementById("tab-review-btn");
const tabToolsBtn = document.getElementById("tab-tools-btn");
const tabPublishBtn = document.getElementById("tab-publish-btn");
const tabReview = document.getElementById("tab-review");
const tabTools = document.getElementById("tab-tools");
const tabPublish = document.getElementById("tab-publish");

function switchTab(active) {
  [tabReviewBtn, tabToolsBtn, tabPublishBtn].forEach(b => b.classList.remove("active"));
  [tabReview, tabTools, tabPublish].forEach(p => p.style.display = "none");
  active.btn.classList.add("active");
  active.panel.style.display = "";
}

tabReviewBtn.addEventListener("click", () => switchTab({ btn: tabReviewBtn, panel: tabReview }));
tabToolsBtn.addEventListener("click", () => switchTab({ btn: tabToolsBtn, panel: tabTools }));
tabPublishBtn.addEventListener("click", () => switchTab({ btn: tabPublishBtn, panel: tabPublish }));

// ---------- Publicação: conversão para Markdown ----------
function textToMarkdown(text) {
  // Normaliza quebras de linha
  const lines = text.split("\n").map(l => l.trimEnd());
  const out = [];
  let blankCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // Linha vazia: acumula até 1 quebra de parágrafo
    if (!line) {
      blankCount++;
      if (blankCount === 1) out.push("");
      continue;
    }
    blankCount = 0;

    // Blockquote markdown: > **texto**
    if (line.startsWith(">")) {
      out.push(line);
      continue;
    }

    // Bloco HTML (links StartLab com imagem)
    if (line.startsWith("<a ") || line.startsWith("<img ")) {
      out.push(line);
      continue;
    }

    // Título/cabeçalho markdown já existente
    if (line.startsWith("#")) {
      out.push(line);
      continue;
    }

    // Lista numerada (já vem do parser com "1. texto") — normaliza espaço extra
    const listMatch = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (listMatch) {
      out.push(`${listMatch[1]}${listMatch[2]}. ${listMatch[3]}`);
      continue;
    }

    // Lista com hífen/bullet
    const bulletMatch = line.match(/^[-•]\s+(.+)/);
    if (bulletMatch) {
      out.push(`- ${bulletMatch[1]}`);
      continue;
    }

    // Linha normal: aplica formatação inline
    let md = line
      .replace(/\*\*(.*?)\*\*/g, "**$1**")   // já estava bold, mantém
      .replace(/__(.*?)__/g, "**$1**");        // __ → **

    out.push(md);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- Publicação: parsing ----------
function parseDesafioDoc(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lessons = [];

  // Divide o documento a cada "Aula N" no início de uma linha
  const parts = text.split(/(?=^\s*Aula\s+\d+\s*$)/m);

  for (const part of parts) {
    const lessonMatch = part.match(/^\s*Aula\s+(\d+)\s*$/m);
    if (!lessonMatch) continue;

    const lessonNum = parseInt(lessonMatch[1]);

    // Nome da aula: primeira linha não-vazia após o número, que não seja "Unidade"
    const afterNum = part.slice(lessonMatch.index + lessonMatch[0].length);
    let lessonName = "";
    for (const line of afterNum.split("\n")) {
      const t = line.trim();
      if (t && !/^Unidade$/i.test(t)) { lessonName = t; break; }
    }

    // Conteúdo: após "Para saber mais...", antes de "Sugestão de solução"
    const paraSaberMatch = part.match(/Para saber mais[^!]*!/i);
    const sugestaoIdx = part.search(/Sugest[aã]o de solu[cç][aã]o/i);

    let content = "";
    if (paraSaberMatch) {
      const titleEnd = part.indexOf("\n", paraSaberMatch.index + paraSaberMatch[0].length);
      const start = titleEnd >= 0 ? titleEnd : paraSaberMatch.index + paraSaberMatch[0].length;
      const end = sugestaoIdx > start ? sugestaoIdx : part.length;
      content = part.slice(start, end).trim();
    }

    if (lessonName && content) {
      lessons.push({ lessonNum, lessonName, content: textToMarkdown(content) });
    }
  }

  return lessons;
}

// ---------- Publicação: renderização ----------
let pubLessons = [];
let pubCourseId = "";

function renderPublishLessons(lessons, courseId) {
  const container = document.getElementById("pub-lessons");
  if (!container) return;
  container.innerHTML = "";

  lessons.forEach(lesson => {
    const card = document.createElement("div");
    card.className = "pub-lesson-card";

    const header = document.createElement("div");
    header.className = "pub-lesson-header";
    header.innerHTML = `<span class="pub-lesson-num">Aula ${lesson.lessonNum}</span> <span class="pub-lesson-name">${lesson.lessonName}</span>`;

    const activity = document.createElement("div");
    activity.className = "pub-lesson-activity";
    activity.textContent = "Para saber mais : Hora do desafio!";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;";

    const btn = document.createElement("button");
    btn.className = "pub-btn";
    btn.textContent = "Publicar";
    btn.addEventListener("click", () => publishLesson(lesson, courseId, card));

    const status = document.createElement("div");
    status.className = "pub-lesson-status";

    row.appendChild(btn);
    row.appendChild(status);

    card.appendChild(header);
    card.appendChild(activity);
    card.appendChild(row);
    container.appendChild(card);
  });

  const pubAllBtn = document.getElementById("pub-all-btn");
  if (pubAllBtn) pubAllBtn.style.display = lessons.length > 1 ? "" : "none";
}

async function publishLesson(lesson, courseId, card) {
  const btn = card.querySelector(".pub-btn");
  const status = card.querySelector(".pub-lesson-status");

  btn.disabled = true;
  status.textContent = "Publicando…";
  status.className = "pub-lesson-status loading";

  try {
    const tab = await getActiveTab();
    const ack = await chrome.tabs.sendMessage(tab.id, {
      type: "ALURA_REVISOR_PUBLISH_DESAFIO_TASK",
      courseId,
      lessonNum: lesson.lessonNum,
      content: lesson.content,
    });

    if (ack?.ok) {
      status.textContent = "✅ Publicado!";
      status.className = "pub-lesson-status ok";
      btn.textContent = "Republicar";
      btn.classList.add("done");
    } else {
      status.textContent = `❌ ${ack?.error || "Erro desconhecido"}`;
      status.className = "pub-lesson-status error";
    }
  } catch (e) {
    status.textContent = `❌ ${e.message}`;
    status.className = "pub-lesson-status error";
  } finally {
    btn.disabled = false;
  }
}

// ---------- Publicação: leitor de .docx ----------

// Extrai um arquivo do ZIP (deflate-raw ou stored) e retorna string UTF-8
async function extractZipEntry(bytes, filename) {
  let offset = 0;
  while (offset < bytes.length - 30) {
    if (bytes[offset] !== 0x50 || bytes[offset+1] !== 0x4B ||
        bytes[offset+2] !== 0x03 || bytes[offset+3] !== 0x04) { offset++; continue; }
    const compression  = bytes[offset+8]  | (bytes[offset+9]  << 8);
    const compressedSz = bytes[offset+18] | (bytes[offset+19] << 8) |
                         (bytes[offset+20] << 16) | (bytes[offset+21] << 24);
    const filenameLen  = bytes[offset+26] | (bytes[offset+27] << 8);
    const extraLen     = bytes[offset+28] | (bytes[offset+29] << 8);
    const entryName    = new TextDecoder().decode(bytes.slice(offset+30, offset+30+filenameLen));
    const dataStart    = offset + 30 + filenameLen + extraLen;

    if (entryName === filename) {
      const chunk = bytes.slice(dataStart, dataStart + compressedSz);
      if (compression === 0) return new TextDecoder("utf-8").decode(chunk);
      const ds = new DecompressionStream("deflate-raw");
      const w = ds.writable.getWriter(); w.write(chunk); w.close();
      const parts = [];
      const r = ds.readable.getReader();
      while (true) { const { done, value } = await r.read(); if (done) break; parts.push(value); }
      const total = parts.reduce((a, c) => a + c.length, 0);
      const out = new Uint8Array(total);
      let pos = 0; for (const p of parts) { out.set(p, pos); pos += p.length; }
      return new TextDecoder("utf-8").decode(out);
    }
    offset = dataStart + compressedSz;
  }
  return null;
}

function decodeXmlEntities(s) {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
          .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
          .replace(/&#x2019;/g,"'").replace(/&#x2018;/g,"'")
          .replace(/&#x201C;/g,'"').replace(/&#x201D;/g,'"')
          .replace(/&#x2013;/g,"–").replace(/&#x2014;/g,"—");
}

// Converte word/document.xml em texto, preservando numeração de listas
function parseDocumentXml(xml) {
  const listCounters = {};

  // Passo 1: percorre parágrafos via indexOf (sem regex) e injeta números de lista
  let out = "";
  let pos = 0;
  while (pos < xml.length) {
    const pOpen = xml.indexOf("<w:p", pos);
    if (pOpen < 0) { out += xml.slice(pos); break; }

    const tagClose = xml.indexOf(">", pOpen);
    if (tagClose < 0) { out += xml.slice(pos); break; }

    const pClose = xml.indexOf("</w:p>", tagClose + 1);
    if (pClose < 0) { out += xml.slice(pos); break; }

    const before  = xml.slice(pos, pOpen);
    const openTag = xml.slice(pOpen, tagClose + 1);
    const body    = xml.slice(tagClose + 1, pClose);

    // Detecta lista numerada no corpo do parágrafo
    const numPrStart = body.indexOf("<w:numPr>");
    const numPrEnd   = body.indexOf("</w:numPr>");
    let prefix = "";
    if (numPrStart >= 0 && numPrEnd > numPrStart) {
      const numPrBody = body.slice(numPrStart + 9, numPrEnd);
      const numIdM = numPrBody.match(/<w:numId w:val="(\d+)"/);
      const ilvlM  = numPrBody.match(/<w:ilvl w:val="(\d+)"/);
      const numId  = numIdM?.[1] ?? "0";
      const ilvl   = ilvlM?.[1]  ?? "0";
      const key    = `${numId}:${ilvl}`;
      listCounters[key] = (listCounters[key] ?? 0) + 1;
      prefix = "  ".repeat(+ilvl) + listCounters[key] + ". ";
    }

    out += before + openTag + prefix + body + "</w:p>";
    pos = pClose + 6;
  }

  // Passo 2: extração simples — quebra em </w:p> e strip de tags
  out = out.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "");
  return decodeXmlEntities(out).replace(/\n{3,}/g, "\n\n").trim();
}

async function readDocxAsText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const xml = await extractZipEntry(bytes, "word/document.xml");
  if (!xml) return null;
  return parseDocumentXml(xml);
}

// ---------- Publicação: carregar arquivo ----------
const pubFileInput = document.getElementById("pub-file-input");
const pubDropArea = document.getElementById("pub-drop-area");
const pubCourseInfo = document.getElementById("pub-course-info");
const pubCourseIdDisplay = document.getElementById("pub-course-id-display");
const pubLessonCount = document.getElementById("pub-lesson-count");

async function handleDesafioFile(file) {
  if (!file) return;
  const courseIdMatch = file.name.match(/\[(\d+)\]/);
  pubCourseId = courseIdMatch?.[1] || "";

  const ext = file.name.split(".").pop().toLowerCase();
  let text = null;

  if (ext === "docx") {
    text = await readDocxAsText(file);
    if (!text) {
      pubCourseIdDisplay.textContent = "Erro ao ler .docx";
      pubCourseInfo.style.display = "";
      return;
    }
  } else if (ext === "doc") {
    pubCourseIdDisplay.textContent = "Use .docx ou .txt (o formato .doc binário não é suportado)";
    pubCourseInfo.style.display = "";
    return;
  } else {
    // .txt
    text = await file.text();
  }

  pubLessons = parseDesafioDoc(text);
  pubCourseIdDisplay.textContent = pubCourseId || "(não encontrado no nome do arquivo)";
  pubLessonCount.textContent = `${pubLessons.length} aula(s)`;
  pubCourseInfo.style.display = "";
  renderPublishLessons(pubLessons, pubCourseId);
}

if (pubFileInput) {
  pubFileInput.addEventListener("change", (e) => handleDesafioFile(e.target.files[0]));
}

if (pubDropArea) {
  pubDropArea.addEventListener("dragover", (e) => { e.preventDefault(); pubDropArea.classList.add("drag-over"); });
  pubDropArea.addEventListener("dragleave", () => pubDropArea.classList.remove("drag-over"));
  pubDropArea.addEventListener("drop", async (e) => {
    e.preventDefault();
    pubDropArea.classList.remove("drag-over");
    await handleDesafioFile(e.dataTransfer.files[0]);
  });
}

const pubAllBtn = document.getElementById("pub-all-btn");
if (pubAllBtn) {
  pubAllBtn.addEventListener("click", async () => {
    if (!pubLessons.length) return;
    pubAllBtn.disabled = true;
    for (const lesson of pubLessons) {
      const card = document.querySelector(`#pub-lessons .pub-lesson-card:nth-child(${lesson.lessonNum})`);
      if (card) await publishLesson(lesson, pubCourseId, card);
    }
    pubAllBtn.disabled = false;
  });
}

// ---------- Start revisão ----------
btn.addEventListener("click", async () => {
  try {
    btn.disabled = true;

    if (isRunning) {
      setStatus("Parando…");
      try {
        const tab = await getActiveTab();
        await chrome.tabs.sendMessage(tab.id, { type: "ALURA_REVISOR_STOP" });
      } catch {
        // Tab may be navigating; clear storage directly as fallback
      } finally {
        await chrome.storage.local.remove(KEY);
      }
      setRunningUI(false);
      setStatus("Revisão parada.");
    } else {
      setStatus("Iniciando…");
      const tab = await getActiveTab();
      const productType = document.querySelector('input[name="productType"]:checked')?.value || "tecnico";
      const platform = document.getElementById("platform-select")?.value || null;
      const ack = await chrome.tabs.sendMessage(tab.id, { type: "ALURA_REVISOR_START", productType, platform: platform || null });

      if (!ack?.ok) {
        setStatus(`Não iniciou: ${ack?.error || "erro desconhecido"}`);
        return;
      }

      setRunningUI(true);
      setStatus("Rodando ✅\nO resultado final aparecerá como notificação do Chrome.");
    }
  } catch (e) {
    setStatus(`Erro: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Upload ícone Start ----------
const startIconBtn = document.getElementById("start-icon-btn");
const startIconStatusEl = document.getElementById("start-icon-status");

if (startIconBtn) {
  startIconBtn.addEventListener("click", async () => {
    try {
      startIconBtn.disabled = true;
      if (startIconStatusEl) startIconStatusEl.textContent = "Iniciando…";

      const githubToken = await chrome.storage.local.get(["aluraRevisorGithubToken"]);
      if (!githubToken?.aluraRevisorGithubToken) {
        if (startIconStatusEl) startIconStatusEl.textContent = "Configure o token GitHub antes de usar.";
        startIconBtn.disabled = false;
        return;
      }

      const tab = await getActiveTab();
      const ack = await chrome.tabs.sendMessage(tab.id, { type: "ALURA_REVISOR_UPLOAD_START_ICON" });

      if (!ack?.ok) {
        if (startIconStatusEl) startIconStatusEl.textContent = `Erro: ${ack?.error || "Abra a Home do curso Start antes de usar."}`;
        startIconBtn.disabled = false;
        return;
      }

      if (startIconStatusEl) startIconStatusEl.textContent = "Processando… aguarde o resultado na página.";
    } catch (e) {
      if (startIconStatusEl) startIconStatusEl.textContent = `Erro: ${e.message}`;
    } finally {
      startIconBtn.disabled = false;
    }
  });
}

// ---------- Auditoria de transcrições em lote ----------
const batchIdsEl = document.getElementById("batch-ids");
const batchAuditBtn = document.getElementById("batch-audit-btn");
const batchStatusEl = document.getElementById("batch-status");

batchAuditBtn.addEventListener("click", async () => {
  const raw = batchIdsEl.value.trim();
  const courseIds = raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  if (courseIds.length === 0) {
    batchStatusEl.textContent = "Cole ao menos um ID de curso.";
    return;
  }
  const checks = {
    transcription: document.getElementById("audit-transcription").checked,
    pt: document.getElementById("audit-pt").checked,
    esp: document.getElementById("audit-esp").checked,
    downloadTextual: document.getElementById("audit-download-textual").checked,
  };
  if (!checks.transcription && !checks.pt && !checks.esp && !checks.downloadTextual) {
    batchStatusEl.textContent = "Marque ao menos um item para auditar.";
    return;
  }
  try {
    batchAuditBtn.disabled = true;
    batchStatusEl.textContent = `Auditando ${courseIds.length} curso(s)…`;
    const tab = await getActiveTab();
    const ack = await chrome.tabs.sendMessage(tab.id, {
      type: "ALURA_REVISOR_BATCH_TRANSCRIPTION_AUDIT",
      courseIds,
      checks,
    });
    if (!ack?.ok) {
      batchStatusEl.textContent = `Erro: ${ack?.error || "desconhecido"}`;
    } else {
      batchStatusEl.textContent = "Auditoria em andamento…";
    }
  } catch (e) {
    batchStatusEl.textContent = `Erro: ${e.message}`;
  } finally {
    batchAuditBtn.disabled = false;
  }
});

// ---------- Inicialização: carrega credenciais salvas nos campos ----------
(async () => {
  const data = await chrome.storage.local.get(["aluraRevisorGithubToken"]);

  if (githubTokenEl && data.aluraRevisorGithubToken)
    githubTokenEl.value = data.aluraRevisorGithubToken;
})();

