const KEY = "aluraRevisorRunState";
const KEY_HISTORY = "aluraRevisorHistory";

const FORMACAO_DOCENTE_PLATFORMS = [
  "formacao-ai-12",
  "formacao-ai-35",
  "formacao-af-startlab",
  "formacao-af-em",
];

const PLATFORM_OPTIONS = {
  default: [
    { value: "", label: "Selecione a plataforma..." },
    { value: "startlab", label: "StartLab" },
    { value: "vscode", label: "VS Code" },
    { value: "figma", label: "Figma / p5.js / Python / IA / Cultura digital / Educa\u00e7\u00e3o Midi\u00e1tica" },
    { value: "robotica", label: "Rob\u00f3tica" },
  ],
  tecnico: [
    { value: "tecnico", label: "Curso t\u00e9cnico" },
  ],
  formacaoDocente: [
    { value: "formacao-ai-12", label: "Anos iniciais (1\u00ba e 2\u00ba ano)" },
    { value: "formacao-ai-35", label: "Anos iniciais (3\u00ba a 5\u00ba ano)" },
    { value: "formacao-af-startlab", label: "Anos finais (unidade com StartLab)" },
    { value: "formacao-af-em", label: "Anos finais e m\u00e9dio" },
  ],
};

function logFeatureUsage(feature, action, data = {}) {
  const { courseId = "", courseName = "", count = 1, metadata = {} } = data;
  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: "ALURA_REVISOR_LOG_USAGE",
      entry: {
        eventType: "feature_usage",
        feature,
        action,
        courseId,
        courseName,
        count,
        metadata,
      },
    }, resp => {
      if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
      resolve(resp);
    });
  });
}

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
    { label: "O que aprendemos?" },
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
    { label: "O que aprendemos?" },
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
    { label: "O que aprendemos?" },
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
    { label: "O que aprendemos?" },
    { label: "Vídeo X.X - Conclusão", note: "apenas no último vídeo", optional: true },
  ],
  tecnico: [
    { label: "O que vamos aprender?", note: "apenas aula 01", optional: true },
    { label: "Preparando ambiente", note: "opcional", optional: true },
    { label: "V\u00eddeo X.X" },
    { label: "Aprofundamento" },
    { label: "Exerc\u00edcio Luri" },
    { label: "Exerc\u00edcio Luri" },
    { label: "Conclus\u00e3o", note: "apenas na \u00faltima aula", optional: true },
  ],
  "formacao-ai-12": [
    { heading: "1. Aspectos Gerais da Unidade" },
    { marker: "a", label: "Contextualiza\u00e7\u00e3o", subitem: true },
    { marker: "b", label: "Conte\u00fado Program\u00e1tico", subitem: true },
    { marker: "c", label: "Resumo aula a aula", subitem: true },
    { marker: "d", label: "Conex\u00e3o interdisciplinar", subitem: true },
    { marker: "e", label: "Rubrica", subitem: true },
    { heading: "2. Orienta\u00e7\u00f5es Did\u00e1ticas - Aulas 1 e 2" },
    { marker: "a", label: "Aulas 1 e 2", subitem: true },
    { marker: "b", label: "Planos de Aula", subitem: true },
    { marker: "c", label: "Di\u00e1rios de Bordo", subitem: true },
    { marker: "d", label: "Atividades para imprimir", subitem: true },
    { heading: "3. Orienta\u00e7\u00f5es Did\u00e1ticas - Aulas 3 e 4" },
    { marker: "a", label: "Orienta\u00e7\u00f5es", subitem: true },
    { marker: "b", label: "Planos de Aula", subitem: true },
    { marker: "c", label: "Di\u00e1rios de Bordo", subitem: true },
    { marker: "d", label: "Atividades para imprimir", subitem: true },
  ],
  "formacao-ai-35": [
    { heading: "1. M\u00f3dulo 1" },
    { marker: "a", label: "Contextualiza\u00e7\u00e3o da unidade", subitem: true },
    { marker: "b", label: "Conte\u00fado program\u00e1tico", subitem: true },
    { marker: "c", label: "Estrat\u00e9gias did\u00e1ticas", subitem: true },
    { marker: "d", label: "Resumo - Aula a aula", subitem: true },
    { marker: "e", label: "Conex\u00e3o interdisciplinar", subitem: true },
    { marker: "f", label: "Avalia\u00e7\u00e3o de aprendizagem", subitem: true },
    { marker: "g", label: "Orienta\u00e7\u00f5es did\u00e1ticas: aula 1", subitem: true },
    { marker: "h", label: "Plano de aula", subitem: true },
    { marker: "i", label: "Di\u00e1rio de bordo", subitem: true },
    { marker: "j", label: "Rubrica", subitem: true },
    { heading: "2. M\u00f3dulo 2 e M\u00f3dulo 3" },
    { marker: "a", label: "Orienta\u00e7\u00f5es did\u00e1ticas: aula X", subitem: true },
    { marker: "b", label: "Plano de aula", subitem: true },
    { marker: "c", label: "Di\u00e1rio de bordo", subitem: true },
    { marker: "d", label: "Rubrica", subitem: true },
    { heading: "3. M\u00f3dulo 4" },
    { marker: "a", label: "Orienta\u00e7\u00f5es did\u00e1ticas: aula 4", subitem: true },
    { marker: "b", label: "Plano de aula", subitem: true },
    { marker: "c", label: "Di\u00e1rio de bordo", subitem: true },
    { marker: "d", label: "Rubrica", subitem: true },
    { marker: "e", label: "Sistematiza\u00e7\u00e3o da unidade", subitem: true },
  ],
  "formacao-af-startlab": [
    { heading: "1. Orienta\u00e7\u00f5es Did\u00e1ticas" },
    { marker: "a", label: "Contextualiza\u00e7\u00e3o", subitem: true },
    { marker: "b", label: "Aulas 1 a 4", subitem: true },
    { marker: "c", label: "Aulas 5 a 8", subitem: true },
    { marker: "d", label: "Sistematiza\u00e7\u00e3o", subitem: true },
    { heading: "2. Recursos Did\u00e1ticos" },
    { marker: "a", label: "StartLab", subitem: true },
    { marker: "b", label: "Gabarito da Avalia\u00e7\u00e3o", subitem: true },
    { marker: "c", label: "Rubrica", subitem: true },
    { marker: "d", label: "Material do Professor", subitem: true },
    { heading: "3. Projetos do Instrutor" },
    { marker: "a", label: "Aula 1", subitem: true },
    { marker: "b", label: "Aula 2 ...", subitem: true },
    { marker: "c", label: "Aula X", subitem: true },
  ],
  "formacao-af-em": [
    { heading: "1. Orienta\u00e7\u00f5es Did\u00e1ticas" },
    { marker: "a", label: "Contextualiza\u00e7\u00e3o", subitem: true },
    { marker: "b", label: "Aulas 1 a 4", subitem: true },
    { marker: "c", label: "Aulas 5 a 8", subitem: true },
    { marker: "d", label: "Sistematiza\u00e7\u00e3o", subitem: true },
    { heading: "2. Recursos Did\u00e1ticos" },
    { marker: "a", label: "Projeto do Instrutor", note: "nem sempre tem", optional: true, subitem: true },
    { marker: "b", label: "Gabarito da Avalia\u00e7\u00e3o", subitem: true },
    { marker: "c", label: "Rubrica", subitem: true },
    { marker: "d", label: "Material do Professor", subitem: true },
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
  const isFixedOrder = true;
  let stepNumber = 1;

  items.forEach((item, i) => {
    if (item.heading) {
      const heading = document.createElement("div");
      heading.className = "act-heading";
      heading.textContent = item.heading;
      fragment.appendChild(heading);
      return;
    }

    const div = document.createElement("div");
    div.className = "act-item" + (item.optional ? " optional" : "") + (isFixedOrder ? " fixed" : "") + (item.subitem ? " subitem" : "");

    if (isFixedOrder) {
      const step = document.createElement("span");
      step.className = "act-step";
      step.textContent = item.marker || String(stepNumber++);
      div.appendChild(step);
    } else {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = `act-cb-${i}`;
      div.appendChild(cb);
    }

    const lbl = document.createElement("label");
    lbl.htmlFor = `act-cb-${i}`;
    lbl.innerHTML = item.label + (item.note ? ` <span class="act-note">(${item.note})</span>` : "");

    div.appendChild(lbl);
    fragment.appendChild(div);
  });

  container.innerHTML = "";
  container.appendChild(fragment);
}

const platformSelect = document.getElementById("platform-select");
if (platformSelect) {
  platformSelect.addEventListener("change", () => {
    renderActivityChecklist(platformSelect.value);
  });
}

// ---------- Custom select visual ----------
const csWrapper = document.getElementById("platform-select-wrapper");
const csTrigger = document.getElementById("platform-select-trigger");
const csText    = document.getElementById("platform-select-text");
const csOptions = document.getElementById("platform-select-options");

function csRebuild() {
  if (!csOptions || !platformSelect) return;
  csOptions.innerHTML = "";
  [...platformSelect.options].forEach(opt => {
    const div = document.createElement("div");
    div.className = "custom-select-option" + (opt.value === platformSelect.value ? " selected" : "");
    div.dataset.value = opt.value;
    div.textContent = opt.label || opt.text;
    div.addEventListener("click", () => {
      if (platformSelect.disabled) return;
      platformSelect.value = opt.value;
      platformSelect.dispatchEvent(new Event("change"));
      csClose();
      csUpdateDisplay();
    });
    csOptions.appendChild(div);
  });
  csUpdateDisplay();
}

function csUpdateDisplay() {
  if (!csText || !platformSelect) return;
  const sel = platformSelect.options[platformSelect.selectedIndex];
  csText.textContent = sel?.label || sel?.text || "Selecione a plataforma…";
  csWrapper?.classList.toggle("disabled", !!platformSelect.disabled);
  csOptions?.querySelectorAll(".custom-select-option").forEach(d => {
    d.classList.toggle("selected", d.dataset.value === platformSelect.value);
  });
}

function csClose() { csWrapper?.classList.remove("open"); }

if (csTrigger) {
  csTrigger.addEventListener("click", () => {
    if (platformSelect?.disabled) return;
    csWrapper.classList.toggle("open");
  });
}
document.addEventListener("click", e => {
  if (csWrapper && !csWrapper.contains(e.target)) csClose();
});
// ---------- /Custom select ----------

function fillPlatformOptions(options, selectedValue = "") {
  if (!platformSelect) return;

  platformSelect.innerHTML = "";
  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    platformSelect.appendChild(el);
  });

  const values = options.map(option => option.value);
  platformSelect.value = values.includes(selectedValue) ? selectedValue : options[0]?.value || "";
  csRebuild();
}

function syncPlatformWithProductType() {
  if (!platformSelect) return;

  const productType = document.querySelector('input[name="productType"]:checked')?.value || "tecnico";
  if (productType === "tecnico") {
    fillPlatformOptions(PLATFORM_OPTIONS.tecnico, "tecnico");
    platformSelect.disabled = true;
  } else if (productType === "formacaoDocente") {
    fillPlatformOptions(PLATFORM_OPTIONS.formacaoDocente, platformSelect.value);
    platformSelect.disabled = false;
  } else {
    fillPlatformOptions(PLATFORM_OPTIONS.default, platformSelect.value);
    platformSelect.disabled = false;
  }
  csUpdateDisplay();

  renderActivityChecklist(platformSelect.value);
}

document.querySelectorAll('input[name="productType"]').forEach((radio) => {
  radio.addEventListener("change", syncPlatformWithProductType);
});
syncPlatformWithProductType();

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

// ---------- Credenciais R2 ----------
const R2_ACCESS_KEY_STORAGE = "r2AccessKey";
const R2_SECRET_KEY_STORAGE = "r2SecretKey";
const r2AccessKeyEl = document.getElementById("r2-access-key");
const r2SecretKeyEl = document.getElementById("r2-secret-key");
const r2SaveBtn = document.getElementById("r2-save-btn");
const r2StatusEl = document.getElementById("r2-status");

chrome.storage.local.get([R2_ACCESS_KEY_STORAGE, R2_SECRET_KEY_STORAGE], r => {
  if (r[R2_ACCESS_KEY_STORAGE]) r2AccessKeyEl.value = r[R2_ACCESS_KEY_STORAGE];
  if (r[R2_SECRET_KEY_STORAGE]) r2SecretKeyEl.value = r[R2_SECRET_KEY_STORAGE];
});

if (r2SaveBtn) {
  r2SaveBtn.addEventListener("click", async () => {
    const ak = r2AccessKeyEl.value.trim();
    const sk = r2SecretKeyEl.value.trim();
    await chrome.storage.local.set({
      [R2_ACCESS_KEY_STORAGE]: ak,
      [R2_SECRET_KEY_STORAGE]: sk,
    });
    r2StatusEl.textContent = (ak && sk) ? "✅ Credenciais salvas." : "Credenciais removidas.";
    setTimeout(() => { r2StatusEl.textContent = ""; }, 2000);
  });
}

// Intercepta links com data-open-tab para abrir sem fechar o popup
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-open-tab]");
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  chrome.tabs.create({ url: a.dataset.openTab, active: false });
});

// ---------- Desativar atividades em lote ----------
const deactCourseIdEl  = document.getElementById("deact-course-id");
const deactFetchBtn    = document.getElementById("deact-fetch-btn");
const deactStatusEl    = document.getElementById("deact-status");
const deactListEl      = document.getElementById("deact-list");
const deactActionsEl   = document.getElementById("deact-actions");
const deactConfirmBtn  = document.getElementById("deact-confirm-btn");
const deactActivateBtn = document.getElementById("deact-activate-btn");
const deactSelectAllBtn= document.getElementById("deact-select-all-btn");
const deactCountEl     = document.getElementById("deact-count");

let deactAllTasks = [];

// Restaura lista ao reabrir o popup
chrome.storage.session.get("deactState", ({ deactState }) => {
  if (!deactState) return;
  deactCourseIdEl.value = deactState.courseId;
  deactStatusEl.textContent = deactState.status;
  renderDeactList(deactState.sections);
});

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
      cb.addEventListener("change", updateDeactCount);

      const lbl = document.createElement("label");
      lbl.htmlFor = cb.id;
      lbl.innerHTML = `${task.title} <span class="deact-type">${task.type}</span>`;

      item.appendChild(cb);
      item.appendChild(lbl);

      if (task.activityUrl) {
        const link = document.createElement("a");
        link.href = task.activityUrl;
        link.title = "Ver atividade";
        link.textContent = "↗";
        link.dataset.openTab = task.activityUrl;
        link.style.cssText = "color:#3D6CE2;text-decoration:none;font-size:10px;flex-shrink:0;";
        item.appendChild(link);
      }
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
    chrome.storage.session.set({ deactState: { courseId, sections: sectionsWithTasks, status: `${total} atividade(s) encontrada(s).` } });
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

async function runDeactAction(action) {
  const selected = [...deactListEl.querySelectorAll("input[type='checkbox']:checked")];
  if (!selected.length) { deactStatusEl.textContent = "Nenhuma atividade selecionada."; return; }

  const isDeactivate = action === "deactivate";
  const verb = isDeactivate ? "Desativando" : "Ativando";
  const msgType = isDeactivate ? "ALURA_REVISOR_DEACTIVATE_TASK" : "ALURA_REVISOR_ACTIVATE_TASK";
  const doneVerb = isDeactivate ? "desativada(s)" : "ativada(s)";

  deactConfirmBtn.disabled = true;
  deactActivateBtn.disabled = true;
  let done = 0, succeeded = 0;

  const CONCURRENCY = 4;
  for (let i = 0; i < selected.length; i += CONCURRENCY) {
    const batch = selected.slice(i, i + CONCURRENCY);
    deactStatusEl.textContent = `${verb} ${Math.min(i + CONCURRENCY, selected.length)} de ${selected.length}…`;
    const results = await Promise.allSettled(
      batch.map(cb => chrome.runtime.sendMessage({
        type: msgType,
        editUrl: cb.dataset.editUrl,
      }))
    );
    for (let j = 0; j < batch.length; j++) {
      const cb = batch[j];
      const r = results[j];
      if (r.status === "fulfilled" && r.value?.ok) {
        succeeded++;
        cb.checked = false;
        const item = cb.closest(".deact-task-item");
        if (isDeactivate) item?.classList.add("inactive");
        else item?.classList.remove("inactive");
      }
      done++;
    }
  }

  if (succeeded > 0) {
    await logFeatureUsage("activity_deactivated", isDeactivate ? "deactivated" : "activated", {
      count: succeeded,
      metadata: { total: selected.length, succeeded, failed: done - succeeded },
    });
  }

  deactStatusEl.textContent = `✅ ${succeeded} atividade(s) ${doneVerb}.`;
  deactConfirmBtn.disabled = false;
  deactActivateBtn.disabled = false;
  updateDeactCount();
  chrome.storage.session.remove("deactState");
}

deactConfirmBtn?.addEventListener("click", () => runDeactAction("deactivate"));
deactActivateBtn?.addEventListener("click", () => runDeactAction("activate"));

// ---------- Tab switching ----------
const tabReviewBtn = document.getElementById("tab-review-btn");
const tabToolsBtn = document.getElementById("tab-tools-btn");
const tabPublishBtn = document.getElementById("tab-publish-btn");
const tabEditorialBtn = document.getElementById("tab-editorial-btn");
const tabGuiaBtn = document.getElementById("tab-guia-btn");
const tabReview = document.getElementById("tab-review");
const tabTools = document.getElementById("tab-tools");
const tabPublish = document.getElementById("tab-publish");
const tabEditorial = document.getElementById("tab-editorial");
const tabGuia = document.getElementById("tab-guia");

function switchTab(active) {
  [tabReviewBtn, tabToolsBtn, tabPublishBtn, tabEditorialBtn, tabGuiaBtn].forEach(b => b.classList.remove("active"));
  [tabReview, tabTools, tabPublish, tabEditorial, tabGuia].forEach(p => p.style.display = "none");
  active.btn.classList.add("active");
  active.panel.style.display = "";
}

tabReviewBtn.addEventListener("click", () => switchTab({ btn: tabReviewBtn, panel: tabReview }));
tabToolsBtn.addEventListener("click", () => switchTab({ btn: tabToolsBtn, panel: tabTools }));
tabPublishBtn.addEventListener("click", () => switchTab({ btn: tabPublishBtn, panel: tabPublish }));
tabEditorialBtn.addEventListener("click", () => switchTab({ btn: tabEditorialBtn, panel: tabEditorial }));
tabGuiaBtn.addEventListener("click", async () => {
  switchTab({ btn: tabGuiaBtn, panel: tabGuia });
  await guiaCheckPage();
});

// ---------- Material editorial ----------
const EDIT_BASE_URL = "http://cdn3.gnarususercontent.com.br/Material-de-apoio-Start-2026";
const R2_ENDPOINT = "https://4986a99d4a6ebf7ab87ee6461d95b58b.r2.cloudflarestorage.com";
const R2_BUCKET = "gnarus-content";
const R2_PREFIX = "Material-de-apoio-Start-2026";
const R2_REGION = "auto";

// ---------- SigV4 (AWS) ----------
async function sha256Hex(data) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hmac(keyBytes, msg) {
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return new Uint8Array(sig);
}
function hex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
function encodeUriSegment(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, c =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}
async function signR2Request({ method, key, body, contentType, accessKey, secretKey }) {
  const host = new URL(R2_ENDPOINT).host;
  const canonicalUri = "/" + encodeUriSegment(R2_BUCKET) + "/" +
    key.split("/").map(encodeUriSegment).join("/");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256Hex(body);

  const headers = {
    "host": host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${R2_REGION}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(new TextEncoder().encode("AWS4" + secretKey), dateStamp);
  const kRegion = await hmac(kDate, R2_REGION);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: R2_ENDPOINT + canonicalUri,
    headers: { ...headers, "Authorization": authorization },
  };
}

async function uploadToR2(file, objectKey, accessKey, secretKey) {
  const body = await file.arrayBuffer();
  const contentType = file.type || "application/pdf";
  const { url, headers } = await signR2Request({
    method: "PUT",
    key: objectKey,
    body,
    contentType,
    accessKey,
    secretKey,
  });
  const res = await fetch(url, { method: "PUT", headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
}

// ---------- Materiais publicados ----------
const matListCourseIdInput = document.getElementById("mat-list-course-id");
const matListBtn = document.getElementById("mat-list-btn");
const matListStatus = document.getElementById("mat-list-status");
const matListResults = document.getElementById("mat-list-results");

async function fetchSectionMaterials(courseId, sectionId) {
  const res = await fetch(
    `https://cursos.alura.com.br/admin/courses/v2/${courseId}/sections/${sectionId}`,
    { credentials: "include" }
  );
  if (!res.ok) return [];
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const materials = [];

  // Materiais existentes ficam numa <table> com linhas: título | link | permissão | ações
  doc.querySelectorAll("table.table tbody tr").forEach(tr => {
    const tds = tr.querySelectorAll("td");
    if (tds.length < 4) return;
    const title = tds[0].textContent.trim();
    const link = (tds[1].querySelector(".support-material-link")?.textContent || "").trim();
    const permission = tds[2].textContent.trim().toLowerCase();
    const deleteBtn = tds[3].querySelector("button.delete[data-materialid]");
    const materialId = deleteBtn?.dataset.materialid || null;
    const role = permission.includes("professor") ? "TEACHER" : "ALL_USERS";
    if (title) materials.push({ title, link, role, materialId });
  });

  return materials;
}

async function listPublishedMaterials(courseId) {
  const res = await fetch(
    `https://cursos.alura.com.br/admin/courses/v2/${courseId}/sections`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`Falha ao buscar seções: ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");

  const sections = [];
  doc.querySelectorAll("tbody tr[id]").forEach(tr => {
    const sectionId = tr.id;
    const tds = tr.querySelectorAll("td");
    if (tds.length < 2) return;
    const n = parseInt(tds[1].textContent.trim(), 10);
    const title = tds[0]?.textContent.trim() || "";
    if (!isNaN(n)) sections.push({ sectionId, aulaNum: n, title });
  });

  matListStatus.textContent = `${sections.length} aula(s) encontrada(s). Buscando materiais…`;

  const CONCURRENCY = 4;
  const results = [];
  for (let i = 0; i < sections.length; i += CONCURRENCY) {
    const batch = sections.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async sec => ({
        ...sec,
        materials: await fetchSectionMaterials(courseId, sec.sectionId),
      }))
    );
    results.push(...batchResults);
    matListStatus.textContent = `Processando… ${Math.min(i + CONCURRENCY, sections.length)}/${sections.length} aulas`;
  }

  return results.sort((a, b) => a.aulaNum - b.aulaNum);
}

async function deleteSupportMaterial(courseId, sectionId, materialId, itemEl) {
  const sectionUrl = `https://cursos.alura.com.br/admin/courses/v2/${courseId}/sections/${sectionId}`;

  const tab = await chrome.tabs.create({ url: sectionUrl, active: false });
  const tabId = tab.id;

  try {
    // Aguarda a página carregar completamente
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout ao carregar página.")), 20000);
      chrome.tabs.onUpdated.addListener(function listener(id, info) {
        if (id === tabId && info.status === "complete") {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    });

    // world: "MAIN" → roda no mesmo contexto JS da página (mesmo window que o jQuery usa)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [materialId],
      func: (materialId) => {
        window.confirm = () => true;
        const btn = document.querySelector(`button.delete[data-materialid="${materialId}"]`);
        if (btn) btn.click();
      },
    });

    // Aguarda a página recarregar após a deleção (navegação ou reload pós-submit)
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 8000); // máximo 8s
      chrome.tabs.onUpdated.addListener(function listener(id, info) {
        if (id === tabId && info.status === "complete") {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    });

    // Verifica se o material foi removido
    const check = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [materialId],
      func: (materialId) => !document.querySelector(`button.delete[data-materialid="${materialId}"]`),
    });

    const deleted = check?.[0]?.result;
    if (!deleted) throw new Error("Material ainda aparece após deleção.");

    itemEl.style.opacity = "0.4";
    itemEl.style.pointerEvents = "none";
    itemEl.querySelector(".mat-del-btn").textContent = "Deletado";
    await logFeatureUsage("r2_material_upload", "material_deleted", {
      courseId,
      metadata: { sectionId, materialId },
    });
  } catch (e) {
    const errEl = itemEl.querySelector(".mat-del-err");
    if (errEl) {
      errEl.textContent = e.message;
      errEl.style.display = "block";
    }
    const delBtn = itemEl.querySelector(".mat-del-btn");
    if (delBtn) { delBtn.disabled = false; delBtn.textContent = "Deletar"; }
  } finally {
    await chrome.tabs.remove(tabId).catch(() => {});
  }
}

function renderMatResults(sections) {
  matListResults.innerHTML = "";
  const withMaterials = sections.filter(s => s.materials.length > 0);
  if (withMaterials.length === 0) {
    matListResults.innerHTML = `<div style="font-size:12px;color:#888;">Nenhum material encontrado.</div>`;
    return;
  }

  const courseId = matListCourseIdInput.value.trim();

  // Coleta todos os materiais com ID de deleção
  const allDeletable = withMaterials.flatMap(sec =>
    sec.materials.filter(m => m.materialId).map(m => ({ ...m, sectionId: sec.sectionId }))
  );

  if (allDeletable.length > 0) {
    const removeAllBtn = document.createElement("button");
    removeAllBtn.textContent = `Remover todos (${allDeletable.length})`;
    removeAllBtn.style.cssText = `
      width:100%;padding:8px;font-size:12px;font-weight:700;font-family:inherit;
      background:none;border:1.5px solid #CA3328;color:#CA3328;
      border-radius:8px;cursor:pointer;margin-bottom:8px;
    `;
    removeAllBtn.addEventListener("click", async () => {
      removeAllBtn.disabled = true;
      const total = allDeletable.length;
      let done = 0;
      removeAllBtn.textContent = `Removendo 0/${total}…`;

      const CONCURRENCY = 4;
      const queue = [...allDeletable];
      const worker = async () => {
        while (queue.length > 0) {
          const m = queue.shift();
          await deleteSupportMaterial(courseId, m.sectionId, m.materialId, document.createElement("div"));
          done++;
          removeAllBtn.textContent = `Removendo ${done}/${total}…`;
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      removeAllBtn.textContent = `✓ ${done} removido(s)`;
      matListStatus.textContent = `Busque novamente para atualizar a lista.`;
    });
    matListResults.appendChild(removeAllBtn);
  }

  withMaterials.forEach(sec => {
    const card = document.createElement("div");
    card.className = "mat-section-card";

    const header = document.createElement("div");
    header.className = "mat-section-header";
    header.textContent = `Aula ${sec.aulaNum}${sec.title ? " — " + sec.title : ""}`;
    card.appendChild(header);

    sec.materials.forEach(m => {
      const item = document.createElement("div");
      item.className = "mat-item";

      const roleClass = (m.role || "").toUpperCase().includes("TEACHER") ? "teacher" : "all";
      const roleLabel = roleClass === "teacher" ? "Professor" : "Alunos";

      const info = document.createElement("div");
      info.className = "mat-item-info";
      info.innerHTML = `
        <div class="mat-item-title">${m.title}</div>
        ${m.link ? `<a class="mat-item-link" href="${m.link}" target="_blank" rel="noopener">${m.link}</a>` : ""}
      `;

      const role = document.createElement("span");
      role.className = `mat-item-role ${roleClass}`;
      role.textContent = roleLabel;

      item.style.flexWrap = "wrap";
      item.appendChild(info);
      item.appendChild(role);

      if (m.materialId) {
        const delBtn = document.createElement("button");
        delBtn.className = "mat-del-btn";
        delBtn.textContent = "Deletar";
        delBtn.style.cssText = `
          width:auto;padding:2px 8px;font-size:10px;font-weight:700;
          background:none;border:1.5px solid #CA3328;color:#CA3328;
          border-radius:4px;cursor:pointer;flex-shrink:0;font-family:inherit;
        `;

        const errEl = document.createElement("span");
        errEl.className = "mat-del-err";
        errEl.style.cssText = "display:none;font-size:10px;color:#CA3328;width:100%;margin-top:2px;";

        delBtn.addEventListener("click", async () => {
          delBtn.disabled = true;
          delBtn.textContent = "…";
          errEl.style.display = "none";
          await deleteSupportMaterial(courseId, sec.sectionId, m.materialId, item);
        });
        item.appendChild(delBtn);
        item.appendChild(errEl);
      }

      card.appendChild(item);
    });

    matListResults.appendChild(card);
  });
}

matListBtn.addEventListener("click", async () => {
  const courseId = matListCourseIdInput.value.trim();
  if (!courseId) { matListStatus.textContent = "Informe o ID do curso."; return; }
  matListBtn.disabled = true;
  matListResults.innerHTML = "";
  matListStatus.style.color = "#444d56";
  matListStatus.textContent = "Buscando seções…";
  try {
    const sections = await listPublishedMaterials(courseId);
    const total = sections.reduce((a, s) => a + s.materials.length, 0);
    matListStatus.textContent = `${total} material(is) em ${sections.filter(s => s.materials.length).length} aula(s).`;
    renderMatResults(sections);
  } catch (e) {
    matListStatus.style.color = "#CA3328";
    matListStatus.textContent = `Erro: ${e.message}`;
  } finally {
    matListBtn.disabled = false;
  }
});

const EDIT_FOLDER_KEY = "editorialFolderName";
const editFolderInput = document.getElementById("edit-folder");
const editFileInput = document.getElementById("edit-file-input");
const editDropArea = document.getElementById("edit-drop-area");
const editFilesEl = document.getElementById("edit-files");
const editUploadAllBtn = document.getElementById("edit-upload-all-btn");
const editPublishBtn = document.getElementById("edit-publish-btn");
const editResetBtn = document.getElementById("edit-reset-btn");
const editCourseIdLabel = document.getElementById("edit-course-id-label");
const editGlobalStatus = document.getElementById("edit-global-status");
const editPublishLog = document.getElementById("edit-publish-log");

if (editResetBtn) {
  editResetBtn.addEventListener("click", () => {
    editorialFiles = [];
    editFolderInput.value = "";
    chrome.storage.local.remove(EDIT_FOLDER_KEY);
    editCourseIdLabel.textContent = "-";
    if (editFileInput) editFileInput.value = "";
    editGlobalStatus.textContent = "";
    editPublishLog.textContent = "";
    renderEditorialCards();
  });
}

function extractCourseId(folder) {
  const m = (folder || "").match(/^\s*\[?\s*(\d+)/);
  return m ? m[1] : "";
}

let editorialFiles = []; // [{ name, subfolder }]

chrome.storage.local.get([EDIT_FOLDER_KEY], r => {
  if (r[EDIT_FOLDER_KEY]) editFolderInput.value = r[EDIT_FOLDER_KEY];
  editCourseIdLabel.textContent = extractCourseId(editFolderInput.value) || "-";
});

editFolderInput.addEventListener("input", () => {
  chrome.storage.local.set({ [EDIT_FOLDER_KEY]: editFolderInput.value.trim() });
  editCourseIdLabel.textContent = extractCourseId(editFolderInput.value) || "-";
  renderEditorialCards();
});

editFolderInput.addEventListener("blur", () => {
  const v = editFolderInput.value;
  const normalized = normalizeCourseFolder(v);
  if (normalized && normalized !== v) {
    editFolderInput.value = normalized;
    chrome.storage.local.set({ [EDIT_FOLDER_KEY]: normalized });
    editCourseIdLabel.textContent = extractCourseId(normalized) || "-";
    renderEditorialCards();
  }
});

function normalizeCourseFolder(raw) {
  if (!raw) return "";
  // Remove acentos
  let s = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Captura ID no começo: "[4756] ...", "4756 ..." ou "4756-..."
  const idMatch = s.match(/^\s*\[?\s*(\d+)\s*\]?\s*[-\s]+(.*)$/);
  let id = "", rest = s.trim();
  if (idMatch) { id = idMatch[1]; rest = idMatch[2].trim(); }
  // Quebra em palavras (separadores: espaço, traços, múltiplos)
  const words = rest.split(/[\s\-]+/).filter(Boolean);
  if (words.length === 0) return id;
  // Primeira palavra capitalizada (preserva caixa original), demais em minúsculas
  const first = words[0];
  const tail = words.slice(1).map(w => w.toLowerCase());
  const slug = [first, ...tail].join("-");
  return id ? `${id}-${slug}` : slug;
}

function detectSubfolder(name, relPath) {
  // Prioriza subpasta do caminho (quando o usuário seleciona a pasta inteira)
  if (relPath) {
    const parts = relPath.split("/").slice(0, -1); // remove o arquivo
    for (const p of parts) {
      const up = p.toUpperCase();
      // Produto novo: pastas locais "1 - Plano de aula" / "2 - Slide"
      if (up.includes("PLANO")) return "plano-de-aula";
      if (up.includes("EXERCICIO") || up.includes("EXERCÍCIO")) return "Exercicios";
      if (up.includes("DESAFIO")) return "Desafios";
      if (up.includes("SLIDE")) return "Slides";
    }
  }
  const up = name.toUpperCase();
  if (up.startsWith("PLANO-DE-AULA")) return "plano-de-aula";
  if (up.includes("EXERCICIO") || up.includes("EXERCÍCIO")) return "Exercicios";
  if (up.includes("DESAFIO")) return "Desafios";
  if (up.includes("SLIDE")) return "Slides";
  return "Slides";
}

function buildEditorialUrl(folder, subfolder, filename) {
  const raw = (folder || "").trim().replace(/^\/+|\/+$/g, "");
  if (!raw) return "";
  const f = normalizeCourseFolder(raw);
  return `${EDIT_BASE_URL}/${f}/${subfolder}/${filename}`;
}

function buildObjectKey(folder, subfolder, filename) {
  return `${R2_PREFIX}/${normalizeCourseFolder(folder)}/${subfolder}/${filename}`;
}

async function publishEditorialItem(idx) {
  const item = editorialFiles[idx];
  const folder = editFolderInput.value.trim();
  const courseId = extractCourseId(folder);
  if (!courseId) { editGlobalStatus.textContent = "Pasta sem ID de curso."; return; }
  const aula = extractAulaNumber(item.name);
  if (aula === 9999) { editGlobalStatus.textContent = `Arquivo sem AULA##: ${item.name}`; return; }
  const cls = classifyMaterial(item.name);
  if (!cls) { editGlobalStatus.textContent = `Padrão não reconhecido: ${item.name}`; return; }

  item.pubStatus = "publishing";
  renderEditorialCards();
  try {
    const map = await fetchSectionsMap(courseId);
    const sectionId = map[aula];
    if (!sectionId) throw new Error(`Aula ${aula} não encontrada no curso ${courseId}`);
    const link = buildEditorialUrl(folder, item.subfolder, item.name);
    await publishMaterialsForSection(courseId, sectionId, [{ ...cls, link }]);
    item.pubStatus = "done";
    logPublish(`✓ Aula ${aula}: "${cls.title}" publicado.`);
    await logFeatureUsage("activity_published", "editorial_material_published", {
      courseId,
      metadata: { fileName: item.name, subfolder: item.subfolder, aula, title: cls.title, role: cls.role },
    });
  } catch (e) {
    item.pubStatus = "error";
    item.pubError = e.message || String(e);
    logPublish(`✗ ${item.name}: ${item.pubError}`);
  }
  renderEditorialCards();
}

async function uploadEditorialItem(idx) {
  const item = editorialFiles[idx];
  const folder = editFolderInput.value.trim();
  if (!folder) { editGlobalStatus.textContent = "Informe a pasta do curso."; return; }
  const { r2AccessKey, r2SecretKey } = await chrome.storage.local.get(["r2AccessKey", "r2SecretKey"]);
  if (!r2AccessKey || !r2SecretKey) {
    editGlobalStatus.textContent = "Configure as credenciais R2 na aba Ferramentas.";
    return;
  }
  item.status = "uploading";
  item.error = "";
  renderEditorialCards();
  try {
    const key = buildObjectKey(folder, item.subfolder, item.name);

    // Verifica se já existe no R2 antes de subir
    const { url: headUrl, headers: headHeaders } = await signR2Request({
      method: "HEAD", key, body: new ArrayBuffer(0), accessKey: r2AccessKey, secretKey: r2SecretKey,
    });
    const headRes = await fetch(headUrl, { method: "HEAD", headers: headHeaders });
    if (headRes.ok) {
      item.status = "exists";
      renderEditorialCards();
      return;
    }

    await uploadToR2(item.file, key, r2AccessKey, r2SecretKey);
    item.status = "done";
    await logFeatureUsage("r2_material_upload", "uploaded", {
      courseId: extractCourseId(folder) || "",
      metadata: {
        fileName: item.name,
        subfolder: item.subfolder,
        objectKey: key,
        size: item.file?.size || 0,
      },
    });
  } catch (e) {
    item.status = "error";
    item.error = e.message || String(e);
  }
  renderEditorialCards();
}

function renderEditorialCards() {
  editFilesEl.innerHTML = "";
  if (editorialFiles.length === 0) {
    editUploadAllBtn.style.display = "none";
    editPublishBtn.style.display = "none";
    return;
  }
  editorialFiles.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "edit-card";

    const fn = document.createElement("div");
    fn.className = "edit-card-filename";
    fn.textContent = item.name;
    card.appendChild(fn);

    const row = document.createElement("div");
    row.className = "edit-card-row";

    const cls = classifyMaterial(item.name);
    const titleLabel = document.createElement("span");
    titleLabel.textContent = cls?.title || item.subfolder;
    titleLabel.style.cssText = `
      font-size:11px;font-weight:600;color:#0d1117;flex:1;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    `;
    row.appendChild(titleLabel);

    const upBtn = document.createElement("button");
    upBtn.className = "edit-card-copy";
    upBtn.style.background = "#F79722";
    upBtn.style.color = "#0d1117";
    if (item.status === "uploading")    { upBtn.textContent = "…";          upBtn.disabled = true; }
    else if (item.status === "exists") { upBtn.textContent = "✓ Já no R2"; upBtn.style.background = "#3D6CE2"; upBtn.style.color = "#fff"; upBtn.disabled = true; }
    else if (item.status === "done")   { upBtn.textContent = "✓ Enviado";  upBtn.style.background = "#56A145"; upBtn.style.color = "#fff"; }
    else if (item.status === "error")  { upBtn.textContent = "Tentar";     upBtn.style.background = "#CA3328"; upBtn.style.color = "#fff"; }
    else upBtn.textContent = "Upload";
    upBtn.addEventListener("click", () => uploadEditorialItem(idx));
    row.appendChild(upBtn);

    const url = buildEditorialUrl(editFolderInput.value, item.subfolder, item.name);
    const pubBtn = document.createElement("button");
    pubBtn.className = "edit-card-copy";
    pubBtn.style.background = "#9761FF";
    pubBtn.style.color = "#fff";
    if (item.pubStatus === "publishing") { pubBtn.textContent = "…"; pubBtn.disabled = true; }
    else if (item.pubStatus === "done") { pubBtn.textContent = "✓ Pub"; pubBtn.style.background = "#56A145"; }
    else if (item.pubStatus === "error") { pubBtn.textContent = "Tentar"; pubBtn.style.background = "#CA3328"; }
    else pubBtn.textContent = "Publicar";
    pubBtn.addEventListener("click", () => publishEditorialItem(idx));
    row.appendChild(pubBtn);

    const rm = document.createElement("button");
    rm.className = "edit-card-remove";
    rm.textContent = "×";
    rm.title = "Remover";
    rm.addEventListener("click", () => {
      editorialFiles.splice(idx, 1);
      renderEditorialCards();
    });
    row.appendChild(rm);

    card.appendChild(row);

    const urlEl = document.createElement("div");
    urlEl.className = "edit-card-url";
    urlEl.textContent = url || "(informe a pasta do curso acima)";
    card.appendChild(urlEl);

    if (item.status === "error" && item.error) {
      const errEl = document.createElement("div");
      errEl.style.cssText = "font-size:10px;color:#CA3328;word-break:break-all;";
      errEl.textContent = "Erro: " + item.error;
      card.appendChild(errEl);
    }

    editFilesEl.appendChild(card);
  });
  editUploadAllBtn.style.display = "";
  editPublishBtn.style.display = "";
}

// ---------- Publicar materiais nas aulas (admin Alura) ----------
function classifyMaterial(name) {
  const up = name.toUpperCase();
  const isProf = /PROF/.test(up);
  const isAluno = /ALUNO/.test(up);
  // Produto novo: "plano-de-aula-NN-..." e "slide-NN-..." (sem PROF/ALUNO)
  if (/^PLANO-DE-AULA-/.test(up)) return { title: "Plano de aula", role: "TEACHER" };
  if (/^SLIDES?-\d/.test(up) && !isProf && !isAluno) return { title: "Slides", role: "TEACHER" };
  // Produto antigo
  if (up.includes("SLIDE") && isProf) return { title: "Guia do professor", role: "TEACHER" };
  if (up.includes("SLIDE") && isAluno) return { title: "Slides - Estudantes", role: "ALL_USERS" };
  if ((up.includes("EXERCICIO") || up.includes("EXERCÍCIO")) && isProf) return { title: "Gabarito do professor", role: "TEACHER" };
  if ((up.includes("EXERCICIO") || up.includes("EXERCÍCIO")) && isAluno) return { title: "Lista de exercícios", role: "ALL_USERS" };
  if (up.includes("DESAFIO")) return { title: "Desafio comentado - Professor", role: "TEACHER" };
  return null;
}

function logPublish(msg) {
  editPublishLog.textContent += msg + "\n";
  editPublishLog.scrollTop = editPublishLog.scrollHeight;
}

async function fetchSectionsMap(courseId) {
  const res = await fetch(`https://cursos.alura.com.br/admin/courses/v2/${courseId}/sections`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Falha ao listar sections: ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const map = {}; // aulaNumber -> sectionId
  doc.querySelectorAll("tbody tr[id]").forEach(tr => {
    const sectionId = tr.id;
    const tds = tr.querySelectorAll("td");
    if (tds.length >= 2) {
      const n = parseInt(tds[1].textContent.trim(), 10);
      if (!isNaN(n)) map[n] = sectionId;
    }
  });
  return map;
}

async function openAluraTab(url, timeoutMs = 20000) {
  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout ao carregar " + url)), timeoutMs);
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
  return tabId;
}

async function publishMaterialsForSection(courseId, sectionId, materials) {
  const editUrl = `https://cursos.alura.com.br/admin/courses/v2/${courseId}/sections/${sectionId}`;
  const tabId = await openAluraTab(editUrl);
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [materials],
      func: async (materials) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const setNative = (el, value) => {
          const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
          setter.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };

        const addBtn = document.querySelector("#addNewSupportMaterial");
        if (!addBtn) return { ok: false, error: "Botão #addNewSupportMaterial não encontrado." };

        // Conta quantas linhas já existem na lista de novos materiais (geralmente 0)
        const listSel = ".support-material-list";
        const listEl = document.querySelector(listSel);
        if (!listEl) return { ok: false, error: "Div .support-material-list não encontrada." };
        const startCount = listEl.querySelectorAll(".row").length;

        for (let i = 0; i < materials.length; i++) {
          addBtn.click();
          await sleep(150);
        }

        // Aguarda as linhas aparecerem
        let tries = 0;
        while (listEl.querySelectorAll(".row").length < startCount + materials.length && tries++ < 30) {
          await sleep(100);
        }

        const rows = [...listEl.querySelectorAll(".row")].slice(startCount);
        if (rows.length !== materials.length) {
          return { ok: false, error: `Esperava ${materials.length} linhas novas, achou ${rows.length}.` };
        }

        materials.forEach((m, i) => {
          const row = rows[i];
          const titleEl = row.querySelector('input[name$=".title"]');
          const linkEl = row.querySelector('input[name$=".link"]');
          const roleEl = row.querySelector('select[name$=".userAccessRole"]');
          if (!titleEl || !linkEl || !roleEl) throw new Error(`Campos não encontrados na linha ${i}`);
          setNative(titleEl, m.title);
          setNative(linkEl, m.link);
          setNative(roleEl, m.role);
        });

        await sleep(300);

        // Submete o form nativo (mesmo mecanismo que o botão Salvar da página usa)
        const form = addBtn.closest("form") || document.querySelector("form");
        if (!form) return { ok: false, error: "Form não encontrado." };
        const submitBtn =
          form.querySelector("#submit-form__button") ||
          form.querySelector("button[type='submit']") ||
          form.querySelector("input[type='submit']");
        if (!submitBtn) return { ok: false, error: "Botão salvar não encontrado." };
        submitBtn.click();

        return { ok: true, added: materials.length };
      },
    });
    const r = results?.[0]?.result;
    if (!r?.ok) throw new Error(r?.error || "Falha ao injetar materiais.");
    // Aguarda a submissão terminar (redirect/reload)
    await new Promise(res => setTimeout(res, 2500));
  } finally {
    chrome.tabs.remove(tabId).catch(() => {});
  }
}

if (editPublishBtn) {
  editPublishBtn.addEventListener("click", async () => {
    const folder = editFolderInput.value.trim();
    const courseId = extractCourseId(folder);
    if (!courseId) { editGlobalStatus.textContent = "Pasta sem ID de curso (prefixo numérico)."; return; }
    if (!editorialFiles.length) return;

    editPublishBtn.disabled = true;
    editPublishLog.textContent = "";
    logPublish(`Buscando sections do curso ${courseId}…`);

    let sectionsMap;
    try {
      sectionsMap = await fetchSectionsMap(courseId);
    } catch (e) {
      logPublish(`ERRO: ${e.message}`);
      editPublishBtn.disabled = false;
      return;
    }
    logPublish(`${Object.keys(sectionsMap).length} aulas encontradas.`);

    // Agrupa materiais por número de aula
    const byAula = {};
    for (const item of editorialFiles) {
      const aula = extractAulaNumber(item.name);
      if (aula === 9999) { logPublish(`Ignorado (sem AULA##): ${item.name}`); continue; }
      const cls = classifyMaterial(item.name);
      if (!cls) { logPublish(`Ignorado (padrão não reconhecido): ${item.name}`); continue; }
      const link = buildEditorialUrl(folder, item.subfolder, item.name);
      (byAula[aula] ||= []).push({ ...cls, link });
    }
    if (!Object.keys(byAula).length) {
      logPublish("Nenhum material válido encontrado.");
      editPublishBtn.disabled = false;
      return;
    }

    // Busca materiais já publicados por seção para evitar duplicatas
    logPublish("Verificando materiais já publicados…");
    const existingBySection = {};
    const aulasParaVerificar = Object.keys(byAula).map(Number);
    await Promise.all(aulasParaVerificar.map(async aula => {
      const sectionId = sectionsMap[aula];
      if (!sectionId) return;
      try {
        const existing = await fetchSectionMaterials(courseId, sectionId);
        existingBySection[sectionId] = new Set(existing.map(m => m.title.trim().toLowerCase()));
      } catch (_) {
        existingBySection[sectionId] = new Set();
      }
    }));

    let okCount = 0, failCount = 0, skipCount = 0;
    const aulasOrdenadas = Object.keys(byAula).sort((a, b) => +a - +b).map(s => parseInt(s, 10));
    const queue = [...aulasOrdenadas];

    const CONCURRENCY = 4;
    const worker = async () => {
      while (queue.length > 0) {
        const aula = queue.shift();
        const sectionId = sectionsMap[aula];
        const mats = byAula[aula];
        if (!sectionId) {
          logPublish(`Aula ${aula}: section não encontrada — pulado (${mats.length} materiais).`);
          failCount++;
          continue;
        }

        const existingTitles = existingBySection[sectionId] || new Set();
        const novos = mats.filter(m => !existingTitles.has(m.title.trim().toLowerCase()));
        const duplicados = mats.filter(m => existingTitles.has(m.title.trim().toLowerCase()));

        duplicados.forEach(m => {
          logPublish(`Aula ${aula}: pulado (já existe) — ${m.title}`);
          skipCount++;
        });

        if (novos.length === 0) { logPublish(`Aula ${aula}: nada novo para publicar.`); continue; }

        logPublish(`Aula ${aula} (section ${sectionId}): publicando ${novos.length} material(is)…`);
        try {
          await publishMaterialsForSection(courseId, sectionId, novos);
          logPublish(`Aula ${aula}: OK`);
          okCount++;
        } catch (e) {
          logPublish(`Aula ${aula}: ERRO — ${e.message}`);
          failCount++;
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    logPublish(`\nConcluído: ${okCount} aula(s) OK, ${skipCount} material(is) ignorado(s) por duplicata, ${failCount} com erro.`);
    if (okCount > 0) {
      await logFeatureUsage("activity_published", "batch_editorial_published", {
        courseId,
        count: okCount,
        metadata: { okCount, skipCount, failCount },
      });
    }
    editPublishBtn.disabled = false;
  });
}

if (editUploadAllBtn) {
  editUploadAllBtn.addEventListener("click", async () => {
    const folder = editFolderInput.value.trim();
    if (!folder) { editGlobalStatus.textContent = "Informe a pasta do curso."; return; }
    const { r2AccessKey, r2SecretKey } = await chrome.storage.local.get(["r2AccessKey", "r2SecretKey"]);
    if (!r2AccessKey || !r2SecretKey) {
      editGlobalStatus.textContent = "Configure as credenciais R2 na aba Ferramentas.";
      return;
    }
    editUploadAllBtn.disabled = true;
    let done = 0, fail = 0;
    const CONCURRENCY = 4;
    const pending = editorialFiles.map((f, i) => i).filter(i => editorialFiles[i].status !== "done" && editorialFiles[i].status !== "exists");
    const total = editorialFiles.length;
    editGlobalStatus.textContent = `Enviando 0/${pending.length}…`;

    const queue = [...pending];
    const worker = async () => {
      while (queue.length > 0) {
        const i = queue.shift();
        await uploadEditorialItem(i);
        if (editorialFiles[i].status === "done") done++;
        else fail++;
        editGlobalStatus.textContent = `Enviando ${done + fail}/${pending.length}…`;
        renderEditorialCards();
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    editUploadAllBtn.disabled = false;
    editGlobalStatus.textContent = `Concluído: ${done} ok, ${fail} com erro.`;
  });
}

function extractAulaNumber(name) {
  // Produto antigo: "..._AULA01_..."
  let m = name.match(/AULA\s*0*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  // Produto novo: "plano-de-aula-NN-..." ou "slide-NN-..."
  m = name.match(/^(?:plano-de-aula|slides?)-0*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return 9999;
}

const SUBFOLDER_ORDER = { "Slides": 0, "plano-de-aula": 1, "Exercicios": 2, "Desafios": 3 };

function sortEditorialFiles() {
  editorialFiles.sort((a, b) => {
    const aa = extractAulaNumber(a.name);
    const bb = extractAulaNumber(b.name);
    if (aa !== bb) return aa - bb;
    const sa = SUBFOLDER_ORDER[a.subfolder] ?? 99;
    const sb = SUBFOLDER_ORDER[b.subfolder] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
}

function addEditorialFiles(fileList) {
  let detectedRoot = "";
  for (const f of fileList) {
    const relPath = f.webkitRelativePath || "";
    if (relPath && !detectedRoot) { detectedRoot = relPath.split("/")[0]; break; }
  }
  if (detectedRoot) {
    const normalized = normalizeCourseFolder(detectedRoot);
    if (normalized && normalized !== editFolderInput.value.trim()) {
      editorialFiles = [];
    }
  }
  for (const f of fileList) {
    if (!/\.pdf$/i.test(f.name)) continue;
    const relPath = f.webkitRelativePath || "";
    if (editorialFiles.some(x => x.name === f.name && x.relPath === relPath)) continue;
    editorialFiles.push({
      name: f.name,
      relPath,
      subfolder: detectSubfolder(f.name, relPath),
      file: f,
      status: "idle", // idle | uploading | done | error
      error: "",
    });
  }
  sortEditorialFiles();
  if (detectedRoot) {
    const normalized = normalizeCourseFolder(detectedRoot);
    if (normalized && normalized !== editFolderInput.value.trim()) {
      editFolderInput.value = normalized;
      chrome.storage.local.set({ [EDIT_FOLDER_KEY]: normalized });
      editCourseIdLabel.textContent = extractCourseId(normalized) || "-";
    }
  }
  renderEditorialCards();
  checkExistingR2Files();
}

async function checkExistingR2Files() {
  const folder = editFolderInput.value.trim();
  if (!folder) return;
  const { r2AccessKey, r2SecretKey } = await chrome.storage.local.get(["r2AccessKey", "r2SecretKey"]);
  if (!r2AccessKey || !r2SecretKey) return;

  const CONCURRENCY = 4;
  const toCheck = editorialFiles.filter(f => f.status === "idle");
  const queue = [...toCheck];

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item.status !== "idle") continue;
      try {
        const key = buildObjectKey(folder, item.subfolder, item.name);
        const { url, headers } = await signR2Request({
          method: "HEAD", key, body: new ArrayBuffer(0), accessKey: r2AccessKey, secretKey: r2SecretKey,
        });
        const res = await fetch(url, { method: "HEAD", headers });
        if (res.ok) item.status = "exists";
      } catch (_) {}
      renderEditorialCards();
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

editFileInput.addEventListener("change", e => {
  addEditorialFiles(e.target.files);
  editFileInput.value = "";
});

async function collectFilesFromEntry(entry, out) {
  if (entry.isFile) {
    await new Promise(res => entry.file(f => {
      try { Object.defineProperty(f, "webkitRelativePath", { value: entry.fullPath.replace(/^\//, "") }); } catch {}
      out.push(f);
      res();
    }));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await new Promise(res => reader.readEntries(res));
    for (const e of entries) await collectFilesFromEntry(e, out);
  }
}

editDropArea.addEventListener("dragover", e => {
  e.preventDefault();
  editDropArea.classList.add("drag-over");
});
editDropArea.addEventListener("dragleave", () => editDropArea.classList.remove("drag-over"));
editDropArea.addEventListener("drop", async e => {
  e.preventDefault();
  editDropArea.classList.remove("drag-over");
  const items = e.dataTransfer.items;
  if (items && items.length && items[0].webkitGetAsEntry) {
    const collected = [];
    for (const it of items) {
      const entry = it.webkitGetAsEntry();
      if (entry) await collectFilesFromEntry(entry, collected);
    }
    addEditorialFiles(collected);
  } else if (e.dataTransfer.files?.length) {
    addEditorialFiles(e.dataTransfer.files);
  }
});

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
  // Desembrulha linhas 100% em negrito (ex.: "**Aula 1**", "**Para saber mais...!**")
  text = text.replace(/^\*\*(.+?)\*\*\s*$/gm, "$1");
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

// Parseia word/numbering.xml em um mapa: numId -> ilvl -> numFmt
// numFmt ex.: "bullet", "decimal", "lowerLetter", "upperLetter", "lowerRoman"…
function parseNumberingXml(xml) {
  if (!xml) return {};
  // Passo 1: abstractNumId -> { ilvl -> numFmt }
  const abstractMap = {};
  const absRe = /<w:abstractNum[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g;
  let m;
  while ((m = absRe.exec(xml))) {
    const absId = m[1];
    const body = m[2];
    const levels = {};
    const lvlRe = /<w:lvl[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g;
    let lm;
    while ((lm = lvlRe.exec(body))) {
      const ilvl = lm[1];
      const fmtM = lm[2].match(/<w:numFmt[^>]*w:val="([^"]+)"/);
      levels[ilvl] = fmtM?.[1] || "decimal";
    }
    abstractMap[absId] = levels;
  }
  // Passo 2: numId -> abstractNumId -> levels
  const numMap = {};
  const numRe = /<w:num\s[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g;
  while ((m = numRe.exec(xml))) {
    const numId = m[1];
    const absIdM = m[2].match(/<w:abstractNumId[^>]*w:val="(\d+)"/);
    const absId = absIdM?.[1];
    if (absId && abstractMap[absId]) numMap[numId] = abstractMap[absId];
  }
  return numMap;
}

// Extrai texto de um parágrafo processando runs (<w:r>) e aplicando Markdown
// para negrito (**...**) e itálico (*...*).
function extractParagraphText(body) {
  const segments = [];
  let pos = 0;

  while (pos < body.length) {
    const rOpen = body.indexOf("<w:r", pos);
    if (rOpen < 0) break;
    // garante <w:r> ou <w:r ...>, não <w:rPr> nem <w:rFonts>
    const nextCh = body[rOpen + 4];
    if (nextCh !== ">" && nextCh !== " " && nextCh !== "/") { pos = rOpen + 4; continue; }

    const rTagClose = body.indexOf(">", rOpen);
    if (rTagClose < 0) break;
    if (body[rTagClose - 1] === "/") { pos = rTagClose + 1; continue; }

    const rClose = body.indexOf("</w:r>", rTagClose + 1);
    if (rClose < 0) break;
    const runBody = body.slice(rTagClose + 1, rClose);

    // Propriedades do run
    let bold = false, italic = false;
    const rPrStart = runBody.indexOf("<w:rPr>");
    const rPrEnd   = runBody.indexOf("</w:rPr>");
    if (rPrStart >= 0 && rPrEnd > rPrStart) {
      const rPr = runBody.slice(rPrStart + 7, rPrEnd);
      const hasB = /<w:b(?:\s[^>]*)?\/?>/.test(rPr) && !/<w:b[^>]*w:val="(0|false)"/.test(rPr);
      const hasI = /<w:i(?:\s[^>]*)?\/?>/.test(rPr) && !/<w:i[^>]*w:val="(0|false)"/.test(rPr);
      bold = hasB;
      italic = hasI;
    }

    // Extrai texto de <w:t>...</w:t> dentro do run
    let text = "";
    let tpos = 0;
    while (tpos < runBody.length) {
      const tOpen = runBody.indexOf("<w:t", tpos);
      if (tOpen < 0) break;
      const nCh = runBody[tOpen + 4];
      // <w:t> precisa ser seguido por >, espaço ou /
      if (nCh !== ">" && nCh !== " " && nCh !== "/") { tpos = tOpen + 4; continue; }
      const tTagClose = runBody.indexOf(">", tOpen);
      if (tTagClose < 0) break;
      if (runBody[tTagClose - 1] === "/") { tpos = tTagClose + 1; continue; }
      const tEnd = runBody.indexOf("</w:t>", tTagClose + 1);
      if (tEnd < 0) break;
      text += runBody.slice(tTagClose + 1, tEnd);
      tpos = tEnd + 6;
    }

    if (text) segments.push({ bold, italic, text });
    pos = rClose + 6;
  }

  // Mescla segmentos adjacentes com mesmo estilo (Word frequentemente quebra
  // palavras em vários runs; sem mesclar sairia **Pal****avra**).
  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.bold === seg.bold && last.italic === seg.italic) {
      last.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  // Emite com Markdown, puxando espaços nas bordas pra fora dos marcadores
  // (Markdown não renderiza "** foo **").
  let out = "";
  for (const seg of merged) {
    if (!seg.text) continue;
    if (!seg.bold && !seg.italic) { out += seg.text; continue; }
    const match = seg.text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const lead = match[1], core = match[2], trail = match[3];
    if (!core) { out += seg.text; continue; }
    let wrapped = core;
    if (seg.italic) wrapped = "*" + wrapped + "*";
    if (seg.bold)   wrapped = "**" + wrapped + "**";
    out += lead + wrapped + trail;
  }
  return out;
}

// Converte word/document.xml em texto Markdown, preservando numeração de listas,
// bullets e formatação inline (negrito/itálico).
function parseDocumentXml(xml, numFormats = {}) {
  const listCounters = {};
  const paragraphs = [];
  let pos = 0;

  while (pos < xml.length) {
    const pOpen = xml.indexOf("<w:p", pos);
    if (pOpen < 0) break;
    const nCh = xml[pOpen + 4];
    if (nCh !== ">" && nCh !== " " && nCh !== "/") { pos = pOpen + 4; continue; }

    const tagClose = xml.indexOf(">", pOpen);
    if (tagClose < 0) break;
    if (xml[tagClose - 1] === "/") { paragraphs.push(""); pos = tagClose + 1; continue; }

    const pClose = xml.indexOf("</w:p>", tagClose + 1);
    if (pClose < 0) break;
    const body = xml.slice(tagClose + 1, pClose);

    // Prefixo de lista (numerada/bullet) via numPr + numbering.xml
    let prefix = "";
    const numPrStart = body.indexOf("<w:numPr>");
    const numPrEnd   = body.indexOf("</w:numPr>");
    if (numPrStart >= 0 && numPrEnd > numPrStart) {
      const numPrBody = body.slice(numPrStart + 9, numPrEnd);
      const numIdM = numPrBody.match(/<w:numId w:val="(\d+)"/);
      const ilvlM  = numPrBody.match(/<w:ilvl w:val="(\d+)"/);
      const numId  = numIdM?.[1] ?? "0";
      const ilvl   = ilvlM?.[1]  ?? "0";
      const key    = `${numId}:${ilvl}`;
      const fmt    = numFormats[numId]?.[ilvl] || "decimal";
      const indent = "  ".repeat(+ilvl);
      if (fmt === "bullet") {
        prefix = indent + "- ";
      } else {
        listCounters[key] = (listCounters[key] ?? 0) + 1;
        prefix = indent + listCounters[key] + ". ";
      }
    }

    const text = extractParagraphText(body);
    paragraphs.push(prefix + text);
    pos = pClose + 6;
  }

  // Colapsa pares de marcadores colados que surgem quando o autor digitou
  // **texto** no Word E também marcou o trecho como negrito: vira ****texto****.
  // `****` (negrito-abre + negrito-fecha sem conteúdo) → `**`.
  return decodeXmlEntities(paragraphs.join("\n"))
    .replace(/\*{4,}/g, "**")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readDocxAsText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const xml = await extractZipEntry(bytes, "word/document.xml");
  if (!xml) return null;
  const numberingXml = await extractZipEntry(bytes, "word/numbering.xml");
  const numFormats = parseNumberingXml(numberingXml);
  return parseDocumentXml(xml, numFormats);
}

function parseDocumentXmlStructured(xml, numFormats = {}) {
  const listCounters = {};
  const rows = [];
  let pos = 0;

  while (pos < xml.length) {
    const pOpen = xml.indexOf("<w:p", pos);
    if (pOpen < 0) break;
    const nCh = xml[pOpen + 4];
    if (nCh !== ">" && nCh !== " " && nCh !== "/") { pos = pOpen + 4; continue; }

    const tagClose = xml.indexOf(">", pOpen);
    if (tagClose < 0) break;
    if (xml[tagClose - 1] === "/") { rows.push({ style: "", text: "" }); pos = tagClose + 1; continue; }

    const pClose = xml.indexOf("</w:p>", tagClose + 1);
    if (pClose < 0) break;
    const body = xml.slice(tagClose + 1, pClose);

    const styleM = body.match(/<w:pStyle[^>]*w:val="([^"]+)"/);
    const style = styleM?.[1] || "";

    let prefix = "";
    const numPrStart = body.indexOf("<w:numPr>");
    const numPrEnd   = body.indexOf("</w:numPr>");
    if (numPrStart >= 0 && numPrEnd > numPrStart) {
      const numPrBody = body.slice(numPrStart + 9, numPrEnd);
      const numIdM = numPrBody.match(/<w:numId w:val="(\d+)"/);
      const ilvlM  = numPrBody.match(/<w:ilvl w:val="(\d+)"/);
      const numId  = numIdM?.[1] ?? "0";
      const ilvl   = ilvlM?.[1]  ?? "0";
      const key    = `${numId}:${ilvl}`;
      const fmt    = numFormats[numId]?.[ilvl] || "decimal";
      const indent = "  ".repeat(+ilvl);
      if (fmt === "bullet") {
        prefix = indent + "- ";
      } else {
        listCounters[key] = (listCounters[key] ?? 0) + 1;
        prefix = indent + listCounters[key] + ". ";
      }
    }

    const rawText = extractParagraphText(body).replace(/\*{4,}/g, "**");
    const text = decodeXmlEntities(prefix + rawText).trimEnd();
    rows.push({ style, text });
    pos = pClose + 6;
  }
  return rows;
}

async function readDocxStructured(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const xml = await extractZipEntry(bytes, "word/document.xml");
  if (!xml) return null;
  const numberingXml = await extractZipEntry(bytes, "word/numbering.xml");
  const numFormats = parseNumberingXml(numberingXml);
  return parseDocumentXmlStructured(xml, numFormats);
}

// ---------- Publicação: Imagens (upload em lote no R2) ----------
const IMG_BASE_URL = "http://cdn3.gnarususercontent.com.br/start-content";
const IMG_R2_PREFIX = "start-content";

// Reescreve links de imagem em markdown `![alt](arquivo.png)` para a URL do CDN.
// Também reconhece o formato sem parênteses que o Word exporta: `![alt] aula1-FCF-09`
// — nesse caso, resolve a extensão via mapa de stems (nome sem extensão → nome real)
// vindo das imagens já subidas para o curso.
const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)([?#].*)?$/i;
const IMG_EXT_STRIP_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function escapeHtmlAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanImageAltText(alt) {
  return String(alt ?? "")
    .replace(/&quot;|&#34;|&#x22;/gi, "")
    .replace(/["\u201c\u201d]/g, "");
}

function buildImageHtmlTag(src, alt = "") {
  const safeSrc = escapeHtmlAttr(src);
  const safeAlt = escapeHtmlAttr(cleanImageAltText(alt));
  return `<img src="${safeSrc}" alt="${safeAlt}" width="100%" style="height: auto;">`;
}

function cleanImageToken(raw) {
  let token = String(raw ?? "").trim();
  if (token.startsWith("<") && token.endsWith(">")) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

function filenameFromImageToken(token) {
  const cleanToken = cleanImageToken(token);
  if (!cleanToken) return "";
  const withoutQuery = cleanToken.split("?")[0].split("#")[0];
  return withoutQuery.split(/[\\/]/).pop() || "";
}

function buildImageCdnUrl(courseId, filename) {
  return `${IMG_BASE_URL}/${courseId}-imagens/${filename}`;
}

function resolveImageSrc(rawToken, courseId, stemMap) {
  const token = cleanImageToken(rawToken);
  if (!token) return "";

  if (/^https?:\/\//i.test(token)) {
    if (!IMG_EXT_RE.test(token)) return "";
    if (token.startsWith(IMG_BASE_URL + "/")) return token;
    const filename = filenameFromImageToken(token);
    return filename ? buildImageCdnUrl(courseId, filename) : "";
  }

  const filename = filenameFromImageToken(token);
  if (!filename) return "";

  if (IMG_EXT_RE.test(filename)) {
    return buildImageCdnUrl(courseId, filename);
  }

  const resolved = stemMap?.[filename] || stemMap?.[filename.replace(IMG_EXT_STRIP_RE, "")];
  return resolved ? buildImageCdnUrl(courseId, resolved) : "";
}

function stemMapFromFilenames(filenames) {
  const map = {};
  for (const n of filenames || []) {
    const stem = n.replace(IMG_EXT_STRIP_RE, "");
    map[stem] = n;
    map[n] = n; // também aceita o nome completo como chave
  }
  return map;
}

async function getImgStemMap(courseId) {
  if (!courseId) return {};
  const key = `imgStems_${courseId}`;
  const r = await chrome.storage.local.get([key]);
  return stemMapFromFilenames(r[key] || []);
}

function rewriteImageLinksLegacy(text, courseId, stemMap) {
  if (!text || !courseId) return text;

  // Caso 1: `![alt](url ou nome.ext)` com parenteses.
  text = text.replace(/(!\[[^\]]*\]\()\s*([^)\s]+)\s*(\))/g, (m, pre, url, post) => {
    if (/^https?:\/\//i.test(url)) {
      if (!IMG_EXT_RE.test(url)) return m;
      if (url.startsWith(IMG_BASE_URL + "/")) return m;
      const filename = url.split("?")[0].split("#")[0].split("/").pop();
      if (!filename) return m;
      return `${pre}${IMG_BASE_URL}/${courseId}-imagens/${filename}${post}`;
    }
    const token = url.split(/[\\/]/).pop();
    if (!token) return m;
    if (IMG_EXT_RE.test(token)) {
      return `${pre}${IMG_BASE_URL}/${courseId}-imagens/${token}${post}`;
    }
    // Sem extensão — tenta resolver pelo stemMap
    if (stemMap && stemMap[token]) {
      return `${pre}${IMG_BASE_URL}/${courseId}-imagens/${stemMap[token]}${post}`;
    }
    return m;
  });

  // Caso 2: `![alt]<espaço|quebra>arquivo` (sem parênteses — formato exportado do Word)
  // Se o token já tem extensão de imagem, reescreve direto.
  // Senão, tenta resolver pelo stemMap (nomes das imagens subidas).
  text = text.replace(/!\[([^\]]*)\][ \t]*\n?[ \t]*([A-Za-z0-9][A-Za-z0-9_.\-]*)/g, (m, alt, token) => {
    if (IMG_EXT_RE.test(token)) {
      return `![${alt}](${IMG_BASE_URL}/${courseId}-imagens/${token})`;
    }
    if (stemMap && (stemMap[token] || stemMap[token.replace(IMG_EXT_STRIP_RE, "")])) {
      const fn = stemMap[token] || stemMap[token.replace(IMG_EXT_STRIP_RE, "")];
      return `![${alt}](${IMG_BASE_URL}/${courseId}-imagens/${fn})`;
    }
    return m;
  });

  return text;
}

function rewriteImageMarkdownAsHtml(text, courseId, stemMap) {
  if (!text || !courseId) return text;

  // Caso 1: `![alt](url ou nome.ext)`
  text = text.replace(/!\[([^\]]*)\]\(\s*([^)]+?)\s*\)/g, (m, alt, token) => {
    const src = resolveImageSrc(token, courseId, stemMap);
    return src ? buildImageHtmlTag(src, alt) : m;
  });

  // Caso 2: `![alt]<espaco|quebra>arquivo.ext` sem parenteses.
  // Captura ate a extensao para aceitar nomes com espaco sem engolir o resto do paragrafo.
  text = text.replace(/!\[([^\]]*)\][ \t]*(?:\n[ \t]*)?([^\n]*?\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:[?#][^ \t\n]*)?)/gi, (m, alt, token) => {
    const src = resolveImageSrc(token, courseId, stemMap);
    return src ? buildImageHtmlTag(src, alt) : m;
  });

  // Caso 3: `![alt]<espaco|quebra>arquivo` sem extensao.
  // So substitui quando o stem existe no cache das imagens do curso.
  text = text.replace(/!\[([^\]]*)\][ \t]*(?:\n[ \t]*)?([A-Za-z0-9][A-Za-z0-9_.\-]*)/g, (m, alt, token) => {
    const src = resolveImageSrc(token, courseId, stemMap);
    return src ? buildImageHtmlTag(src, alt) : m;
  });

  return text;
}

async function rewriteImagesDeepAsync(value, courseId) {
  const stemMap = await getImgStemMap(courseId);
  function walk(v) {
    if (typeof v === "string") return rewriteImageMarkdownAsHtml(v, courseId, stemMap);
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = walk(v[i]); return v; }
    if (v && typeof v === "object") {
      for (const k of Object.keys(v)) v[k] = walk(v[k]);
      return v;
    }
    return v;
  }
  return walk(value);
}

// Mantém versão sync por compatibilidade (sem stemMap → só caso 1 com extensão)
function rewriteImagesDeep(value, courseId) {
  if (!courseId) return value;
  if (typeof value === "string") return rewriteImageMarkdownAsHtml(value, courseId, null);
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = rewriteImagesDeep(value[i], courseId); return value; }
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) value[k] = rewriteImagesDeep(value[k], courseId);
    return value;
  }
  return value;
}

const imgFileInput    = document.getElementById("img-file-input");
const imgDropArea     = document.getElementById("img-drop-area");
const imgCourseInfo   = document.getElementById("img-course-info");
const imgCourseIdDisp = document.getElementById("img-course-id-display");
const imgFileCount    = document.getElementById("img-file-count");
const imgFilesEl      = document.getElementById("img-files");
const imgUploadAllBtn = document.getElementById("img-upload-all-btn");
const imgGlobalStatus = document.getElementById("img-global-status");

let imgFiles = [];    // [{ file, name, status, error, url }]
let imgCourseId = "";

function extractIdFromFolderName(folderName) {
  const m = (folderName || "").match(/^\s*\[?\s*(\d+)\s*\]?/);
  return m ? m[1] : "";
}

function getImgCourseIdFromFiles(fileList) {
  // webkitRelativePath: "[4761] imagens/aula4-FCF-11.png"
  for (const f of fileList) {
    const rel = f.webkitRelativePath || "";
    const top = rel.split("/")[0];
    const id = extractIdFromFolderName(top);
    if (id) return id;
  }
  return "";
}

function buildImgObjectKey(courseId, filename) {
  return `${IMG_R2_PREFIX}/${courseId}-imagens/${filename}`;
}

function buildImgUrl(courseId, filename) {
  return `${IMG_BASE_URL}/${courseId}-imagens/${filename}`;
}

function handleImgFileList(fileList) {
  const arr = [...fileList].filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name));
  if (arr.length === 0) {
    imgGlobalStatus.textContent = "Nenhuma imagem encontrada na pasta.";
    return;
  }
  imgCourseId = getImgCourseIdFromFiles(arr);
  imgFiles = arr.map(f => ({ file: f, name: f.name, status: "pending", error: "", url: "" }));
  if (imgCourseId) {
    chrome.storage.local.set({ [`imgStems_${imgCourseId}`]: imgFiles.map(f => f.name) });
  }
  imgCourseIdDisp.textContent = imgCourseId || "(não encontrado — a pasta precisa começar com [ID])";
  imgFileCount.textContent = `${imgFiles.length} imagem(ns)`;
  imgCourseInfo.style.display = "";
  imgGlobalStatus.textContent = "";
  renderImgCards();
  checkExistingImgFiles();
}

async function checkExistingImgFiles() {
  if (!imgCourseId) return;
  const { r2AccessKey, r2SecretKey } = await chrome.storage.local.get(["r2AccessKey", "r2SecretKey"]);
  if (!r2AccessKey || !r2SecretKey) return;

  const CONCURRENCY = 4;
  const queue = imgFiles.filter(f => f.status === "pending");

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item.status !== "pending") continue;
      try {
        const key = buildImgObjectKey(imgCourseId, item.name);
        const { url, headers } = await signR2Request({
          method: "HEAD", key, body: new ArrayBuffer(0), accessKey: r2AccessKey, secretKey: r2SecretKey,
        });
        const res = await fetch(url, { method: "HEAD", headers });
        if (res.ok) {
          item.status = "exists";
          item.url = buildImgUrl(imgCourseId, item.name);
          renderImgCards();
        }
      } catch (_) {}
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

async function uploadImgItem(idx) {
  const item = imgFiles[idx];
  if (!imgCourseId) { imgGlobalStatus.textContent = "Pasta sem ID de curso."; return; }
  const { r2AccessKey, r2SecretKey } = await chrome.storage.local.get(["r2AccessKey", "r2SecretKey"]);
  if (!r2AccessKey || !r2SecretKey) {
    imgGlobalStatus.textContent = "Configure as credenciais R2 na aba Ferramentas.";
    return;
  }
  item.status = "uploading";
  item.error = "";
  renderImgCards();
  try {
    const key = buildImgObjectKey(imgCourseId, item.name);
    await uploadToR2(item.file, key, r2AccessKey, r2SecretKey);
    item.status = "done";
    item.url = buildImgUrl(imgCourseId, item.name);
    await logFeatureUsage("r2_material_upload", "image_uploaded", {
      courseId: imgCourseId,
      metadata: { fileName: item.name, objectKey: key, size: item.file?.size || 0 },
    });
  } catch (e) {
    item.status = "error";
    item.error = e.message || String(e);
  }
  renderImgCards();
}

function renderImgCards() {
  imgFilesEl.innerHTML = "";
  if (imgFiles.length === 0) {
    imgUploadAllBtn.style.display = "none";
    return;
  }
  imgUploadAllBtn.style.display = "";

  imgFiles.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "edit-card";

    const fn = document.createElement("div");
    fn.className = "edit-card-filename";
    fn.textContent = item.name;
    card.appendChild(fn);

    const row = document.createElement("div");
    row.className = "edit-card-row";

    const upBtn = document.createElement("button");
    upBtn.className = "edit-card-copy";
    upBtn.style.background = "#F79722";
    upBtn.style.color = "#0d1117";
    if (item.status === "uploading") { upBtn.textContent = "…"; upBtn.disabled = true; }
    else if (item.status === "done") { upBtn.textContent = "✓ OK"; upBtn.style.background = "#56A145"; upBtn.style.color = "#fff"; }
    else if (item.status === "exists") { upBtn.textContent = "✓ Já no R2"; upBtn.style.background = "#3D6CE2"; upBtn.style.color = "#fff"; upBtn.disabled = true; }
    else if (item.status === "error") { upBtn.textContent = "Tentar"; upBtn.style.background = "#CA3328"; upBtn.style.color = "#fff"; }
    else upBtn.textContent = "Upload";
    upBtn.addEventListener("click", () => uploadImgItem(idx));
    row.appendChild(upBtn);

    const url = item.url || (imgCourseId ? buildImgUrl(imgCourseId, item.name) : "");

    const copyBtn = document.createElement("button");
    copyBtn.className = "edit-card-copy";
    copyBtn.textContent = "Copiar URL";
    copyBtn.addEventListener("click", async () => {
      const url = item.url || (imgCourseId ? buildImgUrl(imgCourseId, item.name) : "");
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
      } catch (_) {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      copyBtn.textContent = "✓ Copiado";
      copyBtn.classList.add("done");
      setTimeout(() => { copyBtn.textContent = "Copiar URL"; copyBtn.classList.remove("done"); }, 1200);
    });
    row.appendChild(copyBtn);

    const rm = document.createElement("button");
    rm.className = "edit-card-remove";
    rm.textContent = "×";
    rm.title = "Remover";
    rm.addEventListener("click", () => {
      imgFiles.splice(idx, 1);
      renderImgCards();
    });
    row.appendChild(rm);

    card.appendChild(row);

    const urlEl = document.createElement("div");
    urlEl.className = "edit-card-url";
    urlEl.textContent = url || "(pasta sem [ID])";
    card.appendChild(urlEl);

    if (item.status === "error" && item.error) {
      const err = document.createElement("div");
      err.style.cssText = "font-size:11px;color:#CA3328;margin-top:4px;";
      err.textContent = item.error;
      card.appendChild(err);
    }

    imgFilesEl.appendChild(card);
  });
}

if (imgFileInput) {
  imgFileInput.addEventListener("change", (e) => handleImgFileList(e.target.files));
}

async function collectFilesFromDataTransfer(dt) {
  const out = [];
  const items = dt.items ? [...dt.items] : [];
  const entries = items.map(it => it.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length === 0) return [...dt.files];

  async function walk(entry, pathPrefix) {
    if (entry.isFile) {
      await new Promise(res => entry.file(f => {
        try { Object.defineProperty(f, "webkitRelativePath", { value: pathPrefix + f.name }); } catch {}
        out.push(f);
        res();
      }));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const children = await new Promise(res => reader.readEntries(res));
      for (const c of children) await walk(c, pathPrefix + entry.name + "/");
    }
  }
  for (const e of entries) await walk(e, "");
  return out;
}

if (imgDropArea) {
  imgDropArea.addEventListener("dragover", (e) => { e.preventDefault(); imgDropArea.classList.add("drag-over"); });
  imgDropArea.addEventListener("dragleave", () => imgDropArea.classList.remove("drag-over"));
  imgDropArea.addEventListener("drop", async (e) => {
    e.preventDefault();
    imgDropArea.classList.remove("drag-over");
    const files = await collectFilesFromDataTransfer(e.dataTransfer);
    handleImgFileList(files);
  });
}

if (imgUploadAllBtn) {
  imgUploadAllBtn.addEventListener("click", async () => {
    if (!imgFiles.length) return;
    imgUploadAllBtn.disabled = true;
    const tasks = imgFiles.map((it, i) => it.status !== "done" ? uploadImgItem(i) : null).filter(Boolean);
    await Promise.allSettled(tasks);
    imgUploadAllBtn.disabled = false;
  });
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
  await rewriteImagesDeepAsync(pubLessons, pubCourseId);
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

// ---------- Glossário: ordena entradas alfabeticamente ----------
function sortGlossarioContent(content) {
  // Separa introdução (texto antes do primeiro **termo**)
  const firstTermIdx = content.search(/^\*\*.+\*\*\s*$/m);
  if (firstTermIdx < 0) return content;

  const intro = content.slice(0, firstTermIdx).trimEnd();
  const body  = content.slice(firstTermIdx);

  // Divide em entradas — cada uma começa com uma linha **termo**
  const entries = body.split(/(?=^\*\*.+\*\*\s*$)/m).map(e => e.trim()).filter(Boolean);

  entries.sort((a, b) => {
    const termA = (a.match(/^\*\*(.+?)\*\*/)?.[1] || a);
    const termB = (b.match(/^\*\*(.+?)\*\*/)?.[1] || b);
    return termA.localeCompare(termB, "pt", { sensitivity: "base" });
  });

  const sorted = entries.join("\n\n");
  return intro ? intro + "\n\n" + sorted : sorted;
}

// ---------- Faça como eu fiz: parsing ----------

// Marcadores de seções — SEM flag 'i': cabeçalhos no doc são CAIXA ALTA,
// evita falso match com nomes de aula em caixa mista ("Preparando o ambiente")
const FEZ_SECTION_MARKERS = [
  { re: /^PREPARANDO\s+O\s+AMBIENTE/m,   type: "PREP",     name: "Preparando o ambiente" },
  { re: /^FA[ÇC]A\s+COMO\s+EU\s+FIZ/m,  type: "FEZ",      name: "Faça como eu fiz" },
  { re: /^Opini[aã]o\s*$/m,             type: "OPINION",  name: "Opinião" },
  { re: /^PARA\s+SABER\s+MAIS/m,         type: "PSM",      name: "Para saber mais" },
  { re: /^Gloss[aá]rio\s*$/m,           type: "GLOSSARIO",name: "Glossário" },
  { re: /^COMPARTILHE\s+SEU\s+PROJETO/m, type: "SKIP",     name: "" },
];

function parseFezDoc(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Desembrulha negrito apenas de linhas que são cabeçalhos/marcadores conhecidos
  // (ex.: "**Aula 1 – ...**", "**PREPARANDO O AMBIENTE**"). Linhas de conteúdo
  // como termos de glossário (**Prototipar**) devem manter o negrito.
  const HEADER_RE = [
    /^Aula\s+\d+/,
    ...FEZ_SECTION_MARKERS.map(m => m.re),
  ];
  text = text.replace(/^\*\*(.+?)\*\*\s*$/gm, (match, inner) =>
    HEADER_RE.some(re => re.test(inner)) ? inner : match
  );
  const lessons = [];

  // Divide no início de cada linha "Aula N"
  const parts = text.split(/(?=^Aula\s+\d+)/m);

  for (const part of parts) {
    // Aceita: "Aula 1 – Nome", "Aula 1 - Nome", "Aula 1Nome" (qualquer separador)
    const lessonMatch = part.match(/^Aula\s+(\d+)(?:\s*[-–—]\s*|\s+)(.+)?/m);
    if (!lessonMatch) continue;

    const lessonNum  = parseInt(lessonMatch[1]);
    const lessonName = (lessonMatch[2] || "").trim();

    // Encontra a PRIMEIRA ocorrência de cada marcador (evita falsos positivos no corpo)
    const found = [];
    for (const marker of FEZ_SECTION_MARKERS) {
      // Usa as flags do próprio regex (sem 'g') — só a primeira ocorrência
      const m = part.match(marker.re);
      if (m) {
        found.push({ type: marker.type, name: marker.name, start: m.index, end: m.index + m[0].length });
      }
    }
    found.sort((a, b) => a.start - b.start);

    // Extrai conteúdo entre marcadores
    const activities = [];
    for (let i = 0; i < found.length; i++) {
      if (found[i].type === "SKIP") continue;

      // Pula até a próxima linha depois do cabeçalho (ex: "PREPARANDO O AMBIENTE\n...")
      const lineEnd      = part.indexOf("\n", found[i].end);
      const contentStart = lineEnd >= 0 ? lineEnd + 1 : found[i].end;
      // Vai até o início do próximo marcador
      const contentEnd   = i + 1 < found.length ? found[i + 1].start : part.length;
      const rawContent   = part.slice(contentStart, contentEnd).trim();

      if (found[i].type === "OPINION") {
        // Anexa à última atividade FEZ como campo "Opinião"
        const lastFez = [...activities].reverse().find(a => a.type === "FEZ");
        if (lastFez) lastFez.opinion = textToMarkdown(rawContent);
      } else {
        const md = textToMarkdown(rawContent);
        activities.push({
          type:    found[i].type,
          name:    found[i].name,
          content: found[i].type === "GLOSSARIO" ? sortGlossarioContent(md) : md,
          opinion: "",
        });
      }
    }

    if (activities.length > 0) {
      lessons.push({ lessonNum, lessonName, activities });
    }
  }
  return lessons;
}

// ---------- Faça como eu fiz: renderização ----------
let fezLessons  = [];
let fezCourseId = "";

function renderFezLessons(lessons, courseId) {
  const container = document.getElementById("fez-lessons");
  if (!container) return;
  container.innerHTML = "";

  lessons.forEach(lesson => {
    const card = document.createElement("div");
    card.className = "pub-lesson-card";

    const header = document.createElement("div");
    header.className = "pub-lesson-header";
    header.innerHTML = `<span class="pub-lesson-num">Aula ${lesson.lessonNum}</span> <span class="pub-lesson-name">${lesson.lessonName}</span>`;
    card.appendChild(header);

    lesson.activities.forEach(act => {
      const actRow = document.createElement("div");
      actRow.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;";

      const actLabel = document.createElement("div");
      actLabel.className = "pub-lesson-activity";
      actLabel.textContent = act.name;
      actLabel.style.flexShrink = "0";

      const btn = document.createElement("button");
      btn.className = "pub-btn";
      btn.textContent = "Publicar";

      const status = document.createElement("div");
      status.className = "pub-lesson-status";

      btn.addEventListener("click", () => publishActivity(act, lesson.lessonNum, courseId, btn, status));

      actRow.appendChild(actLabel);
      actRow.appendChild(btn);
      actRow.appendChild(status);
      card.appendChild(actRow);
    });

    container.appendChild(card);
  });

  const totalActivities = lessons.reduce((s, l) => s + l.activities.length, 0);
  const fezAllBtn = document.getElementById("fez-all-btn");
  if (fezAllBtn) fezAllBtn.style.display = totalActivities > 1 ? "" : "none";
}

async function publishActivity(act, lessonNum, courseId, btn, status) {
  btn.disabled = true;
  status.textContent = "Publicando…";
  status.className = "pub-lesson-status loading";

  try {
    const tab = await getActiveTab();
    const ack = await chrome.tabs.sendMessage(tab.id, {
      type: "ALURA_REVISOR_PUBLISH_ACTIVITY",
      activityType: act.type,
      activityName: act.name,
      courseId,
      lessonNum,
      content: act.content,
      opinion: act.opinion || "",
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

// ---------- Faça como eu fiz: carregar arquivo ----------
const fezFileInput    = document.getElementById("fez-file-input");
const fezDropArea     = document.getElementById("fez-drop-area");
const fezCourseInfo   = document.getElementById("fez-course-info");
const fezCourseIdDisp = document.getElementById("fez-course-id-display");
const fezLessonCount  = document.getElementById("fez-lesson-count");

async function handleFezFile(file) {
  if (!file) return;
  const courseIdMatch = file.name.match(/\[(\d+)\]/);
  fezCourseId = courseIdMatch?.[1] || "";

  const ext = file.name.split(".").pop().toLowerCase();
  let text = null;
  if (ext === "docx") {
    text = await readDocxAsText(file);
    if (!text) { fezCourseIdDisp.textContent = "Erro ao ler .docx"; fezCourseInfo.style.display = ""; return; }
  } else if (ext === "doc") {
    fezCourseIdDisp.textContent = "Use .docx ou .txt";
    fezCourseInfo.style.display = "";
    return;
  } else {
    text = await file.text();
  }

  fezLessons = parseFezDoc(text);
  await rewriteImagesDeepAsync(fezLessons, fezCourseId);

  // DEBUG — mostra direto no popup
  const fezDebugEl = document.getElementById("fez-debug");
  if (fezDebugEl) {
    if (fezLessons.length === 0) {
      fezDebugEl.textContent = "⚠️ Nenhuma aula encontrada.\n\nPrimeiros 500 chars:\n" + text.slice(0, 500);
    } else {
      let log = "";
      for (const lesson of fezLessons) {
        log += `── Aula ${lesson.lessonNum} ${lesson.lessonName}\n`;
        for (const act of lesson.activities) {
          log += `   [${act.type}] ${act.name}\n`;
          log += `   ${act.content.slice(0, 150).replace(/\n/g, " ")}${act.content.length > 150 ? "…" : ""}\n`;
          if (act.opinion) log += `   [opinião] ${act.opinion.slice(0, 100)}…\n`;
        }
      }
      fezDebugEl.textContent = log;
    }
    fezDebugEl.style.display = "";
  }

  fezCourseIdDisp.textContent = fezCourseId || "(não encontrado no nome do arquivo)";
  fezLessonCount.textContent  = `${fezLessons.length} aula(s)`;
  fezCourseInfo.style.display = "";
  renderFezLessons(fezLessons, fezCourseId);
}

if (fezFileInput) fezFileInput.addEventListener("change", (e) => handleFezFile(e.target.files[0]));

if (fezDropArea) {
  fezDropArea.addEventListener("dragover", (e) => { e.preventDefault(); fezDropArea.classList.add("drag-over"); });
  fezDropArea.addEventListener("dragleave", () => fezDropArea.classList.remove("drag-over"));
  fezDropArea.addEventListener("drop", async (e) => {
    e.preventDefault(); fezDropArea.classList.remove("drag-over");
    await handleFezFile(e.dataTransfer.files[0]);
  });
}

const fezAllBtn = document.getElementById("fez-all-btn");
if (fezAllBtn) {
  fezAllBtn.addEventListener("click", async () => {
    if (!fezLessons.length) return;
    fezAllBtn.disabled = true;
    const container = document.getElementById("fez-lessons");
    const allBtns = container ? [...container.querySelectorAll(".pub-btn")] : [];
    const allStatuses = container ? [...container.querySelectorAll(".pub-lesson-status")] : [];
    let idx = 0;
    for (const lesson of fezLessons) {
      for (const act of lesson.activities) {
        const btn    = allBtns[idx]    || document.createElement("button");
        const status = allStatuses[idx] || document.createElement("div");
        await publishActivity(act, lesson.lessonNum, fezCourseId, btn, status);
        idx++;
      }
    }
    fezAllBtn.disabled = false;
  });
}

// ---------- Avaliação: descrição fixa ----------
// Markdown: vai para o CodeMirror (EasyMDE renderiza para HTML)
const AVAL_DESCRIPTION_MD =
`Antes de começar, vamos entender como a nossa avaliação funciona?

- A avaliação possui **10 questões**. Cada questão possui 5 alternativas, sendo **apenas uma alternativa correta.**
- Após ler o enunciado e escolher a alternativa certa, clique em **"próxima questão"** para continuar.
- Ao finalizar todas as questões, clique em **"Concluir avaliação"** para concluir.
- **O resultado não sai na hora.** O professor informará sua nota quando o resultado estiver disponível.

E aí, pronto para embarcar nessa jornada com a gente?

Lembre-se de ler com calma as questões e as alternativas, revisar a alternativa que foi marcada antes de passar para próxima questão, beber água e ficar tranquilo(a).

Quaisquer dúvidas sobre as questões e alternativas pode contar com seu professor ou professora para lhe apoiar.

Boa avaliação!`;

// HTML: fallback direto no hidden input (hackeditor-sync)
const AVAL_DESCRIPTION_HTML =
`<p>Antes de começar, vamos entender como a nossa avaliação funciona?</p>` +
`<ul>` +
`<li>A avaliação possui <strong>10 questões</strong>. Cada questão possui 5 alternativas, sendo <strong>apenas uma alternativa correta.</strong></li>` +
`<li>Após ler o enunciado e escolher a alternativa certa, clique em <strong>"próxima questão"</strong> para continuar.</li>` +
`<li>Ao finalizar todas as questões, clique em <strong>"Concluir avaliação"</strong> para concluir.</li>` +
`<li><strong>O resultado não sai na hora.</strong> O professor informará sua nota quando o resultado estiver disponível.</li>` +
`</ul>` +
`<p>E aí, pronto para embarcar nessa jornada com a gente?</p>` +
`<p>Lembre-se de ler com calma as questões e as alternativas, revisar a alternativa que foi marcada antes de passar para próxima questão, beber água e ficar tranquilo(a).</p>` +
`<p>Quaisquer dúvidas sobre as questões e alternativas pode contar com seu professor ou professora para lhe apoiar.</p>` +
`<p>Boa avaliação!</p>`;

// Mapeia prefixo textual do eixo (como aparece no doc) → código usado no select da página
const EIXO_NAME_TO_CODE = {
  "pensamento computacional": "PC",
  "cultura digital": "CD",
  "mundo digital": "MD",
  "tecnologias digitais no trabalho docente": "TD",
  "tecnologias digitais em situacoes de aprendizagem": "TD2",
  "uso responsavel de tecnologias digitais no contexto educacional": "TD3",
};

function resolveEixoFromPrefix(prefix) {
  // "Competência 3" → "C3"
  const compMatch = prefix.match(/^Compet[eê]ncia\s+(\d+)$/i);
  if (compMatch) return `C${compMatch[1]}`;
  // Nome textual do eixo (PC/CD/MD/TD/TD2/TD3) — normaliza pra lookup
  const norm = prefix
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return EIXO_NAME_TO_CODE[norm] || null;
}

// ---------- Avaliação: parsing do documento ----------
function parseAvalDoc(text) {
  const lines = text.split("\n").map(l => l.trimEnd());
  const nonEmpty = lines.filter(l => l.trim());
  const title = nonEmpty[0]?.trim() || "";

  const questions = [];
  let current = null;
  let currentAlt = null; // alternativa sendo acumulada (pode ser multilinhas)
  let inExplanations = false; // true entre "Alternativa X: Correta/Incorreta" e próxima Questão
  let collectingExpected = false; // true entre "Resposta esperada:" e o terminador (critérios/justificativa)

  function flushAlt() {
    if (currentAlt && current) {
      current.alts.push({ ...currentAlt, text: currentAlt.text.trim() });
      currentAlt = null;
    }
  }

  // Remove marcadores Markdown de ênfase (**/*) em torno de tokens-chave e nas
  // bordas, para não quebrar o matching quando o Word exporta títulos/rótulos
  // em negrito. Ordem importa: pares cercando tokens ANTES de remover bordas,
  // senão o par fica órfão (ex: "**Alternativa A**, incorreta" → "Alternativa A**, incorreta").
  const stripEmphasis = (s) => s
    .replace(/\*{1,3}(Questão\s+\d+)\*{1,3}/gi, "$1")
    .replace(/\*{1,3}([a-eA-E]\))\*{1,3}/g, "$1")
    .replace(/\*{1,3}(Alternativa\s+[A-E])\*{1,3}/gi, "$1")
    .replace(/^\*{1,3}/, "")
    .replace(/\*{1,3}$/, "");

  for (let i = 0; i < lines.length; i++) {
    const line = stripEmphasis(lines[i].trim());
    if (!line) continue;

    // Cabeçalho da questão: "Questão N – Nome" ou "Questão N - Nome"
    const qMatch = line.match(/^Questão\s+(\d+)\s*[–\-—]\s*(.+)/i);
    if (qMatch) {
      flushAlt();
      if (current) questions.push(current);
      const cleanName = qMatch[2].trim().replace(/^\*{1,3}/, "").replace(/\*{1,3}$/, "").trim();
      current = { num: parseInt(qMatch[1]), name: cleanName, text: "", alts: [] };
      inExplanations = false;
      collectingExpected = false;
      continue;
    }

    if (!current) continue;

    // Discursiva: "Resposta esperada:" inicia coleta da resposta esperada,
    // "Justificativa para correção:" / "Critérios de pontuação:" encerram.
    if (/^Resposta esperada\s*[:：]/i.test(line)) {
      flushAlt();
      current.tipo = "discursive";
      current.expectedAnswer = "";
      collectingExpected = true;
      continue;
    }
    if (collectingExpected) {
      if (/^(Justificativa para corre[çc][ãa]o|Crit[ée]rios de pontua[çc][ãa]o)\s*[:：]?/i.test(line)) {
        collectingExpected = false;
        inExplanations = true; // ignora o resto até a próxima "Questão N"
        continue;
      }
      current.expectedAnswer = current.expectedAnswer
        ? current.expectedAnswer + "\n" + line
        : line;
      continue;
    }

    // Uma vez em modo explicação, só processamos gabaritos; todo resto é descartado.
    if (inExplanations) {
      const explainOnly = line.match(/^Alternativa\s+([A-E])[\s,:.\-–—]+(correta|incorreta)/i);
      if (explainOnly && explainOnly[2].toLowerCase() === "correta") {
        current.correctAlt = explainOnly[1].toUpperCase();
      }
      continue;
    }

    // Linha de habilidade — formatos aceitos (prefixo opcional antes do código):
    //   "(EF06CO05) | Descritor"
    //   "Competência 3 | (EM13CO09) | Descritor"
    //   "Pensamento Computacional | (EF09CO02) | Descritor"
    //   "Cultura Digital | (...) | ..." / "Mundo Digital" / "Tecnologias digitais..." etc.
    const habMatch = line.match(/^(?:(.+?)\s*\|\s*)?\(([A-Z]{2}\d+[A-Z0-9]*)\)\s*\|?\s*(.*)/i);
    if (habMatch) {
      if (current) {
        current.habilidade = {
          code: habMatch[2].toUpperCase(),
          descriptor: habMatch[3].trim(),
        };
        const prefix = (habMatch[1] || "").trim();
        if (prefix) {
          const eixo = resolveEixoFromPrefix(prefix);
          if (eixo) current.habilidade.eixo = eixo;
        }
      }
      continue;
    }

    // Início de alternativa com letra: a) b) c) d) e)
    const altMatch = line.match(/^([a-eA-E])\)\s*(.*)/);
    if (altMatch) {
      flushAlt();
      currentAlt = { letter: altMatch[1].toUpperCase(), text: altMatch[2].trim() };
      continue;
    }

    // Início de alternativa como lista numerada (1. 2. 3. 4. 5.) → A B C D E
    // Só interpreta como alternativa se já há enunciado E o número é sequencial
    const numAltMatch = line.match(/^([1-5])\.\s+(.*)/);
    // alts já flushed + 1 se currentAlt ainda está pendente = próximo número esperado
    const expectedNext = (current?.alts?.length || 0) + (currentAlt ? 2 : 1);
    if (numAltMatch && current?.text && parseInt(numAltMatch[1]) === expectedNext) {
      const letter = ["A","B","C","D","E"][parseInt(numAltMatch[1]) - 1];
      flushAlt();
      currentAlt = { letter, text: numAltMatch[2].trim() };
      continue;
    }

    // Linha de gabarito: "Alternativa B, correta." / "Alternativa B: Correta." / com traço
    const explainMatch = line.match(/^Alternativa\s+([A-E])[\s,:.\-–—]+(correta|incorreta)/i);
    if (explainMatch) {
      flushAlt(); // fecha a última alternativa antes de entrar na seção de explicações

      // Inferência de alternativas sem prefixo "a)": se o gabarito apareceu mas
      // current.alts está vazio, descobre quantas alternativas existem (contando
      // letras únicas em "Alternativa X:" até a próxima Questão) e usa as últimas
      // N linhas não-vazias do enunciado como alternativas.
      if (current.alts.length === 0 && current.text) {
        const seen = new Set();
        for (let j = i; j < lines.length; j++) {
          const lj = stripEmphasis(lines[j].trim());
          if (/^Questão\s+\d+\s*[–\-—]/i.test(lj)) break;
          const m = lj.match(/^Alternativa\s+([A-E])[\s,:.\-–—]/i);
          if (m) seen.add(m[1].toUpperCase());
        }
        const altCount = seen.size;
        const enunLines = current.text.split("\n").map(l => l.trim()).filter(Boolean);
        if (altCount >= 2 && enunLines.length >= altCount) {
          const altLines = enunLines.slice(-altCount);
          const enunRest  = enunLines.slice(0, -altCount);
          current.text = enunRest.join("\n");
          const letters = ["A","B","C","D","E"];
          current.alts = altLines.map((text, idx) => ({ letter: letters[idx], text }));
        }
      }

      if (explainMatch[2].toLowerCase() === "correta") {
        current.correctAlt = explainMatch[1].toUpperCase();
      }
      inExplanations = true; // a partir daqui, ignora tudo até a próxima "Questão N"
      continue;
    }

    // Continuação de alternativa multilinhas
    if (currentAlt) {
      currentAlt.text = currentAlt.text ? currentAlt.text + "\n" + line : line;
      continue;
    }

    // Enunciado: acumula antes das alternativas
    if (!current.alts.length) {
      current.text = current.text ? current.text + "\n" + line : line;
    }
  }
  flushAlt();
  if (current) questions.push(current);

  return { title, questions };
}

// ---------- Avaliação: envio para a aba ----------
async function avalSend(msg) {
  // Questões ficam em URL diferente — usa aba ativa
  if (msg.field === "question") {
    const tab = await getActiveTab();
    return chrome.tabs.sendMessage(tab.id, msg);
  }
  // Título e descrição ficam na página de início
  const tabs = await chrome.tabs.query({ url: "https://cursos.alura.com.br/assessment/create/start/*" });
  const tab = tabs.length > 0 ? tabs[0] : await getActiveTab();
  return chrome.tabs.sendMessage(tab.id, msg);
}

// ---------- Avaliação: renderização dos cards ----------
function renderAvalCards(parsed) {
  const container = document.getElementById("aval-cards");
  container.innerHTML = "";

  function makeCard(label, previewText, onFill) {
    const card = document.createElement("div");
    card.className = "aval-card";

    const lbl = document.createElement("div");
    lbl.className = "aval-card-label";
    lbl.textContent = label;

    const preview = document.createElement("div");
    preview.className = "aval-card-text";
    preview.textContent = previewText;

    const footer = document.createElement("div");
    footer.className = "aval-card-footer";

    const btn = document.createElement("button");
    btn.className = "aval-fill-btn";
    btn.textContent = "Preencher";

    const status = document.createElement("span");
    status.className = "aval-fill-status";

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.textContent = "Preenchendo…";
      try {
        const ack = await onFill();
        if (ack?.ok) {
          status.textContent = `✅ Preenchido${ack.received ? `: "${ack.received}"` : ""}`;
          btn.textContent = "Repreencher";
          btn.classList.add("done");
        } else {
          status.textContent = `❌ ${ack?.error || "Erro"}`;
        }
      } catch (e) {
        status.textContent = `❌ ${e.message}`;
      } finally {
        btn.disabled = false;
      }
    });

    footer.appendChild(btn);
    footer.appendChild(status);
    card.appendChild(lbl);
    card.appendChild(preview);
    card.appendChild(footer);
    return card;
  }

  // Card: Título
  let titleValue = parsed.title;
  // Transform "**Avaliação final – Nome da unidade**" → "[BASE] – Nome da unidade"
  titleValue = titleValue.replace(/\*{1,3}/g, ""); // remove asterisks
  const dashMatch = titleValue.match(/^[^–—-]*\s*(–|—|-)\s*(.+)$/);
  if (dashMatch) {
    const dash = dashMatch[1];
    const unidadeName = dashMatch[2];
    titleValue = "[BASE] " + dash + " " + unidadeName;
  }
  container.appendChild(makeCard("Título", titleValue, () =>
    avalSend({ type: "ALURA_REVISOR_FILL_ASSESSMENT", field: "title", value: titleValue })
  ));

  // Card: Descrição
  const descPreview = AVAL_DESCRIPTION_MD.slice(0, 120) + "…";
  container.appendChild(makeCard("Descrição", descPreview, () =>
    avalSend({ type: "ALURA_REVISOR_FILL_ASSESSMENT", field: "description", markdown: AVAL_DESCRIPTION_MD, html: AVAL_DESCRIPTION_HTML })
  ));

  // Botão: Preencher todas as questões (apenas questões, sem título/descrição)
  const allWrapper = document.createElement("div");
  allWrapper.style.cssText = "display:flex;flex-direction:column;gap:4px;padding:6px 0;";
  const allBtn = document.createElement("button");
  allBtn.style.cssText = "width:100%;padding:8px 12px;font-size:12px;font-weight:700;background:#9761FF;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit;letter-spacing:0.3px;";
  const total = parsed.questions.length;
  allBtn.textContent = `▶ Preencher todas as questões (${total})`;
  const allStatus = document.createElement("div");
  allStatus.style.cssText = "font-size:11px;color:#444;text-align:center;min-height:14px;";

  allBtn.addEventListener("click", async () => {
    allBtn.disabled = true;
    allBtn.style.opacity = "0.6";
    let ok = 0, fail = 0;

    for (let i = 0; i < parsed.questions.length; i++) {
      const q = parsed.questions[i];
      allStatus.textContent = `[${i + 1}/${total}] Questão ${q.num}…`;
      const ack = await avalSend({
        type: "ALURA_REVISOR_FILL_ASSESSMENT",
        field: "question",
        question: q,
      }).catch(e => ({ ok: false, error: e.message }));
      ack?.ok ? ok++ : fail++;
    }

    allStatus.textContent = `✅ ${ok} preenchida(s)${fail ? ` · ❌ ${fail} falhou` : ""}`;
    if (ok === total && fail === 0) {
      const tab = await getActiveTab().catch(() => null);
      const courseId = tab?.url?.match(/\/assessment\/create\/start\/(\d+)/)?.[1] || "";
      await logFeatureUsage("assessment_published", "filled_from_docx", {
        courseId,
        metadata: {
          questions: total,
          source: "assessment_docx_fill_all",
        },
      });
    }
    allBtn.disabled = false;
    allBtn.style.opacity = "1";
    allBtn.textContent = `▶ Preencher todas novamente`;
  });

  allWrapper.appendChild(allBtn);
  allWrapper.appendChild(allStatus);
  container.appendChild(allWrapper);

  // Cards: Questões
  parsed.questions.forEach(q => {
    const card = document.createElement("div");
    card.className = "aval-card";

    const lbl = document.createElement("div");
    lbl.className = "aval-card-label";
    lbl.textContent = `Questão ${q.num}${q.tipo === "discursive" ? " · 💬 Discursiva" : ""}`;

    const qName = document.createElement("div");
    qName.style.cssText = "font-size:11px;font-weight:700;color:#0d1117;margin-bottom:4px;";
    qName.textContent = q.name;

    const qText = document.createElement("div");
    qText.className = "aval-card-text";
    qText.textContent = q.text;

    card.appendChild(lbl);
    card.appendChild(qName);

    if (q.habilidade) {
      const hab = document.createElement("div");
      hab.className = "aval-habilidade";
      if (q.habilidade.eixo) {
        const eixoSpan = document.createElement("span");
        eixoSpan.className = "aval-habilidade-code";
        eixoSpan.style.background = "#fef3e8";
        eixoSpan.style.color = "#b8580a";
        eixoSpan.textContent = q.habilidade.eixo;
        hab.appendChild(eixoSpan);
      }
      const codeSpan = document.createElement("span");
      codeSpan.className = "aval-habilidade-code";
      codeSpan.textContent = q.habilidade.code;
      hab.appendChild(codeSpan);
      if (q.habilidade.descriptor) {
        const descSpan = document.createElement("span");
        descSpan.className = "aval-habilidade-desc";
        descSpan.textContent = q.habilidade.descriptor;
        hab.appendChild(descSpan);
      }
      card.appendChild(hab);
    }

    card.appendChild(qText);

    q.alts.forEach(a => {
      const altEl = document.createElement("div");
      altEl.className = "aval-card-alt";
      const isCorrect = q.correctAlt && a.letter === q.correctAlt;
      if (isCorrect) altEl.style.cssText = "color:#1a7f37;font-weight:700;";
      altEl.textContent = `${a.letter}) ${a.text}${isCorrect ? " ✓" : ""}`;
      card.appendChild(altEl);
    });

    if (q.tipo === "discursive" && q.expectedAnswer) {
      const expLabel = document.createElement("div");
      expLabel.style.cssText = "font-size:10px;font-weight:700;color:#1a7f37;margin-top:6px;";
      expLabel.textContent = "Resposta esperada:";
      card.appendChild(expLabel);

      const expEl = document.createElement("div");
      expEl.className = "aval-card-text";
      expEl.style.cssText = "color:#1a7f37;";
      expEl.textContent = q.expectedAnswer;
      card.appendChild(expEl);
    }

    const footer = document.createElement("div");
    footer.className = "aval-card-footer";

    const btn = document.createElement("button");
    btn.className = "aval-fill-btn";
    btn.textContent = "Preencher";

    const status = document.createElement("span");
    status.className = "aval-fill-status";

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.textContent = "Preenchendo…";
      try {
        const ack = await avalSend({
          type: "ALURA_REVISOR_FILL_ASSESSMENT",
          field: "question",
          question: q,
        });
        if (ack?.ok) {
          const d = ack.debugRadio;
          const radioInfo = d ? ` | radio: idx=${d.correctIdx}/${d.totalBlocks} found=${d.radioFound} before=${d.checkedBefore} after=${d.checkedAfter}` : "";
          const sk = ack.skillDebug;
          let skillInfo = "";
          if (sk?.code) {
            const attrTag = sk.attrSet ? ` +attr(${sk.attrScore}%)` : (sk.attrScore != null ? ` attr-no-match(${sk.attrScore}%)` : "");
            if (sk.saved) skillInfo = ` | skill: ${sk.code} ✓ salvo${attrTag}`;
            else if (sk.skillSet) skillInfo = ` | skill: ${sk.code} (selecionado, save ✗)${attrTag}`;
            else if (sk.groupSet) skillInfo = ` | skill: ${sk.code} (eixo OK, hab ✗)`;
            else if (sk.activated) skillInfo = ` | skill: ${sk.code} (eixo ✗)`;
            else if (sk.eixo) skillInfo = ` | skill: ${sk.code} (bloco não ativou)`;
            else skillInfo = ` | skill: ${sk.code} (eixo não mapeado)`;
            if (sk.error) skillInfo += ` [err: ${sk.error}]`;
          }
          status.textContent = `✅ Preenchida${radioInfo}${skillInfo}`;
          btn.textContent = "Repreencher";
          btn.classList.add("done");
        } else {
          status.textContent = `❌ ${ack?.error || "Erro"}`;
        }
      } catch (e) {
        status.textContent = `❌ ${e.message}`;
      } finally {
        btn.disabled = false;
      }
    });

    footer.appendChild(btn);
    footer.appendChild(status);
    card.appendChild(footer);
    container.appendChild(card);
  });
}

// ---------- Avaliação: carregar arquivo ----------
const avalFileInput = document.getElementById("aval-file-input");
const avalDropArea  = document.getElementById("aval-drop-area");
const avalStatusEl  = document.getElementById("aval-status");

async function handleAvalFile(file) {
  if (!file) return;
  const container = document.getElementById("aval-cards");
  container.innerHTML = "";
  avalStatusEl.textContent = "Lendo arquivo…";

  const ext = file.name.split(".").pop().toLowerCase();
  let text = null;

  if (ext === "docx") {
    text = await readDocxAsText(file);
    if (!text) { avalStatusEl.textContent = "Erro ao ler .docx"; return; }
  } else if (ext === "doc") {
    avalStatusEl.textContent = "Use .docx, .md ou .txt (o formato .doc binário não é suportado)";
    return;
  } else {
    // .txt, .md — lê como texto puro
    text = await file.text();
  }

  // Mostra as primeiras linhas brutas para debug
  const rawPreview = document.createElement("pre");
  rawPreview.style.cssText = "font-size:10px;background:#1e1e1e;color:#d4d4d4;padding:8px;border-radius:6px;white-space:pre-wrap;margin-bottom:8px;max-height:120px;overflow-y:auto;";
  rawPreview.textContent = "── texto extraído (primeiras linhas) ──\n" +
    text.split("\n").filter(l => l.trim()).slice(0, 10).join("\n");
  container.appendChild(rawPreview);

  const parsed = parseAvalDoc(text);
  const avalCourseIdMatch = file.name.match(/\[(\d+)\]/);
  if (avalCourseIdMatch) await rewriteImagesDeepAsync(parsed, avalCourseIdMatch[1]);
  if (!parsed.title) { avalStatusEl.textContent = "Não encontrei texto no documento."; return; }

  avalStatusEl.textContent = `${parsed.questions.length} questão(ões) encontrada(s).`;
  renderAvalCards(parsed);

  // Auto-cria a estrutura na página com a quantidade exata de alternativas de cada questão
  // e o tipo (múltipla escolha vs. discursiva) por questão.
  const altsPerQuestion = parsed.questions.map(q => q.alts?.length || 0);
  const questionTypes   = parsed.questions.map(q => q.tipo === "discursive" ? "DISCURSIVE" : "MULTIPLE_CHOICE");
  if (altsPerQuestion.length > 0) {
    avalCreateStructure(altsPerQuestion, questionTypes);
  }
}

// ---------- Avaliação: criar estrutura (auto a partir do .docx) ----------
const avalStructureStatus = document.getElementById("aval-structure-status");

async function avalCreateStructure(altsPerQuestion, questionTypes) {
  const totalQuestions = altsPerQuestion.length;
  const summary = altsPerQuestion.map((a, i) =>
    questionTypes?.[i] === "DISCURSIVE" ? "D" : String(a)
  ).join("/");
  avalStructureStatus.textContent = `Criando ${totalQuestions}Q (${summary})…`;
  try {
    const tab = await getActiveTab();
    const ack = await chrome.tabs.sendMessage(tab.id, {
      type: "ALURA_REVISOR_FILL_ASSESSMENT",
      field: "createStructure",
      altsPerQuestion,
      questionTypes,
    });
    if (ack?.ok) {
      avalStructureStatus.textContent = `✅ ${ack.created || totalQuestions} questões criadas (${summary})`;
    } else {
      avalStructureStatus.textContent = `❌ ${ack?.error || "Erro"}`;
    }
    return ack;
  } catch (e) {
    avalStructureStatus.textContent = `❌ ${e.message}`;
    return { ok: false, error: e.message };
  }
}

if (avalFileInput) avalFileInput.addEventListener("change", (e) => handleAvalFile(e.target.files[0]));

if (avalDropArea) {
  avalDropArea.addEventListener("dragover", (e) => { e.preventDefault(); avalDropArea.classList.add("drag-over"); });
  avalDropArea.addEventListener("dragleave", () => avalDropArea.classList.remove("drag-over"));
  avalDropArea.addEventListener("drop", async (e) => {
    e.preventDefault();
    avalDropArea.classList.remove("drag-over");
    await handleAvalFile(e.dataTransfer.files[0]);
  });
}

// ---------- Exercícios: parser ----------
function parseExercDoc(rows) {
  const exercises = [];
  let aulaNum = 0;
  let aulaTitle = "";
  let q = null;
  let collectingEnunciado = false;
  let collectingBlocks = false;
  let currentAltLetter = null;
  let currentAltText = "";
  let inGabarito = false;
  let collectingFeedback = null; // "correta" | "incorreta" | null
  let collectingAltOpinionLetter = null;

  const stripStars = (s) => s.replace(/\*/g, "");
  const normalizeLine = (s) => s
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

  function flushAlt() {
    if (!q || !currentAltLetter) return;
    if (!q.alts) q.alts = [];
    q.alts.push({ letter: currentAltLetter, text: currentAltText.trim() });
    currentAltLetter = null;
    currentAltText = "";
  }

  function flushQuestion() {
    if (!q) return;
    flushAlt();
    // Split alts inline: ex. "A) texto1.B) texto2. C) texto3." → 3 alts separadas
    if (q.alts?.length) {
      const nextOf = { A: "B", B: "C", C: "D", D: "E" };
      const expanded = [];
      for (const a of q.alts) {
        let letter = a.letter;
        let rest = a.text;
        while (letter in nextOf) {
          // Match "B)", "C)" etc — com ou sem espaço antes (às vezes vem grudado após ponto final)
          const re = new RegExp(`\\s*${nextOf[letter]}\\)\\s+`);
          const m = rest.match(re);
          if (!m) break;
          expanded.push({ letter, text: rest.slice(0, m.index).trim() });
          letter = nextOf[letter];
          rest = rest.slice(m.index + m[0].length);
        }
        expanded.push({ letter, text: rest.trim() });
      }
      q.alts = expanded;
    }
    if (q.altOpinions && q.alts?.length) {
      q.alts = q.alts.map((a) => ({ ...a, opinion: (q.altOpinions[a.letter] || "").trim() }));
    }
    q.enunciado = q.enunciado.join("\n\n").trim();
    if (!q.tipo) q.tipo = "multipla";
    exercises.push(q);
    q = null;
    collectingEnunciado = false;
    collectingBlocks = false;
    currentAltLetter = null;
    currentAltText = "";
    inGabarito = false;
    collectingFeedback = null;
    collectingAltOpinionLetter = null;
  }

  for (let i = 0; i < rows.length; i++) {
    const { style, text } = rows[i];
    const t = normalizeLine(text);
    const s = stripStars(t);

    if (style === "Aula" || style === "Heading1") {
      if (/^Aula\s+\d+$/i.test(t)) {
        flushQuestion();
        aulaNum = parseInt(t.match(/\d+/)[0]);
        const nextRow = rows[i + 1];
        if (nextRow && (nextRow.style === "Aula" || nextRow.style === "Heading1")) {
          aulaTitle = nextRow.text.trim();
          i++;
        }
        continue;
      }
      if (!q) continue;
      // Aula/Heading1 style inside a question = doc formatting error; fall through to normal processing
    }

    const qMatch = s.match(/^Questão\s+(\d+)\s*[-–—]\s*(.+)$/i);
    if (qMatch) {
      flushQuestion();
      q = {
        aulaNum, aulaTitle,
        questNum: parseInt(qMatch[1]),
        questNome: qMatch[2].trim(),
        tipo: null,
        enunciado: [],
        blocks: [],
        sequenciaCorreta: "",
        respostaCorreta: "",
        respostaIncorreta: "",
        alts: [],
        altOpinions: {},
        correctAlt: null,
      };
      collectingEnunciado = true;
      inGabarito = false;
      collectingFeedback = null;
      collectingAltOpinionLetter = null;
      continue;
    }

    if (!q || !t) continue;

    if (style === "Blocos") {
      q.tipo = "ordenar";
      collectingEnunciado = false;
      collectingBlocks = true;
      q.blocks.push(t);
      continue;
    }

    const seqM = s.match(/^Sequ[eê]ncia correta\s*[:：]\s*(.+)/i);
    if (seqM) {
      q.sequenciaCorreta = seqM[1].trim();
      collectingEnunciado = false;
      collectingBlocks = false;
      collectingFeedback = null;
      collectingAltOpinionLetter = null;
      // Se blocos ainda não foram detectados por estilo "Blocos", infere pelos
      // últimos N parágrafos do enunciado (N = itens da sequência correta)
      if (q.blocks.length === 0) {
        q.tipo = "ordenar";
        const parts = q.sequenciaCorreta.split(/\s*\|\s*/).filter(Boolean);
        const n = parts.length;
        if (n > 0 && q.enunciado.length >= n) {
          q.blocks = q.enunciado.splice(q.enunciado.length - n, n);
        }
      }
      continue;
    }

    if (collectingBlocks) {
      q.blocks.push(t);
      continue;
    }

    if (/^Plataforma$/i.test(s)) continue;

    const rcM = s.match(/^Resposta correta\s*[:：]\s*(.*)$/i);
    if (rcM) {
      q.respostaCorreta = rcM[1].trim();
      inGabarito = true;
      collectingEnunciado = false;
      collectingFeedback = "correta";
      collectingAltOpinionLetter = null;
      continue;
    }

    const riM = s.match(/^Resposta incorreta\s*[:：]\s*(.*)$/i);
    if (riM) {
      q.respostaIncorreta = riM[1].trim();
      inGabarito = true;
      collectingEnunciado = false;
      collectingFeedback = "incorreta";
      collectingAltOpinionLetter = null;
      continue;
    }

    if (collectingFeedback) {
      const isMarker =
        /^Plataforma$/i.test(s) ||
        /^Resposta correta\s*[:：]/i.test(s) ||
        /^Resposta incorreta\s*[:：]/i.test(s) ||
        /^Questão\s+\d+\s*[-–—]/i.test(s) ||
        /^Alternativa\s+([A-E])[,. ]+(correta|incorreta)/i.test(s) ||
        /^Sequ[eê]ncia correta\s*[:：]/i.test(s);

      if (isMarker) collectingFeedback = null;
      else {
        const key = collectingFeedback === "correta" ? "respostaCorreta" : "respostaIncorreta";
        q[key] = q[key] ? `${q[key]}\n${t}` : t;
        continue;
      }
    }

    const gabM = s.match(/^Alternativa\s+([A-E])\s*[,.:\-–— ]*\(?\s*(correta|incorreta)\s*\)?\s*[.,:\-–—)]*\s*(.*)$/i);
    if (gabM) {
      // Recupera alternativas de lista numerada (1. texto, 2. texto...) do final do enunciado
      // quando o documento usa lista automática do Word em vez do formato "A) texto"
      if (!inGabarito && !q.alts?.length && q.enunciado?.length) {
        const letters = ["A", "B", "C", "D", "E"];
        const toExtract = [];
        const copyEnunc = [...q.enunciado];
        while (copyEnunc.length > 0) {
          const last = copyEnunc[copyEnunc.length - 1];
          const m = last.match(/^(\d+)\.\s+([\s\S]+)/);
          if (m) { toExtract.unshift({ num: parseInt(m[1]), text: m[2].trim() }); copyEnunc.pop(); }
          else break;
        }
        const isSeq = toExtract.length >= 4 && toExtract.length <= 5 &&
          toExtract.every((item, i) => item.num === i + 1);
        if (isSeq) {
          q.enunciado = copyEnunc;
          toExtract.forEach((item, i) => q.alts.push({ letter: letters[i], text: item.text }));
        }
      }
      let letter = gabM[1].toUpperCase();
      // Letra duplicada no doc (ex: dois "Alternativa B") → avança para a próxima disponível
      if (q.altOpinions[letter] !== undefined) {
        const next = ["A","B","C","D","E"].find(l => q.altOpinions[l] === undefined);
        if (next) letter = next;
      }
      if (/^correta$/i.test(gabM[2])) q.correctAlt = letter;
      const firstOpinionLine = (gabM[3] || "").trim();
      if (firstOpinionLine) q.altOpinions[letter] = firstOpinionLine;
      collectingAltOpinionLetter = letter;
      if (!q.tipo) q.tipo = "multipla";
      flushAlt();
      inGabarito = true;
      collectingEnunciado = false;
      collectingFeedback = null;
      continue;
    }

    if (inGabarito && collectingAltOpinionLetter) {
      const isMarker =
        /^Plataforma$/i.test(s) ||
        /^Resposta correta\s*[:：]/i.test(s) ||
        /^Resposta incorreta\s*[:：]/i.test(s) ||
        /^Questão\s+\d+\s*[-–—]/i.test(s) ||
        /^Alternativa\s+[A-E]\s*[,.:\-–— ]+\s*(correta|incorreta)/i.test(s) ||
        /^Sequ[eê]ncia correta\s*[:：]/i.test(s);
      if (!isMarker) {
        const prev = q.altOpinions[collectingAltOpinionLetter] || "";
        q.altOpinions[collectingAltOpinionLetter] = prev ? `${prev}\n${t}` : t;
        continue;
      }
    }

    if (inGabarito) continue;

    const altM = t.match(/^([A-E])\)\s+([\s\S]+)/);
    if (altM) {
      flushAlt();
      currentAltLetter = altM[1];
      currentAltText = altM[2];
      if (!q.tipo) q.tipo = "multipla";
      collectingEnunciado = false;
      continue;
    }

    if (currentAltLetter) { currentAltText += "\n" + t; continue; }

    if (collectingEnunciado && !/^Unidade$/i.test(s)) {
      q.enunciado.push(t);
    }
  }

  flushQuestion();
  return exercises;
}

// ---------- Exercícios: renderização ----------
let exercCourseId = "";

function renderExercCards(exercises) {
  const container = document.getElementById("exerc-cards");
  container.innerHTML = "";
  const esc = (s) => String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  exercises.forEach((ex, idx) => {
    const card = document.createElement("div");
    card.className = "aval-card";
    const typeLabel = ex.tipo === "ordenar" ? "Ordenar Blocos" : "Única Escolha";
    const typeColor = ex.tipo === "ordenar" ? "#3D6CE2" : "#9761FF";

    let itemsHtml = "";
    if (ex.tipo === "ordenar") {
      itemsHtml = (ex.blocks || []).map((b, i) =>
        `<div class="aval-card-alt">${i + 1}. ${esc(b)}</div>`
      ).join("");
    } else {
      itemsHtml = (ex.alts || []).map((a) => {
        const isCorrect = ex.correctAlt && a.letter === ex.correctAlt;
        const style = isCorrect ? "color:#1a7f37;font-weight:700;" : "";
        const mark = isCorrect ? " ✓" : "";
        return `<div class="aval-card-alt" style="${style}">${a.letter}) ${esc(a.text)}${mark}</div>`;
      }).join("");
    }

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <span class="aval-card-label" style="margin:0">Aula ${ex.aulaNum} · Q${ex.questNum}</span>
        <span style="font-size:10px;font-weight:700;color:${typeColor};text-transform:uppercase;letter-spacing:.5px;">${typeLabel}</span>
      </div>
      <div style="font-size:12px;font-weight:700;color:#0d1117;margin-bottom:4px;">${esc(ex.questNome)}</div>
      <div class="aval-card-text" style="margin-bottom:6px;">${esc(ex.enunciado || "").replace(/\n/g, "<br>")}</div>
      ${itemsHtml}
      <div class="aval-card-footer">
        <button class="aval-fill-btn exerc-criar-btn" data-idx="${idx}">Criar</button>
        <span class="aval-fill-status" id="exerc-card-status-${idx}"></span>
      </div>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll(".exerc-criar-btn:not(:disabled)").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.idx);
      const ex = exercises[idx];
      const statusEl = document.getElementById(`exerc-card-status-${idx}`);
      if (!exercCourseId) { statusEl.textContent = "ID do curso não encontrado no nome do arquivo."; statusEl.style.color = "#CA3328"; return; }
      btn.disabled = true;
      btn.textContent = "Criando…";
      statusEl.textContent = "";
      try {
        const tab = await getActiveTab();
        if (!tab?.url?.includes("cursos.alura.com.br")) {
          throw new Error("Abra uma aba em cursos.alura.com.br");
        }
        const resp = await chrome.tabs.sendMessage(tab.id, {
          type: "ALURA_REVISOR_CREATE_EXERCICIO",
          courseId: exercCourseId,
          lessonNum: ex.aulaNum,
          exercicio: ex,
        });
        if (resp?.ok) {
          btn.textContent = "✓ Criado";
          btn.classList.add("done");
          const dbg = resp?.debugFeedback;
          if (dbg?.readback) {
            const cLen = dbg.readback?.cmOpinion?.len ?? dbg.readback?.taOpinion?.len ?? dbg.readback?.hiddenOpinion?.len ?? 0;
            const iLen = dbg.readback?.cmWrongOpinion?.len ?? dbg.readback?.taWrongOpinion?.len ?? dbg.readback?.hiddenWrongOpinion?.len ?? 0;
            statusEl.textContent = `ok · debug C:${cLen} I:${iLen}`;
            statusEl.title = JSON.stringify(dbg.readback);
            statusEl.style.whiteSpace = "normal";
          } else {
            statusEl.textContent = "ok";
          }
          statusEl.style.color = "#56A145";
        } else {
          btn.disabled = false;
          btn.textContent = "Criar";
          statusEl.textContent = resp?.error || "sem resposta do content script";
          statusEl.style.color = "#CA3328";
          statusEl.style.whiteSpace = "normal";
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = "Criar";
        statusEl.textContent = e.message;
        statusEl.style.color = "#CA3328";
        statusEl.style.whiteSpace = "normal";
      }
    });
  });

  // Botão "Publicar todos os exercícios"
  const allBtn = document.getElementById("exerc-all-btn");
  if (allBtn) {
    allBtn.style.display = exercises.length > 1 ? "" : "none";
    allBtn.disabled = false;
    allBtn.textContent = "Publicar todos os exercícios";
  }
  exercCurrentList = exercises;
}

let exercCurrentList = [];

const exercAllBtn = document.getElementById("exerc-all-btn");
const exercAllStatus = document.getElementById("exerc-all-status");
if (exercAllBtn) {
  exercAllBtn.addEventListener("click", async () => {
    if (!exercCurrentList.length) return;
    exercAllBtn.disabled = true;
    let done = 0, fail = 0;
    for (let i = 0; i < exercCurrentList.length; i++) {
      const btn = document.querySelector(`.exerc-criar-btn[data-idx="${i}"]`);
      if (!btn || btn.disabled) continue;
      exercAllStatus.textContent = `Publicando ${i + 1}/${exercCurrentList.length}…`;
      btn.click();
      await new Promise((resolve) => {
        const check = () => {
          if (btn.classList.contains("done") || (!btn.disabled && btn.textContent === "Criar")) resolve();
          else setTimeout(check, 500);
        };
        setTimeout(check, 500);
      });
      if (btn.classList.contains("done")) done++; else fail++;
    }
    exercAllStatus.textContent = `Finalizado: ${done} ok, ${fail} falhou(aram).`;
    exercAllBtn.disabled = false;
  });
}

// ---------- Exercícios: carregar arquivo ----------
const exercFileInput = document.getElementById("exerc-file-input");
const exercDropArea  = document.getElementById("exerc-drop-area");
const exercStatusEl  = document.getElementById("exerc-status");

async function handleExercFile(file) {
  if (!file) return;
  exercStatusEl.textContent = "";
  exercStatusEl.style.color = "#CA3328";

  if (!file.name.match(/\.(docx|doc)$/i)) {
    exercStatusEl.textContent = "Selecione um arquivo .docx";
    return;
  }

  const courseIdMatch = file.name.match(/\[(\d+)\]/);
  exercCourseId = courseIdMatch?.[1] || "";

  exercDropArea.querySelector("span").textContent = `📄 ${file.name}`;
  exercStatusEl.style.color = "#F79722";
  exercStatusEl.textContent = "Lendo arquivo…";

  const rows = await readDocxStructured(file);
  if (!rows) {
    exercStatusEl.textContent = "Não foi possível ler o arquivo.";
    return;
  }

  const exercises = parseExercDoc(rows);
  await rewriteImagesDeepAsync(exercises, exercCourseId);
  if (!exercises.length) {
    exercStatusEl.textContent = "Nenhum exercício encontrado.";
    return;
  }

  exercStatusEl.style.color = "#56A145";
  exercStatusEl.textContent = `${exercises.length} exercício(s) encontrado(s)${exercCourseId ? ` · curso ${exercCourseId}` : ""}.`;
  renderExercCards(exercises);
}

if (exercFileInput) exercFileInput.addEventListener("change", (e) => handleExercFile(e.target.files[0]));

if (exercDropArea) {
  exercDropArea.addEventListener("dragover", (e) => { e.preventDefault(); exercDropArea.classList.add("drag-over"); });
  exercDropArea.addEventListener("dragleave", () => exercDropArea.classList.remove("drag-over"));
  exercDropArea.addEventListener("drop", async (e) => {
    e.preventDefault();
    exercDropArea.classList.remove("drag-over");
    await handleExercFile(e.dataTransfer.files[0]);
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
      const selectedPlatform = document.getElementById("platform-select")?.value || null;
      const platform = productType === "tecnico" ? "tecnico" : selectedPlatform;
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
  };
  if (!checks.transcription && !checks.pt && !checks.esp) {
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

// ---------- guia.dev ----------
const guiaStatusEl   = document.getElementById("guia-status");
const guiaLoadBtn    = document.getElementById("guia-load-btn");
const guiaProgressEl = document.getElementById("guia-progress");
const guiaResultsEl  = document.getElementById("guia-results");
const guiaCopyAllBtn = document.getElementById("guia-copy-all-btn");

let guiaLessons = [];

async function guiaCheckPage() {
  const tab = await getActiveTab().catch(() => null);
  if (!tab) {
    guiaStatusEl.textContent = "Não foi possível detectar a aba ativa.";
    guiaLoadBtn.style.display = "none";
    return;
  }
  const match = (tab.url || "").match(/^https:\/\/guia\.alura\.dev\/status\/(\d+)/);
  if (!match) {
    guiaStatusEl.textContent = "Abra uma página https://guia.alura.dev/status/{id} antes de usar.";
    guiaLoadBtn.style.display = "none";
    return;
  }
  guiaStatusEl.textContent = `Curso ${match[1]} detectado.`;
  guiaLoadBtn.style.display = "";
}

guiaLoadBtn.addEventListener("click", async () => {
  guiaLoadBtn.disabled = true;
  guiaProgressEl.style.display = "";
  guiaProgressEl.textContent = "Lendo estrutura da página…";
  guiaResultsEl.innerHTML = "";
  guiaCopyAllBtn.style.display = "none";
  guiaLessons = [];

  try {
    const tab = await getActiveTab();

    const [injResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const lessons = [];
        document.querySelectorAll(".lesson").forEach(lessonEl => {
          const h2Text = (lessonEl.querySelector("h2")?.textContent || "Aula ?")
            .trim().replace(/\s+/g, " ");
          const hrefs = [];
          lessonEl.querySelectorAll(".task.TRANSCRIPTION a.ver").forEach(a => {
            const href = a.getAttribute("href");
            if (href) hrefs.push(href);
          });
          if (hrefs.length) lessons.push({ label: h2Text, hrefs });
        });
        return lessons;
      }
    });

    const lessonLinks = injResult?.result;
    if (!lessonLinks?.length) {
      guiaProgressEl.textContent = "Nenhuma transcrição concluída encontrada nesta página.";
      guiaLoadBtn.disabled = false;
      return;
    }

    const totalTasks = lessonLinks.reduce((s, l) => s + l.hrefs.length, 0);
    let done = 0;
    guiaProgressEl.textContent = `Carregando 0/${totalTasks}…`;

    for (const lesson of lessonLinks) {
      const texts = [];
      for (const href of lesson.hrefs) {
        try {
          const resp = await fetch(`https://guia.alura.dev${href}`, { credentials: "include" });
          const html = await resp.text();
          texts.push(guiaExtractText(html));
        } catch {
          texts.push("[Erro ao carregar]");
        }
        done++;
        guiaProgressEl.textContent = `Carregando ${done}/${totalTasks}…`;
      }
      guiaLessons.push({ label: lesson.label, transcription: texts.join("\n\n") });
    }

    guiaRenderResults();
    guiaProgressEl.textContent = `${guiaLessons.length} aula(s) carregada(s).`;
    guiaCopyAllBtn.style.display = "";
  } catch (e) {
    guiaProgressEl.textContent = `Erro: ${e.message}`;
  } finally {
    guiaLoadBtn.disabled = false;
  }
});

function guiaExtractText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  ["nav", "header", "footer"].forEach(tag =>
    doc.querySelectorAll(tag).forEach(el => el.remove())
  );
  const el = doc.querySelector("pre")
    || doc.querySelector(".transcription")
    || doc.querySelector(".content")
    || doc.querySelector("article")
    || doc.querySelector("main");
  return (el ? el.textContent : doc.body.textContent).trim();
}

function guiaRenderResults() {
  guiaResultsEl.innerHTML = "";
  guiaLessons.forEach((lesson, i) => {
    const card = document.createElement("div");
    card.className = "guia-card";

    const header = document.createElement("div");
    header.className = "guia-card-header";

    const title = document.createElement("span");
    title.className = "guia-card-title";
    title.textContent = lesson.label;

    const copyBtn = document.createElement("button");
    copyBtn.className = "guia-copy-btn";
    copyBtn.textContent = "Copiar";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(lesson.transcription);
      copyBtn.textContent = "Copiado!";
      copyBtn.classList.add("done");
      setTimeout(() => { copyBtn.textContent = "Copiar"; copyBtn.classList.remove("done"); }, 2000);
    });

    header.appendChild(title);
    header.appendChild(copyBtn);

    const textEl = document.createElement("div");
    textEl.className = "guia-card-text";
    textEl.textContent = lesson.transcription;

    card.appendChild(header);
    card.appendChild(textEl);
    guiaResultsEl.appendChild(card);
  });
}

guiaCopyAllBtn.addEventListener("click", () => {
  const all = guiaLessons
    .map(l => `## ${l.label.toUpperCase()}\n${l.transcription}`)
    .join("\n\n");
  navigator.clipboard.writeText(all);
  guiaCopyAllBtn.textContent = "Copiado!";
  setTimeout(() => { guiaCopyAllBtn.textContent = "Copiar todas"; }, 2000);
});

// ---------- Inicialização: carrega credenciais salvas nos campos ----------
(async () => {
  const data = await chrome.storage.local.get(["aluraRevisorGithubToken"]);

  if (githubTokenEl && data.aluraRevisorGithubToken)
    githubTokenEl.value = data.aluraRevisorGithubToken;
})();
