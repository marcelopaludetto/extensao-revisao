(function () {
  const KEY = "aluraRevisorRunState";

  // 5s para considerar que não abriu a primeira aula
  const FIRST_TASK_TIMEOUT_MS = 5000;
  const MAX_HISTORY_SIZE = 5;
  const SECTION_CONCURRENCY = 4;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const ERROR_FIRST_TASK_INACTIVE =
    "Atenção: Primeira atividade do curso está inativa. Entre no admin e altere a ordem.";

  // Mapeia código de habilidade → eixo/competência (extraído de Cadastro Skills - Matriz Start.xlsx)
  const SKILL_GROUP_MAP = {
    EF06CO01:"PC", EF06CO02:"PC", EF06CO03:"PC", EF06CO04:"PC", EF06CO05:"PC", EF06CO06:"PC",
    EF06CO07:"MD", EF06CO08:"MD",
    EF06CO09:"CD", EF06CO10:"CD",
    EF07CO01:"PC", EF07CO02:"PC", EF07CO03:"PC", EF07CO04:"PC", EF07CO05:"PC",
    EF07CO06:"MD", EF07CO07:"MD",
    EF07CO08:"CD", EF07CO09:"CD", EF07CO10:"CD", EF07CO11:"CD",
    EF08CO01:"PC", EF08CO02:"PC", EF08CO03:"PC", EF08CO04:"PC",
    EF08CO05:"MD", EF08CO06:"MD",
    EF08CO07:"CD", EF08CO08:"CD", EF08CO09:"CD", EF08CO10:"CD", EF08CO11:"CD",
    EF09CO01:"PC", EF09CO02:"PC", EF09CO03:"PC",
    EF09CO04:"MD", EF09CO05:"MD",
    EF09CO06:"CD", EF09CO07:"CD", EF09CO08:"CD", EF09CO09:"CD", EF09CO10:"CD",
    EM13CO01:"C1", EM13CO02:"C1", EM13CO03:"C1", EM13CO04:"C1", EM13CO05:"C1", EM13CO06:"C1",
    EM13CO07:"C2", EM13CO08:"C2",
    EM13CO09:"C3", EM13CO10:"C3", EM13CO11:"C3",
    EM13CO12:"C4", EM13CO13:"C4", EM13CO14:"C4", EM13CO15:"C4", EM13CO16:"C4",
    EM13CO17:"C5", EM13CO18:"C5",
    EM13CO19:"C6", EM13CO20:"C6", EM13CO21:"C6", EM13CO22:"C6",
    EM13CO23:"C7", EM13CO24:"C7", EM13CO25:"C7", EM13CO26:"C7",
  };

  function normalizeText(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function stripHash(url) {
    return (url || "").split("#")[0];
  }

  function normalizeUrlBase(url) {
    return stripHash(url).replace(/\/$/, "");
  }

  async function waitFor(fn, timeoutMs = 15000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = fn();
      if (v) return v;
      await sleep(intervalMs);
    }
    return null;
  }

  async function getState() {
    const data = await chrome.storage.local.get(KEY);
    return data?.[KEY] || null;
  }

  async function setState(state) {
    await chrome.storage.local.set({ [KEY]: state });
  }

  async function clearState() {
    await chrome.storage.local.remove(KEY);
  }

  const KEY_HISTORY = "aluraRevisorHistory";

  async function saveToHistory(entry) {
    const data = await chrome.storage.local.get(KEY_HISTORY);
    const history = data?.[KEY_HISTORY] || [];

    if (entry.courseId && entry.courseId !== "?") {
      const idx = history.findIndex((e) => e.courseId === entry.courseId && e.platform === entry.platform);
      if (idx >= 0) history.splice(idx, 1);
    }

    history.unshift(entry);
    if (history.length > MAX_HISTORY_SIZE) history.splice(MAX_HISTORY_SIZE);
    await chrome.storage.local.set({ [KEY_HISTORY]: history });
  }

  // ---------- Detecção de páginas ----------
  function isHomePage() {
    return (
      !!document.querySelector("p.course-header-summary__text") ||
      !!document.querySelector("a.courseSectionList-section") ||
      !!document.querySelector(".course-header-banner") ||
      // Novo layout (acesso antecipado): detecta pelo link do admin no menu
      !!document.querySelector("a[href*='/admin/courses/v2/']")
    );
  }

  function isTaskPage() {
    return /\/task\/\d+/.test(window.location.href) || !!document.querySelector(".task-body");
  }

  function buildCourseSectionMap() {
    const map = {};
    let sectionIdx = 0;

    // Novo layout: cada ds-accordion-item é uma seção; só o primeiro task link fica disponível
    const accordionItems = document.querySelectorAll("div.ds-accordion-item");
    if (accordionItems.length > 0) {
      accordionItems.forEach((item) => {
        sectionIdx++;
        item.querySelectorAll("a[href*='/task/']").forEach((a) => {
          if (a.href) map[normalizeUrlBase(a.href)] = sectionIdx;
        });
      });
      return map;
    }

    // Layout antigo
    const topList = document.querySelector(
      ".course-content-sectionList, ul.courseSection-list, .courseSectionList"
    );
    if (!topList) return map;

    for (const child of Array.from(topList.children)) {
      const nestedActivityLinks = child.querySelectorAll("a.courseSectionList-section");
      if (nestedActivityLinks.length > 0) {
        if (!child.matches("li.courseSection-listItem")) {
          sectionIdx++;
        } else {
          if (sectionIdx === 0) sectionIdx = 1;
        }
        nestedActivityLinks.forEach((a) => {
          if (a.href) map[normalizeUrlBase(a.href)] = sectionIdx;
        });
      } else if (child.textContent.trim().length > 3) {
        sectionIdx++;
      }
    }

    return map;
  }

  // ---------- Ícone ----------
  const VALID_CATEGORY_SLUGS = new Set([
    "programacao", "front-end", "data-science", "inteligencia-artificial",
    "devops", "design-ux", "mobile", "inovacao-gestao"
  ]);

  function getCategorySlugFromBreadcrumb() {
    const breadcrumb = document.querySelector(".container.course-header-banner-breadcrumb");
    if (!breadcrumb) return null;
    const links = breadcrumb.querySelectorAll("a[href]");
    for (const link of links) {
      const parts = (link.getAttribute("href") || "").split("/").filter(Boolean);
      for (const part of parts) {
        if (VALID_CATEGORY_SLUGS.has(part.toLowerCase())) return part.toLowerCase();
      }
    }
    return null;
  }

  function getCourseSlugFromUrl() {
    const m = window.location.pathname.match(/\/course\/([^/]+)/);
    return m ? m[1] : null;
  }

  function isCheckpointCourse(courseSlug) {
    return /checkpoint/i.test(courseSlug || "");
  }

  async function checkIcon(courseSlug) {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ALURA_REVISOR_CHECK_ICON", courseSlug }, (resp) => {
        resolve({ exists: resp?.exists === true, notFound: resp?.notFound === true });
      });
    });
  }

  async function uploadIcon(categorySlug, courseSlug) {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ALURA_REVISOR_UPLOAD_ICON", categorySlug, courseSlug }, (resp) => {
        resolve(resp?.ok === true);
      });
    });
  }


  function askUploadIcon(categorySlug) {
    return new Promise((resolve) => {
      const { modal, overlay } = createOverlayModal("420px");
      modal.innerHTML = `
        <h3 style="margin:0 0 14px 0; color:#1c1c1c; font-weight:700;">Ícone do Curso</h3>
        <p style="margin:0 0 20px 0; font-size:15px; line-height:1.5; color:#555;">
          O curso não possui o ícone de <strong>${categorySlug}</strong>.<br>
          Deseja adicioná-lo ao curso?
        </p>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button id="iconNo" style="padding:9px 20px; border:0; border-radius:8px; cursor:pointer; background:#f0f0f0; color:#333; font-size:14px; font-weight:500;">Não, pular</button>
          <button id="iconYes" style="padding:9px 20px; border:0; border-radius:8px; cursor:pointer; background:#00c86f; color:#fff; font-size:14px; font-weight:600;">Sim, inserir</button>
        </div>
      `;
      document.getElementById("iconNo").onclick = () => { overlay.remove(); resolve(false); };
      document.getElementById("iconYes").onclick = () => { overlay.remove(); resolve(true); };
    });
  }

  function showIconWaiting() {
    const { modal, overlay } = createOverlayModal("380px");
    modal.innerHTML = `
      <p style="margin:0; text-align:center; font-size:15px; color:#555;">
        Enviando ícone para o GitHub…
      </p>
    `;
    return overlay;
  }

  function askSelectStartIcon() {
    const icons = [
      { id: "start-efaf",            label: "EFAF" },
      { id: "start-efai",            label: "EFAI" },
      { id: "start-em",              label: "EM" },
      { id: "start-formacao-docente", label: "Docente" },
    ];
    return new Promise((resolve) => {
      const { modal, overlay } = createOverlayModal("420px");
      modal.innerHTML = `
        <h3 style="margin:0 0 14px 0; color:#1c1c1c; font-weight:700;">Ícone Start</h3>
        <p style="margin:0 0 16px 0; font-size:15px; line-height:1.5; color:#555;">
          Selecione o ícone Start a enviar:
        </p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
          ${icons.map(ic => `
            <button id="starticon-${ic.id}" style="padding:10px 16px; border:1.5px solid #e0e0e0; border-radius:8px; cursor:pointer; background:#fff; color:#1c1c1c; font-size:14px; font-weight:500; text-align:left;">
              ${ic.label} <span style="color:#888;font-size:12px;">→ icons/${ic.id}</span>
            </button>
          `).join("")}
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button id="starticon-cancel" style="padding:9px 20px; border:0; border-radius:8px; cursor:pointer; background:#f0f0f0; color:#333; font-size:14px; font-weight:500;">Cancelar</button>
        </div>
      `;
      icons.forEach(ic => {
        document.getElementById(`starticon-${ic.id}`).onclick = () => { overlay.remove(); resolve(ic.id); };
      });
      document.getElementById("starticon-cancel").onclick = () => { overlay.remove(); resolve(null); };
    });
  }

  // ---------- Subcategoria ----------
  function breadcrumbHasSubcategory(container) {
    if (!container) return false;
    // Sem subcategoria: href="/category/#" (fragment vazio)
    // Com subcategoria: href="/category/data-science#sql" (fragment real)
    const subcatLink = container.querySelector(".course-header-banner-breadcrumb__subcategory");
    if (!subcatLink) return false;
    const href = subcatLink.getAttribute("href") || "";
    const hashIdx = href.indexOf("#");
    if (hashIdx === -1) return false;
    return href.slice(hashIdx + 1).length > 0;
  }

  // ---------- Catálogo ----------

  function findAdminCourseIdInDOM() {
    // 1. Link admin explícito (ex: dropdown "Outras ações" para instrutores)
    const links = document.querySelectorAll("a[href*='/admin/courses/v2/']");
    for (const a of links) {
      const m = (a.href || "").match(/\/admin\/courses\/v2\/(\d+)/);
      if (m) return m[1];
    }

    // 2. Atributo data-course-id presente em botões da home (ex: "Adicionar em nova trilha")
    const withId = document.querySelector("[data-course-id]");
    if (withId) {
      const id = withId.dataset.courseId;
      if (/^\d+$/.test(id)) return id;
    }

    return null;
  }

  async function resolveCourseId() {
    // First try: link already in DOM (not lazy)
    const direct = findAdminCourseIdInDOM();
    if (direct) return direct;

    // Second try: open "Outras ações" / "Otras acciones" dropdown to force rendering
    const toggle =
      document.querySelector(".course-header-button-menu__toggle") ||
      Array.from(document.querySelectorAll("button")).find((b) => {
        const t = normalizeText(b.textContent).toLowerCase();
        return t.includes("outras") || t.includes("otras");
      }) ||
      null;

    if (!toggle) return null;

    toggle.click();
    await sleep(500);

    const courseId = findAdminCourseIdInDOM();

    toggle.click(); // close dropdown
    return courseId;
  }

  async function addToSubcategory(subcategoryId, courseId, urlType = "subcategory") {
    return await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "ALURA_REVISOR_ADD_TO_SUBCATEGORY", subcategoryId, courseId, urlType }, resp => {
        resolve(resp ?? { ok: false, error: "Sem resposta do background" });
      });
    });
  }

  async function getAdminFields(courseId) {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ALURA_REVISOR_GET_ADMIN_FIELDS", courseId }, (resp) => {
        resolve(resp?.ok ? resp : null);
      });
    });
  }

  async function checkSubcategory(subcategoryId, courseId, urlType = "subcategory") {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ALURA_REVISOR_CHECK_SUBCATEGORY", subcategoryId, courseId, urlType }, (resp) => {
        resolve(resp?.ok ? resp.inSubcategory : null);
      });
    });
  }

  async function checkSubcategories(courseId) {
    const [sub27, sub126] = await Promise.all([
      checkSubcategory("27",  courseId, "catalog"),
      checkSubcategory("126", courseId, "subcategory"),
    ]);
    return { sub27, sub126 };
  }

  // ---------- Transcrição ----------
  function readTranscriptionRawOnce() {
    // Novo layout: <span aria-label="Transcrição: 100%">
    const newEl = document.querySelector("span[aria-label^='Transcrição:']");
    if (newEl) {
      const raw = (newEl.getAttribute("aria-label") || "").replace("Transcrição:", "").trim();
      return raw || null;
    }

    // Layout antigo
    const labels = Array.from(document.querySelectorAll("p.course-header-summary__text"));
    const label = labels.find((p) => normalizeText(p.textContent).toLowerCase() === "transcrição");
    if (!label) return null;

    const wrapper = label.closest(".course-header-summary__info__wrapper") || label.parentElement;
    const valueEl = wrapper ? wrapper.querySelector("p.course-header-summary__title") : null;

    const raw = normalizeText(valueEl?.textContent || "");
    return raw || null;
  }

  function parseTranscription(raw) {
    const rawText = raw || null;
    if (!rawText) return { rawText: null, percentNumber: null, is100: false };

    const m = rawText.match(/(\d{1,3})\s*%/);
    if (m) {
      const n = Number(m[1]);
      return { rawText, percentNumber: Number.isFinite(n) ? n : null, is100: n === 100 };
    }

    // caso especial: "Em andamento" / "En curso" = 0%
    if (rawText.toLowerCase() === "em andamento" || rawText.toLowerCase() === "en curso") {
      return { rawText, percentNumber: 0, is100: false };
    }

    return { rawText, percentNumber: null, is100: false };
  }

  function getFirstLessonHref() {
    // Layout antigo
    const a =
      document.querySelector("li.courseSection-listItem a.courseSectionList-section") ||
      document.querySelector("a.courseSectionList-section");
    if (a?.href) return a.href;

    // Novo layout: link de task dentro do primeiro accordion item
    const newA = document.querySelector("div.ds-accordion-item a[href*='/task/']");
    return newA?.href || null;
  }

  function isCourseListLoaded() {
    return (
      !!document.querySelector(".course-content-sectionList") ||
      !!document.querySelector("ul.courseSection-list") ||
      !!document.querySelector(".courseSectionList") ||
      // Novo layout
      !!document.querySelector("div.ds-accordion-item")
    );
  }

  // ---------- Próxima atividade ----------
  function findNextActivityLink() {
    const a = document.querySelector("a.task-actions-button-next");
    if (a?.href) return a;

    const nodes = Array.from(document.querySelectorAll("a,button"));
    const byText = nodes.find((el) => normalizeText(el.textContent).toLowerCase() === "próxima atividade");
    if (byText && byText.tagName.toLowerCase() === "a" && byText.href) return byText;

    return null;
  }

  // ---------- Validação: href vazio ----------
  function isEmptyHrefValue(href) {
    const h = (href ?? "").trim();
    if (!h) return true;
    if (h === "#") return true;
    return false;
  }


  function parseHtmlContent(htmlString) {
    const div = document.createElement("div");
    div.innerHTML = htmlString || "";
    return div;
  }

  function collectEmptyHrefLinksInCurrentTask(root) {
    const formatted = root ?? getFormattedTextRoot();
    if (!formatted) return { hasIssue: false, count: 0 };

    const anchors = Array.from(formatted.querySelectorAll("a"));
    let count = 0;

    for (const a of anchors) {
      if (!a.hasAttribute("href")) continue;
      const rawHref = a.getAttribute("href");
      if (isEmptyHrefValue(rawHref)) count++;
    }

    return { hasIssue: count > 0, count };
  }

  // ---------- Validação: GitHub fora do padrão ----------
  function isNonStandardGithubUrl(href) {
    if (!href) return false;

    let u;
    try {
      u = new URL(href, window.location.href);
    } catch {
      return false;
    }

    const host = (u.hostname || "").toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return false;

    const parts = (u.pathname || "").split("/").filter(Boolean);
    if (parts.length === 0) return false;

    const first = (parts[0] || "").toLowerCase();
    return first !== "alura-cursos" && first !== "alura-es-cursos";
  }

  function collectNonStandardGithubLinksInCurrentTask(root) {
    const formatted = root ?? getFormattedTextRoot();
    if (!formatted) return { hasIssue: false, links: [] };

    const anchors = Array.from(formatted.querySelectorAll("a"));
    const bad = [];

    for (const a of anchors) {
      const href = a.href || a.getAttribute("href") || "";
      if (isNonStandardGithubUrl(href)) bad.push(stripHash(href));
    }

    const uniq = Array.from(new Set(bad));
    return { hasIssue: uniq.length > 0, links: uniq };
  }

  // ---------- Validação: repositórios não oficiais ----------
  const NON_OFFICIAL_CLOUD_HOSTS = [
    "sharepoint.com",
    "docs.google.com",
    "drive.google.com",
    "dropbox.com",
    "onedrive.live.com",
    "1drv.ms",
  ];

  function isNonOfficialCloudUrl(href) {
    if (!href) return false;

    let u;
    try {
      u = new URL(href, window.location.href);
    } catch {
      return false;
    }

    const host = (u.hostname || "").toLowerCase();
    return NON_OFFICIAL_CLOUD_HOSTS.some(
      (blocked) => host === blocked || host.endsWith("." + blocked)
    );
  }

  function collectNonOfficialCloudLinksInCurrentTask(root) {
    const formatted = root ?? getFormattedTextRoot();
    if (!formatted) return { hasIssue: false, links: [] };

    const anchors = Array.from(formatted.querySelectorAll("a"));
    const bad = [];

    for (const a of anchors) {
      const href = a.href || a.getAttribute("href") || "";
      if (isNonOfficialCloudUrl(href)) bad.push(stripHash(href));
    }

    const uniq = Array.from(new Set(bad));
    return { hasIssue: uniq.length > 0, links: uniq };
  }

  // ---------- NOVO: Coletar todos os links HTTP(S) ----------
  function isHttpUrlLike(href) {
    if (!href) return false;
    const h = String(href).trim();
    if (!h) return false;
    if (h.startsWith("#")) return false;
    if (h.startsWith("mailto:") || h.startsWith("tel:")) return false;
    if (h.startsWith("javascript:")) return false;

    let u;
    try {
      u = new URL(h, window.location.href);
    } catch {
      return false;
    }
    return u.protocol === "http:" || u.protocol === "https:";
  }

  function collectAllHttpLinksInCurrentTask(root) {
    const formatted = root ?? getFormattedTextRoot();
    if (!formatted) return [];

    const anchors = Array.from(formatted.querySelectorAll("a"));
    const urls = [];

    for (const a of anchors) {
      const href = a.href || a.getAttribute("href") || "";
      if (!isHttpUrlLike(href)) continue;
      urls.push(stripHash(href));
    }

    return Array.from(new Set(urls));
  }

  async function check404ViaBackground(urls) {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ALURA_REVISOR_CHECK_404", urls }, (resp) => {
        if (!resp?.ok) return resolve([]);
        resolve(resp.bad404 || []);
      });
    });
  }

  async function runWithConcurrency(items, worker, concurrency = 4) {
    const out = [];
    let i = 0;
    async function runner() {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, runner)
    );
    return out;
  }

  function addIssue(state, key, activityUrl) {
    state.issues = state.issues || {};
    state.issues[key] = state.issues[key] || [];
    if (!state.issues[key].includes(activityUrl)) state.issues[key].push(activityUrl);
  }

  function addIssueDetails(state, key, activityUrl, detailsArray) {
    state.issues = state.issues || {};
    state.issues[key] = state.issues[key] || {};
    state.issues[key][activityUrl] = state.issues[key][activityUrl] || [];

    for (const item of detailsArray || []) {
      if (!state.issues[key][activityUrl].includes(item)) state.issues[key][activityUrl].push(item);
    }
  }

  // ---------- Popup ----------
  function removeExistingModal() {
    const el = document.getElementById("alura-revisor-modal");
    if (el) el.remove();
  }

  function createOverlayModal(width = "620px") {
    removeExistingModal();

    const overlay = document.createElement("div");
    overlay.id = "alura-revisor-modal";
    overlay.style.position = "fixed";
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.5)";
    overlay.style.zIndex = 999999;
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const modal = document.createElement("div");
    modal.style.background = "#fff";
    modal.style.padding = "22px";
    modal.style.borderRadius = "12px";
    modal.style.width = width;
    modal.style.fontFamily = "'Inter', system-ui, -apple-system, Arial";
    modal.style.boxShadow = "0 20px 60px rgba(0,0,0,0.3)";
    modal.style.textAlign = "left";

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    return { overlay, modal };
  }

  // ---------- Alerta: curso sem aulas ----------
  function showNoLessonsAlert() {
    const { modal, overlay } = createOverlayModal("380px");
    modal.innerHTML = `
      <h3 style="margin:0 0 14px 0; color:#1c1c1c; font-weight:700;">⚠️ Curso sem aulas</h3>
      <p style="margin:0 0 20px 0; font-size:15px; line-height:1.5; color:#555;">
        Este curso não possui aulas ativas. Revisão finalizada.
      </p>
      <div style="display:flex; justify-content:flex-end;">
        <button id="aluraNoLessonsClose" style="padding:9px 20px; border:0; border-radius:8px; cursor:pointer; background:#1c1c1c; color:#fff; font-size:14px; font-weight:600;">Fechar</button>
      </div>
    `;
    document.getElementById("aluraNoLessonsClose").onclick = () => overlay.remove();
  }

  function showAdminReviewProgress(totalSections) {
    const { modal, overlay } = createOverlayModal("480px");
    modal.id = "alura-revisor-admin-progress";
    modal.innerHTML = `<h3 style="margin:0 0 12px 0; font-size:15px; color:#1c1c1c; font-weight:700;">Revisando o curso…</h3>`;
    for (let i = 0; i < totalSections; i++) {
      const p = document.createElement("p");
      p.id = `alura-revisor-section-progress-${i}`;
      p.style.cssText = "margin:2px 0; font-size:12px; color:#999;";
      p.textContent = `Seção ${i + 1}: aguardando…`;
      modal.appendChild(p);
    }
    return overlay;
  }

  function updateAdminReviewProgress(si, totalSections, section, ti, totalTasks, task) {
    const el = document.getElementById(`alura-revisor-section-progress-${si}`);
    if (!el) return;
    const taskLabel = task
      ? ` — Ativ. ${ti + 1}/${totalTasks}: ${task.type} — ${task.title}`
      : ` — Buscando atividades…`;
    el.textContent = `Seção ${si + 1}/${totalSections}: ${section.title}${taskLabel}`;
    el.style.color = "#555";
  }

  function generateReportText(state) {
    const lines = [];
    const now = new Date().toLocaleString("pt-BR");

    lines.push("RELATÓRIO DE REVISÃO — ALURA REVISOR");
    lines.push(`Gerado em: ${now}`);
    if (state.courseId) lines.push(`Curso ID: ${state.courseId}`);
    if (state.courseSlug) lines.push(`Slug: ${state.courseSlug}`);
    if (state.homeBaseUrl) lines.push(`URL: ${state.homeBaseUrl}`);
    lines.push("========================================");
    lines.push("");
    lines.push("CHECKLIST:");

    lines.push(`  ${state.hasSubcategory ? "✅" : "❌"} Subcategoria`);

    const trMsg = state.transcriptionIs100 ? "✅ Transcrição Completa"
      : state.totalActiveVideos === 0 ? "⚠️ Curso sem vídeos ativos."
      : "⚠️ Tem vídeos sem transcrição, por favor gere as transcrições.";
    lines.push(`  ${trMsg}`);

    const catStr = state.catalogCode === null
      ? "⚠️ Catálogo não verificado"
      : state.catalogOk ? "✅ Catálogo OK" : "❌ Catálogo — curso não adicionado";
    lines.push(`  ${catStr}`);

    if (state.iconStatus) {
      const iconStr = state.iconStatus === "exists"   ? "✅ Ícone OK"
        : state.iconStatus === "uploaded" ? "✅ Ícone enviado"
        : state.iconStatus === "skipped"  ? "⚠️ Ícone não enviado"
        : "❌ Erro ao enviar ícone";
      lines.push(`  ${iconStr}`);
    }

    lines.push("");
    lines.push("========================================");
    lines.push("PROBLEMAS ENCONTRADOS:");
    lines.push("");

    const emptyHrefIssues = state.issues?.emptyHref || [];
    const githubIssuesMap = state.issues?.githubNonStandard || {};
    const cloudIssuesMap = state.issues?.nonOfficialCloud || {};
    const link404Map = state.issues?.link404 || {};
    let hasAnyIssue = false;

    if (emptyHrefIssues.length > 0) {
      hasAnyIssue = true;
      lines.push(`Links vazios (${emptyHrefIssues.length} atividade(s)):`);
      emptyHrefIssues.forEach((u) => lines.push(`  - ${u}`));
      lines.push("");
    }

    const githubActivities = Object.keys(githubIssuesMap);
    if (githubActivities.length > 0) {
      hasAnyIssue = true;
      lines.push(`GitHub fora do padrão (${githubActivities.length} atividade(s)):`);
      githubActivities.forEach((act) => {
        lines.push(`  Atividade: ${act}`);
        (githubIssuesMap[act] || []).forEach((l) => lines.push(`    - ${l}`));
      });
      lines.push("");
    }

    const cloudActivities = Object.keys(cloudIssuesMap);
    if (cloudActivities.length > 0) {
      hasAnyIssue = true;
      lines.push(`Repositórios não oficiais (${cloudActivities.length} atividade(s)):`);
      cloudActivities.forEach((act) => {
        lines.push(`  Atividade: ${act}`);
        (cloudIssuesMap[act] || []).forEach((l) => lines.push(`    - ${l}`));
      });
      lines.push("");
    }

    const link404Activities = Object.keys(link404Map);
    if (link404Activities.length > 0) {
      hasAnyIssue = true;
      lines.push(`Links com 404 (${link404Activities.length} atividade(s)):`);
      link404Activities.forEach((act) => {
        lines.push(`  Atividade: ${act}`);
        (link404Map[act] || []).forEach((l) => lines.push(`    - ${l}`));
      });
      lines.push("");
    }


    const adminFieldsIssues = state.issues?.adminFields || [];
    if (adminFieldsIssues.length > 0) {
      hasAnyIssue = true;
      lines.push("Erros no admin de vendas:");
      adminFieldsIssues.forEach(m => lines.push(`  - ${m}`));
      lines.push("");
    }

    const genericSectionNames = state.issues?.genericSectionNames || [];
    if (genericSectionNames.length > 0) {
      hasAnyIssue = true;
      lines.push("Nome das aulas incorretas, por favor ajustar:");
      genericSectionNames.forEach(n => lines.push(`  - ${n}`));
      lines.push("");
    }

    const tecnicoRules = state.issues?.tecnicoRules || [];
    if (tecnicoRules.length > 0) {
      hasAnyIssue = true;
      lines.push("Regras do Curso T\u00e9cnico:");
      tecnicoRules.forEach(m => lines.push(`  - ${m}`));
      lines.push("");
    }

    const orderIssues = state.issues?.orderIssues || [];
    if (orderIssues.length > 0) {
      hasAnyIssue = true;
      lines.push("Ordem das atividades:");
      orderIssues.forEach((entry) => {
        lines.push(`  Aula: ${entry.section}`);
        (entry.errors || []).forEach(m => lines.push(`    - ${m}`));
      });
      lines.push("");
    }

    const reorderedSections = state.issues?.reorderedSections || [];
    if (reorderedSections.length > 0) {
      lines.push("✅ Ordem ajustado, tinha atividades inativas fora de ordem.");
      lines.push("");
    }

    if (!hasAnyIssue) {
      lines.push("Nenhum problema encontrado.");
      lines.push("");
    }

    if (state.error) {
      lines.push("========================================");
      lines.push(`ERRO: ${state.error}`);
    }

    return lines.join("\n");
  }

  function downloadReport(state) {
    const text = generateReportText(state);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revisao-${state.courseSlug || state.courseId || "curso"}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showFinalPopup(state, { persistHistory = true } = {}) {
    const { modal, overlay } = createOverlayModal("720px");

    const hasSpecificSubChecks = state.sub27 !== undefined || state.sub126 !== undefined;
    const subLine = hasSpecificSubChecks ? null
      : state.hasSubcategory === null ? "⚠️ Subcategoria não verificada"
      : state.hasSubcategory ? "✅ Subcategoria Adicionada" : "❌ Sem Subcategoria";
    const trLine = state.transcriptionIs100 === null ? null
      : state.transcriptionIs100 ? "✅ Transcrição Completa"
      : state.totalActiveVideos === 0 ? "⚠️ Curso sem vídeos ativos."
      : "⚠️ Tem vídeos sem transcrição, por favor gere as transcrições.";
    const catalogLine = state.catalogCode === null
      ? null
      : state.catalogOk
        ? "✅ Catálogo OK"
        : "❌ Adicionar curso no catálogo";

    const emptyHrefIssues = state.issues?.emptyHref || [];
    const githubIssuesMap = state.issues?.githubNonStandard || {};
    const cloudIssuesMap = state.issues?.nonOfficialCloud || {};
    const link404Map = state.issues?.link404 || {};

    const hasEmptyHrefIssues = emptyHrefIssues.length > 0;

    const githubActivities = Object.keys(githubIssuesMap);
    const hasGithubIssues = githubActivities.length > 0;

    const cloudActivities = Object.keys(cloudIssuesMap);
    const hasCloudIssues = cloudActivities.length > 0;

    const link404Activities = Object.keys(link404Map);
    const has404Issues = link404Activities.length > 0;

    const adminFieldsIssues = state.issues?.adminFields || [];
    const hasAdminIssues = adminFieldsIssues.length > 0;

    const reorderedSections = state.issues?.reorderedSections || [];
    const genericSectionNames = state.issues?.genericSectionNames || [];
    const hasGenericSectionNames = genericSectionNames.length > 0;

    const tecnicoRules = state.issues?.tecnicoRules || [];
    const hasTecnicoRules = tecnicoRules.length > 0;
    const orderIssues = state.issues?.orderIssues || [];
    const hasOrderIssues = orderIssues.length > 0;

    const hasContentIssues = hasEmptyHrefIssues || hasGithubIssues || hasCloudIssues || has404Issues || hasAdminIssues || hasGenericSectionNames || hasTecnicoRules || hasOrderIssues;

    const iconLine = state.iconStatus === "exists"   ? "✅ Ícone OK"
      : state.iconStatus === "uploaded" ? "✅ Ícone enviado"
      : state.iconStatus === "skipped"  ? "⚠️ Ícone não enviado"
      : state.iconStatus === "error"    ? "❌ Erro ao enviar ícone"
      : null;

    const btnStyle = `margin-left:12px; padding:4px 12px; border:0; border-radius:6px; cursor:pointer; background:#e53935; color:#fff; font-size:13px; font-weight:600; white-space:nowrap;`;
    const forumLine = state.forumBlocked === true  ? "✅ Fórum bloqueado"
      : state.forumBlocked === false ? `❌ Fórum não bloqueado — marcar "Bloquear fórum" <button id="aluraRevisorFixForum" style="${btnStyle}">Corrigir</button>`
      : state.forumBlocked === null  ? "⚠️ Não foi possível verificar o fórum"
      : null;

    const themeLine = state.themeOk === true  ? `✅ Tema correto (${state.expectedTheme})`
      : state.themeOk === false ? `❌ Tema incorreto — esperado <strong>${state.expectedTheme}</strong>, encontrado: <strong>${state.actualTheme || "(vazio)"}</strong> <button id="aluraRevisorFixTheme" style="${btnStyle}">Corrigir</button>`
      : state.themeOk === null  ? "⚠️ Não foi possível verificar o tema"
      : null;

    const sub27Line = state.sub27 === true  ? "✅ Catálogo Escolas (27) adicionado"
      : state.sub27 === false ? `❌ Não está no catálogo Escolas (27) <button id="aluraRevisorFixSub27" style="${btnStyle}">Corrigir</button>`
      : state.sub27 === null  ? "⚠️ Não foi possível verificar catálogo Escolas (27)"
      : null;

    const sub126Line = state.sub126 === true  ? "✅ Subcategoria Alura-escolas (126) adicionada"
      : state.sub126 === false ? `❌ Não está na subcategoria Alura-escolas (126) <button id="aluraRevisorFixSub126" style="${btnStyle}">Corrigir</button>`
      : state.sub126 === null  ? "⚠️ Não foi possível verificar subcategoria Alura-escolas (126)"
      : null;

    const iconOk = !state.iconStatus || state.iconStatus === "exists" || state.iconStatus === "uploaded";
    const okAllBase = state.transcriptionIs100 && state.hasSubcategory && (state.catalogCode === null || state.catalogOk) && iconOk && !state.error && !hasAdminIssues && state.forumBlocked !== false && state.themeOk !== false;
    const title = okAllBase && !hasContentIssues ? "Checklist final: TUDO OK ✅" : "Checklist final: atenção ⚠️";

    if (persistHistory) {
      saveToHistory({
        courseId: state.courseId || "?",
        platform: window.location.origin,
        runAt: Date.now(),
        ok: okAllBase && !hasContentIssues,
        state
      }).catch(() => {});
    }

    const emptyHrefBlock = hasEmptyHrefIssues
      ? `
        <div style="margin-top:14px; padding:12px; border-radius:8px; background:#fff8e1; border:1px solid #e9a800;">
          <div style="font-weight:700; margin-bottom:6px; color:#7c5700;">⚠️ Links vazios nas atividades:</div>
          <ul style="margin:6px 0 0 18px; padding:0; color:#333;">
            ${emptyHrefIssues.map((u) => `<li><a href="${u}" target="_blank" rel="noreferrer">${u}</a></li>`).join("")}
          </ul>
        </div>
      `
      : "";

    const githubBlock = hasGithubIssues
      ? `
        <div style="margin-top:14px; padding:12px; border-radius:8px; background:#fff8e1; border:1px solid #e9a800;">
          <div style="font-weight:700; margin-bottom:6px; color:#7c5700;">⚠️ Link do GitHub fora do padrão (o recomendado é github.com/alura-cursos ou github.com/alura-es-cursos) nas atividades:</div>
          <ul style="margin:6px 0 0 18px; padding:0; color:#333;">
            ${githubActivities
              .map((activityUrl) => {
                const links = githubIssuesMap[activityUrl] || [];
                const linksHtml = links
                  .map((l) => `<li style="margin-left:18px;"><a href="${l}" target="_blank" rel="noreferrer">${l}</a></li>`)
                  .join("");
                return `
                  <li style="margin-bottom:8px;">
                    <a href="${activityUrl}" target="_blank" rel="noreferrer">${activityUrl}</a>
                    <ul style="margin:6px 0 0 0; padding-left:0; list-style:disc;">
                      ${linksHtml}
                    </ul>
                  </li>
                `;
              })
              .join("")}
          </ul>
        </div>
      `
      : "";

    const cloudBlock = hasCloudIssues
      ? `
        <div style="margin-top:14px; padding:12px; border-radius:8px; background:#fff8e1; border:1px solid #e9a800;">
          <div style="font-weight:700; margin-bottom:6px; color:#7c5700;">
            ⚠️ Link em repositório interno (SharePoint / Google Docs). Subir arquivo na Nuvem da Alura:
          </div>
          <ul style="margin:6px 0 0 18px; padding:0; color:#333;">
            ${cloudActivities
              .map((activityUrl) => {
                const links = cloudIssuesMap[activityUrl] || [];
                const linksHtml = links
                  .map((l) => `<li style="margin-left:18px;"><a href="${l}" target="_blank" rel="noreferrer">${l}</a></li>`)
                  .join("");
                return `
                  <li style="margin-bottom:8px;">
                    <a href="${activityUrl}" target="_blank" rel="noreferrer">${activityUrl}</a>
                    <ul style="margin:6px 0 0 0; padding-left:0; list-style:disc;">
                      ${linksHtml}
                    </ul>
                  </li>
                `;
              })
              .join("")}
          </ul>
        </div>
      `
      : "";

    const link404Block = has404Issues
      ? `
        <div style="margin-top:14px; padding:12px; border-radius:8px; background:#fff0f0; border:1px solid #e53935;">
          <div style="font-weight:700; margin-bottom:6px; color:#c62828;">
            ⚠️ Links retornando 404 (não encontrado) nas atividades:
          </div>
          <ul style="margin:6px 0 0 18px; padding:0; color:#333;">
            ${link404Activities
              .map((activityUrl) => {
                const links = link404Map[activityUrl] || [];
                const linksHtml = links
                  .map((l) => `<li style="margin-left:18px;"><a href="${l}" target="_blank" rel="noreferrer">${l}</a></li>`)
                  .join("");
                return `
                  <li style="margin-bottom:8px;">
                    <a href="${activityUrl}" target="_blank" rel="noreferrer">${activityUrl}</a>
                    <ul style="margin:6px 0 0 0; padding-left:0; list-style:disc;">
                      ${linksHtml}
                    </ul>
                  </li>
                `;
              })
              .join("")}
          </ul>
        </div>
      `
      : "";


    const adminFieldsBlock = hasAdminIssues
      ? `
        <div style="margin-top:14px; padding:12px; border-radius:8px; background:#fff0f0; border:1px solid #e53935;">
          <div style="font-weight:700; margin-bottom:6px; color:#c62828;">⚠️ Há erros no admin de vendas:</div>
          <ul style="margin:6px 0 0 18px; padding:0; color:#333;">
            ${adminFieldsIssues.map(m => `<li>${m}</li>`).join("")}
          </ul>
        </div>
      `
      : "";

    const genericSectionNamesBlock = hasGenericSectionNames
      ? `
        <div style="margin-top:14px; padding:12px; border-radius:8px; background:#fff8e1; border:1px solid #e9a800;">
          <div style="font-weight:700; margin-bottom:6px; color:#7c5700;">⚠️ Nome das aulas incorretas, por favor ajustar:</div>
          <ul style="margin:6px 0 0 18px; padding:0; color:#333;">
            ${genericSectionNames.map(n => `<li>${n}</li>`).join("")}
          </ul>
        </div>
      `
      : "";

    const reorderedBlock = reorderedSections.length > 0
      ? `<div style="margin-top:14px; padding:12px; border-radius:8px; background:#f0fff5; border:1px solid #00c86f; font-weight:700; color:#007a42;">✅ Ordem ajustado, tinha atividades inativas fora de ordem.</div>`
      : "";

    const orderIssuesBlock = hasOrderIssues
      ? `
        <div style="margin-top:14px; padding:12px; border-radius:8px; background:#fff3e0; border:1px solid #e65100;">
          <div style="font-weight:700; margin-bottom:6px; color:#bf360c;">\u26a0\ufe0f Ordem das atividades:</div>
          <ul style="margin:6px 0 0 18px; padding:0; color:#333;">
            ${orderIssues.map(entry => `
              <li style="margin-bottom:8px;">
                <strong>${entry.section}</strong>
                <ul style="margin:4px 0 0 18px; padding:0;">
                  ${(entry.errors || []).map(m => `<li>${m}</li>`).join("")}
                </ul>
              </li>
            `).join("")}
          </ul>
        </div>
      `
      : "";

    const tecnicoRulesBlock = hasTecnicoRules
      ? `
        <div style="margin-top:14px; padding:12px; border-radius:8px; background:#fff3e0; border:1px solid #e65100;">
          <div style="font-weight:700; margin-bottom:6px; color:#bf360c;">⚠️ Regras do Curso Técnico:</div>
          <ul style="margin:6px 0 0 18px; padding:0; color:#333;">
            ${tecnicoRules.map(m => `<li>${m}</li>`).join("")}
          </ul>
        </div>
      `
      : "";

    const errorBlock = state.error
      ? `<div style="margin-top:14px; padding:12px; border-radius:8px; background:#fff0f0; border:1px solid #e53935; color:#c62828;">
           <strong>${state.error}</strong>
         </div>`
      : "";

    modal.innerHTML = `
      <div style="padding-bottom:16px; border-bottom:2px solid #f0f0f0; margin-bottom:4px;">
        <h2 style="margin:0; font-size:18px; font-weight:700; color:#1c1c1c;">${title}</h2>
      </div>

      <div style="margin-top:8px; font-size:15px; line-height:1.5;">
        ${subLine ? `<div style="display:flex; align-items:center; padding:8px 12px; border-radius:8px; background:#f9f9f9; margin-top:8px;">${subLine}</div>` : ""}
        ${sub27Line ? `<div style="display:flex; align-items:center; padding:8px 12px; border-radius:8px; background:#f9f9f9; margin-top:8px;">${sub27Line}</div>` : ""}
        ${sub126Line ? `<div style="display:flex; align-items:center; padding:8px 12px; border-radius:8px; background:#f9f9f9; margin-top:8px;">${sub126Line}</div>` : ""}
        ${trLine ? `<div style="display:flex; align-items:center; padding:8px 12px; border-radius:8px; background:#f9f9f9; margin-top:8px;">${trLine}</div>` : ""}
        ${catalogLine ? `<div style="display:flex; align-items:center; padding:8px 12px; border-radius:8px; background:#f9f9f9; margin-top:8px;">${catalogLine}</div>` : ""}
        ${iconLine ? `<div style="display:flex; align-items:center; padding:8px 12px; border-radius:8px; background:#f9f9f9; margin-top:8px;">${iconLine}</div>` : ""}
        ${forumLine ? `<div style="display:flex; align-items:center; padding:8px 12px; border-radius:8px; background:#f9f9f9; margin-top:8px;">${forumLine}</div>` : ""}
        ${themeLine ? `<div style="display:flex; align-items:center; padding:8px 12px; border-radius:8px; background:#f9f9f9; margin-top:8px;">${themeLine}</div>` : ""}
        ${state.isEmBreve ? `<div style="display:flex; align-items:center; padding:8px 12px; border-radius:8px; background:#fff3e0; border:1px solid #ff9800; margin-top:8px;">🚧 <strong style="margin-left:6px;">Curso Em Breve</strong> &nbsp;— campos do admin não verificados.</div>` : ""}
        ${emptyHrefBlock}
        ${githubBlock}
        ${cloudBlock}
        ${link404Block}
        ${adminFieldsBlock}
        ${genericSectionNamesBlock}
        ${orderIssuesBlock}
        ${tecnicoRulesBlock}
        ${reorderedBlock}
        ${errorBlock}
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
        <button id="aluraRevisorDownload" style="
          padding:9px 18px; border:0; border-radius:8px; cursor:pointer;
          background:#00c86f; color:#fff; font-size:14px; font-weight:600;
        ">Baixar relatório</button>
        ${state.courseId && state.platform ? `<button id="aluraRevisorAutoOrder" style="
          padding:9px 18px; border:0; border-radius:8px; cursor:pointer;
          background:#7b1fa2; color:#fff; font-size:14px; font-weight:600;
        ">Ordenar tudo ›</button>` : ""}
        ${state.courseId ? `<button id="aluraRevisorNextStep" style="
          padding:9px 18px; border:0; border-radius:8px; cursor:pointer;
          background:#1565c0; color:#fff; font-size:14px; font-weight:600;
        ">Próxima Etapa ›</button>` : ""}
        <button id="aluraRevisorClose" style="
          padding:9px 18px; border:0; border-radius:8px; cursor:pointer;
          background:#1c1c1c; color:#fff; font-size:14px; font-weight:600;
        ">Fechar</button>
      </div>
    `;

    document.getElementById("aluraRevisorDownload").onclick = () => downloadReport(state);
    document.getElementById("aluraRevisorClose").onclick = () => overlay.remove();

    const fixForumBtn = modal.querySelector("#aluraRevisorFixForum");
    if (fixForumBtn) {
      fixForumBtn.addEventListener("click", async () => {
        fixForumBtn.disabled = true;
        fixForumBtn.textContent = "Corrigindo...";
        const resp = await sendToBackground({ type: "ALURA_REVISOR_FIX_FORUM", courseId: state.courseId });
        if (resp?.ok) {
          fixForumBtn.closest("div").innerHTML = "✅ Fórum bloqueado";
        } else {
          const msg = resp?.error || "Erro desconhecido";
          fixForumBtn.closest("div").innerHTML = `❌ Erro ao corrigir fórum: <em style="color:#c00">${msg}</em>`;
        }
      });
    }

    const fixThemeBtn = modal.querySelector("#aluraRevisorFixTheme");
    if (fixThemeBtn) {
      fixThemeBtn.addEventListener("click", async () => {
        fixThemeBtn.disabled = true;
        fixThemeBtn.textContent = "Corrigindo...";
        const resp = await sendToBackground({ type: "ALURA_REVISOR_FIX_THEME", courseId: state.courseId, expectedTheme: state.expectedTheme });
        if (resp?.ok) {
          fixThemeBtn.closest("div").innerHTML = `✅ Tema correto (${state.expectedTheme})`;
        } else {
          const msg = resp?.error || "Erro desconhecido";
          fixThemeBtn.closest("div").innerHTML = `❌ Erro ao corrigir tema: <em style="color:#c00">${msg}</em>`;
        }
      });
    }

    for (const { btnId, subcategoryId, label, urlType } of [
      { btnId: "aluraRevisorFixSub27",  subcategoryId: "27",  label: "Catálogo Escolas (27)",           urlType: "catalog"      },
      { btnId: "aluraRevisorFixSub126", subcategoryId: "126", label: "Subcategoria Alura-escolas (126)", urlType: "subcategory"  },
    ]) {
      const btn = modal.querySelector(`#${btnId}`);
      if (!btn) continue;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Corrigindo...";
        const resp = await addToSubcategory(subcategoryId, state.courseId, urlType);
        if (resp?.ok) {
          btn.closest("div").innerHTML = `✅ ${label} adicionada`;
        } else {
          const errMsg = resp?.error || "Erro desconhecido";
          btn.closest("div").innerHTML = `❌ Erro ao adicionar à ${label}: <em style="color:#c00">${errMsg}</em>`;
        }
      });
    }

    const nextStepBtn = modal.querySelector("#aluraRevisorNextStep");
    if (nextStepBtn) {
      nextStepBtn.addEventListener("click", async () => {
        nextStepBtn.disabled = true;
        nextStepBtn.textContent = "Carregando...";
        overlay.remove();
        await showSectionTasksStep(state.courseId, 0, null, state.platform || null);
      });
    }

    const autoOrderBtn = modal.querySelector("#aluraRevisorAutoOrder");
    if (autoOrderBtn) {
      autoOrderBtn.addEventListener("click", async () => {
        autoOrderBtn.disabled = true;
        autoOrderBtn.textContent = "Carregando...";
        overlay.remove();
        await autoOrderAllSections(state.courseId, null, state.platform || null);
      });
    }
  }

  async function autoOrderAllSections(courseId, sections = null, platform = null) {
    const { modal, overlay } = createOverlayModal("680px");
    modal.innerHTML = `
      <div style="padding-bottom:16px; border-bottom:2px solid #f0f0f0; margin-bottom:4px;">
        <h2 style="margin:0; font-size:18px; font-weight:700; color:#1c1c1c;">Ordenação Automática</h2>
      </div>
      <div id="aluraRevisorAutoContent" style="margin-top:12px; font-size:15px; line-height:1.6; color:#333;">
        <p style="color:#888;">Carregando seções...</p>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
        <button id="aluraRevisorClose" style="padding:9px 18px; border:0; border-radius:8px; cursor:pointer; background:#1c1c1c; color:#fff; font-size:14px; font-weight:600;">Fechar</button>
      </div>
    `;
    document.getElementById("aluraRevisorClose").onclick = () => overlay.remove();

    const content = modal.querySelector("#aluraRevisorAutoContent");

    try {
      if (!sections) {
        sections = (await getAdminSections(courseId)).filter(s => s.active);
      }

      if (sections.length === 0) {
        content.innerHTML = `<p style="color:#c00;">Nenhuma seção ativa encontrada.</p>`;
        return;
      }

      const results = [];

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        content.innerHTML = `<p style="color:#888; margin:0;">Verificando <strong>${i + 1}/${sections.length}</strong>: ${section.title}…</p>`;

        try {
          const { tasks } = await getAdminSectionTasks(courseId, section.id);

          if (!platform || tasks.length === 0) {
            results.push({ title: section.title, status: "skip" });
            continue;
          }

          const context = { sectionIndex: i, totalSections: sections.length, sectionTitle: section.title };
          const orderErrors = validateSectionOrder(tasks, platform, context);

          if (orderErrors.length === 0) {
            results.push({ title: section.title, status: "ok" });
            continue;
          }

          const correctTasks = computeCorrectOrder(tasks, platform, context);
          const orderedIds = correctTasks
            .map(t => t.editUrl?.match(/\/task\/edit\/(\d+)/)?.[1])
            .filter(Boolean);

          const resp = await new Promise(resolve =>
            chrome.runtime.sendMessage({
              type: "ALURA_REVISOR_REORDER_SECTION_TASKS",
              courseId,
              sectionId: section.id,
              orderedTaskIds: orderedIds
            }, resolve)
          );

          if (resp?.ok) {
            results.push({ title: section.title, status: "fixed", errors: orderErrors });
          } else {
            results.push({ title: section.title, status: "error", message: resp?.error || "Erro ao reordenar" });
          }
        } catch (e) {
          results.push({ title: section.title, status: "error", message: e.message });
        }
      }

      const nOk    = results.filter(r => r.status === "ok").length;
      const nFixed = results.filter(r => r.status === "fixed").length;
      const nError = results.filter(r => r.status === "error").length;

      const rows = results.map(r => {
        const icons = { ok: "✅", fixed: "🔧", error: "❌", skip: "⏭️" };
        const icon = icons[r.status] || "•";
        let detail = "";
        if (r.status === "ok")    detail = `<span style="color:#2e7d32;">Ordem correta</span>`;
        if (r.status === "fixed") detail = `<span style="color:#1565c0;">Corrigida</span>`;
        if (r.status === "error") detail = `<span style="color:#c62828;">${r.message}</span>`;
        if (r.status === "skip")  detail = `<span style="color:#888;">Sem atividades ou plataforma</span>`;
        return `
          <div style="display:flex; align-items:flex-start; gap:8px; padding:6px 0; border-bottom:1px solid #f0f0f0; font-size:13px;">
            <span style="flex-shrink:0; min-width:20px;">${icon}</span>
            <div><strong>${r.title}</strong> — ${detail}</div>
          </div>`;
      }).join("");

      content.innerHTML = `
        <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:14px; font-size:14px; font-weight:600;">
          <span style="color:#2e7d32;">✅ ${nOk} correta${nOk !== 1 ? "s" : ""}</span>
          <span style="color:#1565c0;">🔧 ${nFixed} corrigida${nFixed !== 1 ? "s" : ""}</span>
          ${nError ? `<span style="color:#c62828;">❌ ${nError} com erro</span>` : ""}
        </div>
        ${rows}
      `;
    } catch (e) {
      content.innerHTML = `<p style="color:#c00;">Erro: ${e.message}</p>`;
    }
  }

  async function showSectionTasksStep(courseId, sectionIndex = 0, cachedSections = null, platform = null) {
    const { modal, overlay } = createOverlayModal("720px");
    modal.innerHTML = `
      <div style="padding-bottom:16px; border-bottom:2px solid #f0f0f0; margin-bottom:4px;">
        <h2 style="margin:0; font-size:18px; font-weight:700; color:#1c1c1c;">Revisão de Atividades</h2>
      </div>
      <div id="aluraRevisorSectionContent" style="margin-top:12px; font-size:15px; line-height:1.6; color:#333;">
        <p style="color:#888;">Carregando...</p>
      </div>
      <div id="aluraRevisorSectionFooter" style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
        <button id="aluraRevisorClose" style="padding:9px 18px; border:0; border-radius:8px; cursor:pointer; background:#1c1c1c; color:#fff; font-size:14px; font-weight:600;">Fechar</button>
      </div>
    `;
    document.getElementById("aluraRevisorClose").onclick = () => overlay.remove();

    const content = modal.querySelector("#aluraRevisorSectionContent");
    const footer  = modal.querySelector("#aluraRevisorSectionFooter");

    try {
      const sections = cachedSections ?? (await getAdminSections(courseId)).filter(s => s.active);

      if (sections.length === 0) {
        content.innerHTML = `<p style="color:#c00;">Nenhuma seção ativa encontrada.</p>`;
        return;
      }

      const section = sections[sectionIndex];
      const totalSections = sections.length;

      content.innerHTML = `<p style="color:#888;">Buscando atividades de <strong>${section.title}</strong>...</p>`;

      const { tasks } = await getAdminSectionTasks(courseId, section.id);

      if (tasks.length === 0) {
        content.innerHTML = `<p><strong>${section.title}</strong> — nenhuma atividade ativa encontrada.</p>`;
        return;
      }

      // Carrega conteúdo de tasks relevantes (única escolha + vídeo)
      const luriMap   = {};  // editUrl → true | false | null
      const videoMap  = {};  // editUrl → { transcricao, legendaPT, legendaES, uploaderCode }

      const tasksToCheck = tasks.filter(t => /única/i.test(t.type) || /vídeo|video/i.test(t.type));
      content.innerHTML = `<p style="color:#888;">Verificando ${tasksToCheck.length} atividade(s)...</p>`;

      await Promise.all(tasksToCheck.map(async t => {
        try {
          const result = await getAdminTaskContent(t.editUrl);

          if (/única/i.test(t.type)) {
            luriMap[t.editUrl] = result.hasSingleChoiceField ? result.isLuri : null;
          }

          if (/vídeo|video/i.test(t.type)) {
            const transcricao = result.transcriptionText?.trim().length > 0;
            let legendaPT = null, legendaES = null, uploaderCode = null, legendaSolicitada = false;
            const rawCode = result.videoUrl;
            if (rawCode && rawCode !== "0") {
              uploaderCode = rawCode.includes("/") ? rawCode.split("/")[1] : rawCode;
              const taskId = t.editUrl.match(/\/task\/edit\/(\d+)/)?.[1] ?? "";
              const info = await getVideoInfo(uploaderCode, { pt: true, esp: true }, {
                courseId,
                taskId,
                taskTitle: t.title,
                sectionTitle: section.title,
                source: "section_tasks_step",
              });
              legendaPT = info.hasPortugues;
              legendaES = info.hasEspanhol;
              legendaSolicitada = info.legendaSolicitada;
            }
            videoMap[t.editUrl] = { transcricao, legendaPT, legendaES, uploaderCode, legendaSolicitada };
          }
        } catch(e) {
          console.error("[Revisor] check error:", t.title, e);
        }
      }));

      const ok  = (label) => `<span style="color:#2e7d32; font-weight:600; margin-left:6px;">✅ ${label}</span>`;
      const nok = (label) => `<span style="color:#c62828; font-weight:600; margin-left:6px;">❌ ${label}</span>`;

      const taskRows = tasks.map(t => {
        let badge = "";

        if (/única/i.test(t.type)) {
          const luri = luriMap[t.editUrl];
          badge = luri === true ? ok("Luri") : luri === false ? nok("Luri") : `<span style="color:#888; margin-left:6px;">⚠️ Luri?</span>`;
        }

        if (/vídeo|video/i.test(t.type)) {
          const v = videoMap[t.editUrl];
          if (v) {
            badge = (v.transcricao ? ok("Transcrição") : nok("Transcrição"))
                  + (v.legendaPT === true ? ok("PT") : v.legendaPT === false ? nok("PT") : "")
                  + (v.legendaES === true ? ok("ES") : v.legendaES === false ? nok("ES") : "")
                  + (v.legendaSolicitada ? `<span style="color:#f57c00; font-weight:600; margin-left:6px;" title="Geração de legenda solicitada automaticamente">📝 Geração solicitada</span>` : "");
          }
        }
        const link = t.editUrl
          ? `<a href="${t.editUrl}" target="_blank" rel="noreferrer" style="color:#1565c0;">${t.title}</a>`
          : t.title;
        return `
          <div style="display:flex; align-items:baseline; gap:8px; padding:6px 0; border-bottom:1px solid #f0f0f0;">
            <span style="min-width:110px; font-size:12px; color:#888; flex-shrink:0;">${t.type}</span>
            <span>${link}${badge}</span>
          </div>`;
      }).join("");

      content.innerHTML = `
        <div style="font-weight:700; margin-bottom:10px; font-size:16px;">
          ${section.title}
          <span style="font-weight:400; font-size:13px; color:#888;">(${sectionIndex + 1}/${totalSections} — ${tasks.length} atividade${tasks.length !== 1 ? "s" : ""})</span>
        </div>
        ${taskRows}
      `;

      // Validação de ordem (via DOM para suportar botão com evento)
      if (platform) {
        const orderErrors = validateSectionOrder(tasks, platform, { sectionIndex, totalSections, sectionTitle: section.title });
        const orderDiv = document.createElement("div");
        orderDiv.style.marginTop = "12px";

        if (orderErrors.length > 0) {
          orderDiv.innerHTML = `
            <div style="padding:10px 12px; border-radius:8px; background:#fff3e0; border:1px solid #e65100;">
              <div style="font-weight:700; font-size:13px; color:#bf360c; margin-bottom:6px;">⚠️ Ordem incorreta (${PLATFORM_LABELS[platform] || platform}):</div>
              <ul style="margin:0 0 0 16px; padding:0; font-size:13px; color:#333;">
                ${orderErrors.map(e => `<li>${e}</li>`).join("")}
              </ul>
            </div>`;

          const fixBtn = document.createElement("button");
          fixBtn.textContent = "Ajustar ordem";
          fixBtn.style.cssText = "margin-top:8px; padding:8px 16px; border-radius:8px; border:0; cursor:pointer; background:#1565c0; color:#fff; font-size:13px; font-weight:600; font-family:inherit;";
          fixBtn.addEventListener("click", async () => {
            fixBtn.disabled = true;
            fixBtn.textContent = "Ajustando…";
            try {
              const correctTasks = computeCorrectOrder(tasks, platform, { sectionIndex, totalSections, sectionTitle: section.title });
              const orderedIds = correctTasks
                .map(t => t.editUrl?.match(/\/task\/edit\/(\d+)/)?.[1])
                .filter(Boolean);

              const resp = await new Promise(resolve =>
                chrome.runtime.sendMessage({
                  type: "ALURA_REVISOR_REORDER_SECTION_TASKS",
                  courseId,
                  sectionId: section.id,
                  orderedTaskIds: orderedIds
                }, resolve)
              );

              if (resp?.ok) {
                fixBtn.textContent = "✅ Ordem ajustada!";
                fixBtn.style.background = "#00c86f";
                // Recarrega a seção para refletir a nova ordem
                setTimeout(() => {
                  overlay.remove();
                  showSectionTasksStep(courseId, sectionIndex, null, platform);
                }, 1200);
              } else {
                fixBtn.textContent = `❌ ${resp?.error || "Erro ao ajustar"}`;
                fixBtn.style.background = "#c62828";
                fixBtn.disabled = false;
              }
            } catch (e) {
              fixBtn.textContent = `❌ ${e.message}`;
              fixBtn.style.background = "#c62828";
              fixBtn.disabled = false;
            }
          });
          orderDiv.appendChild(fixBtn);
        } else {
          orderDiv.innerHTML = `<div style="padding:8px 12px; border-radius:8px; background:#f0fff5; border:1px solid #00c86f; font-size:13px; font-weight:600; color:#007a42;">✅ Ordem correta (${PLATFORM_LABELS[platform] || platform})</div>`;
        }

        content.appendChild(orderDiv);
      }

      if (platform === "tecnico") {
        const tecnicoErrors = validateTecnicoSectionRules(tasks, { sectionIndex, totalSections }, luriMap);
        const tecnicoDiv = document.createElement("div");
        tecnicoDiv.style.marginTop = "12px";

        if (tecnicoErrors.length > 0) {
          tecnicoDiv.innerHTML = `
            <div style="padding:10px 12px; border-radius:8px; background:#fff3e0; border:1px solid #e65100;">
              <div style="font-weight:700; font-size:13px; color:#bf360c; margin-bottom:6px;">\u26a0\ufe0f Regras do Curso T\u00e9cnico:</div>
              <ul style="margin:0 0 0 16px; padding:0; font-size:13px; color:#333;">
                ${tecnicoErrors.map(e => `<li>${e}</li>`).join("")}
              </ul>
            </div>`;
        } else {
          tecnicoDiv.innerHTML = `<div style="padding:8px 12px; border-radius:8px; background:#f0fff5; border:1px solid #00c86f; font-size:13px; font-weight:600; color:#007a42;">\u2705 Regras OK</div>`;
        }

        content.appendChild(tecnicoDiv);
      }

      // Botão próxima aula
      if (sectionIndex + 1 < totalSections) {
        const nextBtn = document.createElement("button");
        nextBtn.textContent = "Próxima Aula ›";
        nextBtn.style.cssText = "padding:9px 18px; border:0; border-radius:8px; cursor:pointer; background:#1565c0; color:#fff; font-size:14px; font-weight:600;";
        nextBtn.addEventListener("click", () => {
          overlay.remove();
          showSectionTasksStep(courseId, sectionIndex + 1, sections, platform);
        });
        footer.insertBefore(nextBtn, footer.querySelector("#aluraRevisorClose"));
      }

    } catch (e) {
      content.innerHTML = `<p style="color:#c00;">Erro: ${e.message}</p>`;
    }
  }

  async function finalize(state, error = null) {
    // Verificação de ícone adiada: curso foi adicionado ao catálogo durante a revisão.
    // A home recarregou, então o breadcrumb agora deve exibir a categoria.
    if (state.pendingIconCheck && state.courseSlug && isHomePage()) {
      const categorySlug = getCategorySlugFromBreadcrumb();
      const iconSlug = isCheckpointCourse(state.courseSlug) ? "checkpoint" : categorySlug;
      if (iconSlug) {
        const iconResult = await checkIcon(state.courseSlug);
        if (iconResult.exists) {
          state.iconStatus = "exists";
        } else if (iconResult.notFound) {
          const wantsUpload = await askUploadIcon(iconSlug);
          if (wantsUpload) {
            const iconWaitOverlay = showIconWaiting();
            const uploaded = await uploadIcon(iconSlug, state.courseSlug);
            iconWaitOverlay.remove();
            state.iconStatus = uploaded ? "uploaded" : "error";
          } else {
            state.iconStatus = "skipped";
          }
        }
        state.categorySlug = categorySlug;
      }
      // sem categoria mesmo após revisão → iconStatus permanece null
      state.pendingIconCheck = false;
    }

    state.running = false;
    state.finished = !error;
    state.error = error || null;
    await setState(state);
    try {
      await sendToBackground({
        type: "ALURA_REVISOR_LOG_USAGE",
        entry: {
          eventType: "feature_usage",
          feature: "unit_review_completed",
          action: state.finished ? "completed" : "interrupted",
          courseId: state.courseId || "",
          courseName: state._courseName || "",
          count: 1,
          metadata: {
            productType: state.productType || "",
            platform: state.platform || "",
            finished: !!state.finished,
            error: state.error || "",
            steps: state.steps || 0,
            iconStatus: state.iconStatus || "",
            totalActiveVideos: state.totalActiveVideos || 0,
          },
        },
      });
    } catch (e) {
      console.warn("[Revisor] Falha ao registrar revisao de unidade", e);
    }
    showFinalPopup(state);
  }

  // ---------- Inativa primeira atividade ----------
  function isFirstTaskInactiveCase(state) {
    if (state.enteredTask) return false;

    const elapsed = Date.now() - (state.firstTaskAttemptedAt || 0);
    if (elapsed < FIRST_TASK_TIMEOUT_MS) return false;

    if (isTaskPage()) return false;

    return true;
  }

  // ---------- Admin review helpers ----------
  async function getAdminSections(courseId) {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "ALURA_REVISOR_GET_SECTIONS", courseId }, (resp) => {
        if (!resp?.ok) return reject(new Error(resp?.error || "Falha ao buscar seções."));
        resolve(resp.sections || []);
      });
    });
  }

  async function getAdminSectionTasks(courseId, sectionId, { includeInactive = false } = {}) {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "ALURA_REVISOR_GET_SECTION_TASKS", courseId, sectionId, includeInactive }, (resp) => {
        if (!resp?.ok) return reject(new Error(resp?.error || "Falha ao buscar atividades."));
        resolve({ tasks: resp.tasks || [], reordered: resp.reordered || false });
      });
    });
  }

  async function getAdminTaskContent(editUrl) {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ALURA_REVISOR_GET_TASK_CONTENT", editUrl }, (resp) => {
        resolve({
          videoUrl: resp?.videoUrl ?? null,
          htmlContents: resp?.htmlContents || [],
          alternatives: resp?.alternatives || [],
          transcriptionText: resp?.transcriptionText ?? "",
          isLuri: resp?.isLuri ?? false,
          hasSingleChoiceField: resp?.hasSingleChoiceField ?? false,
        });
      });
    });
  }

  function isInvalidTextField(value, courseName) {
    if (!value) return "está em branco";
    if (value === ".") return "contém apenas um ponto final";
    if (value === courseName) return "contém apenas o nome do curso";
    return null;
  }

  function isInvalidCourseCode(code) {
    if (!code) return "está em branco";
    if (/[A-Z]/.test(code)) return "contém letras maiúsculas";
    if (/[^a-z0-9-]/.test(code)) return "contém caracteres inválidos (acentos, espaços ou caracteres especiais)";
    if (/--/.test(code)) return "contém dois hífens seguidos";
    if (/^-|-$/.test(code)) return "não pode começar ou terminar com hífen";
    if (!/-/.test(code)) return "deve conter ao menos duas palavras separadas por hífen";
    return null;
  }

  function loadVideoDuration(activityUrl) {
    chrome.runtime.sendMessage({ type: "ALURA_REVISOR_LOAD_VIDEO_DURATION", activityUrl });
  }

  // ---------- Validação de ordem das atividades ----------
  const PLATFORM_LABELS = {
    startlab: "StartLab",
    vscode: "VS Code",
    figma: "Figma / p5.js / Python / IA / Cultura digital / Educação Midiática",
    robotica: "Robótica",
    tecnico: "Curso técnico",
    "formacao-ai-12": "Forma\u00e7\u00e3o docente - Anos iniciais (1\u00ba e 2\u00ba ano)",
    "formacao-ai-35": "Forma\u00e7\u00e3o docente - Anos iniciais (3\u00ba a 5\u00ba ano)",
    "formacao-af-startlab": "Forma\u00e7\u00e3o docente - Anos finais (unidade com StartLab)",
    "formacao-af-em": "Forma\u00e7\u00e3o docente - Anos finais e m\u00e9dio",
  };

  const ORDER_TEMPLATES = {
    startlab: [
      "oQueVamosAprender", "preparandoAmbiente", "projetoStartlab",
      "video", "video", "facaComoEuFiz",
      "exercicio", "exercicio", "exercicio",
      "paraSaberMais", "horaDoDesafio", "compartilheProjeto",
      "glossario", "oQueAprendemos", "conclusao",
    ],
    vscode: [
      "oQueVamosAprender", "preparandoAmbiente",
      "video", "video", "facaComoEuFiz",
      "exercicio", "exercicio", "exercicio",
      "paraSaberMais", "horaDoDesafio", "compartilheProjeto",
      "videosParaSP", "glossario", "oQueAprendemos", "conclusao",
    ],
    figma: [
      "oQueVamosAprender", "preparandoAmbiente",
      "video", "facaComoEuFiz",
      "exercicio", "exercicio", "exercicio",
      "paraSaberMais", "horaDoDesafio", "compartilheProjeto",
      "glossario", "oQueAprendemos", "conclusao",
    ],
    robotica: [
      "oQueVamosAprender", "preparandoAmbiente", "listaMateriais",
      "video", "facaComoEuFiz",
      "exercicio", "exercicio", "exercicio",
      "paraSaberMais", "horaDoDesafio", "compartilheProjeto",
      "glossario", "oQueAprendemos", "conclusao",
    ],
    tecnico: [
      "oQueAprendemos", "preparandoAmbiente",
      "video", "aprofundamento",
      "exercicio", "exercicio",
      "conclusao",
    ],
  };

  const FORMACAO_DOCENTE_PLATFORMS = new Set([
    "formacao-ai-12",
    "formacao-ai-35",
    "formacao-af-startlab",
    "formacao-af-em",
  ]);

  function normalizeComparableText(s) {
    return normalizeText(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getFormacaoDocenteTemplate(platform, context = {}) {
    const sectionTitle = normalizeComparableText(context.sectionTitle || "");
    const sectionIndex = Number.isInteger(context.sectionIndex) ? context.sectionIndex : -1;
    const totalSections = Number.isInteger(context.totalSections) ? context.totalSections : 0;
    const isLast = totalSections > 0 && sectionIndex === totalSections - 1;

    if (platform === "formacao-ai-12") {
      if (sectionTitle.includes("aspectos gerais") || sectionIndex === 0) {
        return ["contextualizacao", "conteudoProgramatico", "resumoAulaAula", "conexaoInterdisciplinar", "rubrica"];
      }
      if (sectionTitle.includes("aulas 1") || sectionIndex === 1) {
        return ["aulas12", "planoDeAula", "diarioDeBordo", "atividadesParaImprimir"];
      }
      return ["orientacoes", "planoDeAula", "diarioDeBordo", "atividadesParaImprimir"];
    }

    if (platform === "formacao-ai-35") {
      if (sectionTitle.includes("modulo 1") || sectionIndex === 0) {
        return [
          "contextualizacao", "conteudoProgramatico", "estrategiasDidaticas", "resumoAulaAula",
          "conexaoInterdisciplinar", "avaliacaoAprendizagem", "orientacoesDidaticasAula",
          "planoDeAula", "diarioDeBordo", "rubrica",
        ];
      }
      if (sectionTitle.includes("modulo 4") || isLast) {
        return ["orientacoesDidaticasAula", "planoDeAula", "diarioDeBordo", "rubrica", "sistematizacao"];
      }
      return [
        "orientacoesDidaticasAula", "planoDeAula", "diarioDeBordo", "rubrica",
        "orientacoesDidaticasAula", "planoDeAula", "diarioDeBordo", "rubrica",
      ];
    }

    if (platform === "formacao-af-startlab") {
      if (sectionTitle.includes("orientacoes") || sectionIndex === 0) {
        return ["contextualizacao", "aulas1a4", "aulas5a8", "sistematizacao"];
      }
      if (sectionTitle.includes("recursos") || sectionIndex === 1) {
        return ["startlab", "gabaritoAvaliacao", "rubrica", "materialProfessor"];
      }
      return ["aulaProjeto"];
    }

    if (platform === "formacao-af-em") {
      if (sectionTitle.includes("orientacoes") || sectionIndex === 0) {
        return ["contextualizacao", "aulas1a4", "aulas5a8", "sistematizacao"];
      }
      return ["projetoInstrutor", "gabaritoAvaliacao", "rubrica", "materialProfessor"];
    }

    return null;
  }

  const EXERCISE_TYPES = /única escolha|múltipla escolha|ordenar blocos|arrastar e soltar|verdadeiro ou falso|preencha os campos|sem resposta do aluno/i;

  function getOrderTemplate(platform, context = {}) {
    if (!platform) return null;
    if (FORMACAO_DOCENTE_PLATFORMS.has(platform)) return getFormacaoDocenteTemplate(platform, context);
    if (!ORDER_TEMPLATES[platform]) return null;
    if (platform !== "tecnico") return ORDER_TEMPLATES[platform];

    const hasSectionContext = Number.isInteger(context.sectionIndex) && Number.isInteger(context.totalSections);
    if (!hasSectionContext) return ORDER_TEMPLATES.tecnico;

    const isFirst = context.sectionIndex === 0;
    const isLast = context.totalSections > 0 && context.sectionIndex === context.totalSections - 1;
    const template = [];

    if (isFirst) template.push("oQueAprendemos");
    template.push("preparandoAmbiente", "video", "aprofundamento", "exercicio", "exercicio");
    if (isLast) template.push("conclusao");

    return template;
  }

  function classifyTask(task) {
    const title = normalizeText(task.title || "").toLowerCase();
    const plain = normalizeComparableText(task.title || "");
    const type  = task.type || "";
    if (plain.includes("contextualizacao")) return "contextualizacao";
    if (plain.includes("conteudo programatico")) return "conteudoProgramatico";
    if (plain.includes("estrategias didaticas")) return "estrategiasDidaticas";
    if (plain.includes("resumo") && plain.includes("aula")) return "resumoAulaAula";
    if (plain.includes("conexao interdisciplinar")) return "conexaoInterdisciplinar";
    if (plain.includes("avaliacao de aprendizagem")) return "avaliacaoAprendizagem";
    if (plain.includes("orientacoes didaticas") && plain.includes("aula")) return "orientacoesDidaticasAula";
    if (plain === "orientacoes" || plain.includes("orientacoes")) return "orientacoes";
    if (plain.includes("plano de aula") || plain.includes("planos de aula")) return "planoDeAula";
    if (plain.includes("diario de bordo") || plain.includes("diarios de bordo")) return "diarioDeBordo";
    if (plain.includes("atividades para imprimir")) return "atividadesParaImprimir";
    if (plain.includes("aulas 1 e 2")) return "aulas12";
    if (/aulas?\s*1\s*a\s*4/.test(plain)) return "aulas1a4";
    if (/aulas?\s*5\s*a\s*8/.test(plain)) return "aulas5a8";
    if (plain.includes("sistematizacao")) return "sistematizacao";
    if (plain.includes("gabarito") && plain.includes("avaliacao")) return "gabaritoAvaliacao";
    if (plain.includes("material do professor")) return "materialProfessor";
    if (plain.includes("projeto do instrutor") || plain.includes("projetos do instrutor")) return "projetoInstrutor";
    if (plain === "startlab") return "startlab";
    if (/^aula\s+\d+/.test(plain) || plain === "aula x") return "aulaProjeto";
    if (plain.includes("rubrica")) return "rubrica";
    if (title.includes("o que vamos aprender"))  return "oQueVamosAprender";
    const isPreparandoAmbiente = title.includes("preparando o ambiente") || title.includes("preparando ambiente");
    if (isPreparandoAmbiente && title.includes("lista de materiais")) return "listaMateriais";
    if (isPreparandoAmbiente) return "preparandoAmbiente";
    if (title.includes("projeto startlab"))      return "projetoStartlab";
    if (title.includes("faça como eu fiz"))      return "facaComoEuFiz";
    if (title.includes("para saber mais"))       return "paraSaberMais";
    if (title.includes("hora do desafio"))       return "horaDoDesafio";
    if (title.includes("compartilhe seu projeto")) return "compartilheProjeto";
    if (title.includes("videos para sp") || title.includes("vídeos para sp")) return "videosParaSP";
    if (title.includes("glossário") || title.includes("glossario")) return "glossario";
    if (title.includes("o que aprendemos"))           return "oQueAprendemos";
    if (title.includes("conclusão") || title.includes("conclusao")) return "conclusao";
    if (title.includes("aprofundamento"))        return "aprofundamento";
    if (type === "Vídeo")                        return "video";
    if (EXERCISE_TYPES.test(type))               return "exercicio";
    return null;
  }

  function computeCorrectOrder(tasks, platform, context = {}) {
    const template = getOrderTemplate(platform, context);
    if (!template) return tasks;
    const classified = tasks.map(t => ({ task: t, cat: classifyTask(t) }));
    const used = new Set();
    const result = [];

    for (const cat of template) {
      const idx = classified.findIndex((c, i) => !used.has(i) && c.cat === cat);
      if (idx >= 0) { used.add(idx); result.push(tasks[idx]); }
    }
    // Remaining (unknown category or extras) keep their relative order
    for (let i = 0; i < tasks.length; i++) {
      if (!used.has(i)) result.push(tasks[i]);
    }
    return result;
  }

  function validateSectionOrder(tasks, platform, context = {}) {
    const template = getOrderTemplate(platform, context);
    if (!template) return [];
    const errors = [];
    let ptr = 0;

    for (const task of tasks) {
      const cat = classifyTask(task);
      if (!cat) continue;

      // Busca a categoria no template a partir do ponteiro atual
      let found = -1;
      for (let i = ptr; i < template.length; i++) {
        if (template[i] === cat) { found = i; break; }
      }

      if (found >= 0) {
        ptr = found + 1;
      } else {
        // Verifica se é apenas repetição da última categoria (ex: 4º exercício)
        const lastMatched = ptr > 0 ? template[ptr - 1] : null;
        if (lastMatched === cat) continue;

        if (platform === "tecnico" && ["oQueAprendemos", "conclusao"].includes(cat) && !template.includes(cat)) {
          errors.push(`"${task.title}" (${task.type}) n\u00e3o pertence a esta aula`);
          continue;
        }

        // Verifica se a categoria já foi consumida (fora de ordem)
        if (template.slice(0, ptr).includes(cat)) {
          errors.push(`"${task.title}" (${task.type}) está fora de ordem`);
        }
      }
    }

    return errors;
  }

  function validateTecnicoSectionRules(tasks, context = {}, luriMap = {}) {
    const isFirst = context.sectionIndex === 0;
    const isLast = context.totalSections > 0 && context.sectionIndex === context.totalSections - 1;
    let videoCount = 0;
    let aprofCount = 0;
    let luriCount = 0;
    let learnedCount = 0;
    let conclusionCount = 0;

    for (const task of tasks) {
      const cat = classifyTask(task);
      if (cat === "video") videoCount++;
      if (cat === "aprofundamento") aprofCount++;
      if (cat === "exercicio" && luriMap[task.editUrl] === true) luriCount++;
      if (cat === "oQueAprendemos") learnedCount++;
      if (cat === "conclusao") conclusionCount++;
    }

    const errors = [];
    if (isFirst && learnedCount !== 1) {
      errors.push(`${learnedCount === 0 ? "Sem atividade" : learnedCount + " atividades"} "O que vamos aprender" — deve ter exatamente 1 na primeira aula.`);
    }
    if (!isFirst && learnedCount > 0) {
      errors.push('"O que vamos aprender" deve aparecer apenas na primeira aula.');
    }
    if (videoCount !== 1) {
      errors.push(`${videoCount} v\u00eddeo(s) principal(is) — deve ter exatamente 1.`);
    }
    if (aprofCount !== 1) {
      errors.push(`${aprofCount === 0 ? "Sem atividade" : aprofCount + " atividades"} "Aprofundamento" — deve ter exatamente 1.`);
    }
    if (luriCount !== 2) {
      errors.push(`${luriCount} exerc\u00edcio(s) Luri — deve ter exatamente 2.`);
    }
    if (isLast && conclusionCount !== 1) {
      errors.push(`${conclusionCount === 0 ? "Sem atividade" : conclusionCount + " atividades"} "Conclus\u00e3o" — deve ter exatamente 1 na \u00faltima aula.`);
    }
    if (!isLast && conclusionCount > 0) {
      errors.push('"Conclus\u00e3o" deve aparecer apenas na \u00faltima aula.');
    }

    return errors;
  }

  // ---------- Revisão via admin ----------
  async function processSectionTasks(courseId, section, si, totalSections, state, updateProgress) {
    const sectionErrors = [];

    updateProgress(si, totalSections, section, null, null, null);

    let tasks;
    try {
      const result = await getAdminSectionTasks(courseId, section.id, { includeInactive: !!state.isEmBreve });
      tasks = result.tasks;
      if (result.reordered) state.issues.reorderedSections.push(section.title);
    } catch (e) {
      sectionErrors.push(`Erro ao buscar atividades da seção "${section.title}": ${e.message}`);
      return sectionErrors;
    }

    let videoCount = 0, aprofCount = 0, luriCount = 0, learnedCount = 0, conclusionCount = 0;

    for (let ti = 0; ti < tasks.length; ti++) {
      const task = tasks[ti];
      updateProgress(si, totalSections, section, ti, tasks.length, task);

      const { videoUrl, htmlContents, transcriptionText, isLuri } = await getAdminTaskContent(task.editUrl);

      // Verifica URL e transcrição para atividades de vídeo.
      // transcriptionText é lido após polling em background.js, que aguarda o EasyMDE
      // e o AJAX da página terminarem — evita falso positivo por leitura precoce.
      if (task.type === "Vídeo") {
        const hasUrl = videoUrl && videoUrl.trim() !== "0" && videoUrl.trim() !== "";
        const hasTranscription = (transcriptionText || "").replace(/\s+/g, "").length > 50;

        if (hasUrl) state.totalActiveVideos = (state.totalActiveVideos || 0) + 1;

        if (hasUrl && !hasTranscription) {
          addIssue(state, "missingTranscription", task.editUrl);
        }

        if (hasUrl && task.activityUrl && !state.isEmBreve) {
          loadVideoDuration(task.activityUrl);
        }
      }

      // Checks de links em todo o conteúdo HTML da atividade
      const allLinks = [];
      for (const html of htmlContents) {
        const root = parseHtmlContent(html);

        const emptyCheck = collectEmptyHrefLinksInCurrentTask(root);
        if (emptyCheck.hasIssue) addIssue(state, "emptyHref", task.editUrl);

        const ghCheck = collectNonStandardGithubLinksInCurrentTask(root);
        if (ghCheck.hasIssue) addIssueDetails(state, "githubNonStandard", task.editUrl, ghCheck.links);

        const cloudCheck = collectNonOfficialCloudLinksInCurrentTask(root);
        if (cloudCheck.hasIssue) addIssueDetails(state, "nonOfficialCloud", task.editUrl, cloudCheck.links);

        allLinks.push(...collectAllHttpLinksInCurrentTask(root));
      }

      if (allLinks.length > 0) {
        const bad404 = await check404ViaBackground(Array.from(new Set(allLinks)));
        if (bad404.length > 0) addIssueDetails(state, "link404", task.editUrl, bad404);
      }

      // Contadores para regras do Curso Técnico (apenas tasks ativas)
      if (state.productType === "tecnico" && task.active) {
        const hasUrl = videoUrl && videoUrl.trim() !== "0" && videoUrl.trim() !== "";
        const cat = classifyTask(task);
        if (cat === "video" && hasUrl) videoCount++;
        if (cat === "aprofundamento") aprofCount++;
        if (cat === "exercicio" && isLuri) luriCount++;
        if (cat === "oQueAprendemos") learnedCount++;
        if (cat === "conclusao") conclusionCount++;
      }
    }

    // ---- Validação de ordem das atividades ----
    if (state.platform) {
      const orderErrors = validateSectionOrder(tasks, state.platform, { sectionIndex: si, totalSections, sectionTitle: section.title });
      if (orderErrors.length > 0) {
        state.issues.orderIssues = state.issues.orderIssues || [];
        state.issues.orderIssues.push({ section: section.title, errors: orderErrors });
      }
    }

    // ---- Regras Curso Técnico por seção ----
    if (state.productType === "tecnico") {
      const isFirst   = si === 0;
      const isLast    = si === totalSections - 1;

      if (isFirst && learnedCount !== 1) {
        state.issues.tecnicoRules.push(`Se\u00e7\u00e3o "${section.title}": ${learnedCount === 0 ? "sem atividade" : learnedCount + " atividades"} "O que vamos aprender" — deve ter exatamente 1 na primeira aula.`);
      }
      if (!isFirst && learnedCount > 0) {
        state.issues.tecnicoRules.push(`Se\u00e7\u00e3o "${section.title}": "O que vamos aprender" deve aparecer apenas na primeira aula.`);
      }
      if (videoCount !== 1) {
        state.issues.tecnicoRules.push(`Se\u00e7\u00e3o "${section.title}": ${videoCount} v\u00eddeo(s) principal(is) — deve ter exatamente 1.`);
      }
      if (aprofCount !== 1) {
        state.issues.tecnicoRules.push(`Se\u00e7\u00e3o "${section.title}": ${aprofCount === 0 ? "sem atividade" : aprofCount + " atividades"} "Aprofundamento" — deve ter exatamente 1.`);
      }
      if (luriCount !== 2) {
        state.issues.tecnicoRules.push(`Se\u00e7\u00e3o "${section.title}": ${luriCount} exerc\u00edcio(s) Luri — deve ter exatamente 2.`);
      }
      if (isLast && conclusionCount !== 1) {
        state.issues.tecnicoRules.push(`Se\u00e7\u00e3o "${section.title}": ${conclusionCount === 0 ? "sem atividade" : conclusionCount + " atividades"} "Conclus\u00e3o" — deve ter exatamente 1 na \u00faltima aula.`);
      }
      if (!isLast && conclusionCount > 0) {
        state.issues.tecnicoRules.push(`Se\u00e7\u00e3o "${section.title}": "Conclus\u00e3o" deve aparecer apenas na \u00faltima aula.`);
      }
    }

    return sectionErrors;
  }

  async function reviewViaAdmin(courseId, state) {
    let progressOverlay = null;

    try {
      // Verificação dos campos do admin de vendas
      const adminFields = await getAdminFields(courseId);
      if (adminFields) {
        const { courseName, courseCode, estimatedHours,
                metaDescription, highlightedInformation, ementa,
                courseExclusive, forumBlocked } = adminFields;

        // Guarda para comparar com total de tasks após processar seções
        state._estimatedHours = parseInt(estimatedHours) || 0;
        state._courseName = courseName;

        const isEmBreve = /em\s*breve/i.test(courseName);
        if (isEmBreve) {
          state.isEmBreve = true;
        } else {
          const textFields = [
            { value: metaDescription,        label: "Meta Description" },
            { value: highlightedInformation, label: "Faça esse curso e..." },
            { value: ementa,                 label: "Ementa" }
          ];

          for (const { value, label } of textFields) {
            const reason = isInvalidTextField(value, courseName);
            if (reason) state.issues.adminFields.push(`${label} ${reason} — é importante que seja preenchido corretamente.`);
          }

          const codeReason = isInvalidCourseCode(courseCode);
          if (codeReason) state.issues.adminFields.push(`Código do curso ${codeReason} — deve conter apenas letras minúsculas, números e hífens simples, com ao menos duas palavras.`);

          if (!courseExclusive) state.issues.adminFields.push(`Curso não marcado como exclusivo — marcar "Exclusivo de alguma empresa ou produto?".`);
          if (!forumBlocked)   state.issues.adminFields.push(`Fórum não bloqueado — marcar "Bloquear fórum".`);

        }
      }

      const sections = await getAdminSections(courseId);
      const sectionsToProcess = state.isEmBreve ? sections : sections.filter(s => s.active);

      // Detecta seções com nomes genéricos (ex: "Aula 1", "Aula 2")
      const genericSections = sectionsToProcess.filter(s => GENERIC_SECTION_RE.test(s.title));
      if (genericSections.length > 0) {
        state.issues.genericSectionNames = genericSections.map(s => s.title);
      }

      if (sectionsToProcess.length === 0) {
        state.error = "Nenhuma seção encontrada no curso.";
        return state;
      }

      // Overlay criado após saber o total de seções para renderizar uma linha por seção
      progressOverlay = showAdminReviewProgress(sectionsToProcess.length);

      const sectionErrorsNested = await runWithConcurrency(
        sectionsToProcess,
        (section, si) => processSectionTasks(
          courseId, section, si, sectionsToProcess.length, state, updateAdminReviewProgress
        ),
        SECTION_CONCURRENCY
      );

      const allErrors = sectionErrorsNested.flat().filter(Boolean);
      if (allErrors.length > 0) state.error = allErrors.join(" | ");

      // Verifica carga horária: deve ser igual ao número de seções ativas
      if (!state.isEmBreve && state._estimatedHours !== undefined) {
        const expectedHours = sectionsToProcess.length;
        if (expectedHours > 0 && state._estimatedHours !== expectedHours) {
          state.issues.adminFields.push(`Carga horária incorreta. Correto: ${expectedHours} hora(s) (1 hora por seção ativa — total de ${expectedHours} seção(ões)).`);
        }
        delete state._estimatedHours;
        delete state._courseName;
      }

    } catch (e) {
      state.error = state.error || e?.message || String(e);
    } finally {
      progressOverlay?.remove();
    }

    return state;
  }

  // ---------- Fluxo principal ----------
  async function startFromHome(productType = "tecnico", platform = null) {
    console.log("[Revisor] startFromHome iniciado");
    const effectivePlatform = productType === "tecnico" ? "tecnico" : platform;
    await waitFor(() => isHomePage(), 20000);
    console.log("[Revisor] isHomePage OK");

    const courseId = await resolveCourseId();
    console.log("[Revisor] courseId:", courseId);

    if (!courseId) {
      showFinalPopup({
        running: false,
        finished: false,
        transcriptionRawText: "",
        transcriptionIs100: null,
        transcriptionPercentNumber: null,
        hasSubcategory: null,
        catalogOk: false,
        catalogCode: null,
        courseId: null,
        iconStatus: null,
        categorySlug: null,
        courseSlug: null,
        pendingIconCheck: false,
        issues: { emptyHref: [], githubNonStandard: {}, nonOfficialCloud: {}, link404: {}, missingTranscription: [], adminFields: [], reorderedSections: [], genericSectionNames: [], tecnicoRules: [], orderIssues: [] },
        error: "Não foi possível obter o ID do curso."
      });
      return;
    }

    // ---------- Verificação do fórum, tema e subcategorias ----------
    const [adminFields, subResults] = await Promise.all([
      getAdminFields(courseId),
      checkSubcategories(courseId),
    ]);

    const forumBlocked = adminFields ? adminFields.forumBlocked : null;
    console.log("[Revisor] forumBlocked:", forumBlocked);

    const theme = adminFields ? adminFields.theme : null;
    const expectedTheme = productType === "formacaoDocente" ? null : productType === "efai" ? "START_EFAI" : "START_EM";
    const themeOk = expectedTheme ? (theme === null ? null : theme === expectedTheme) : undefined;
    console.log("[Revisor] theme:", theme, "expected:", expectedTheme, "ok:", themeOk);
    console.log("[Revisor] sub127:", subResults.sub127, "sub26:", subResults.sub26);

    showFinalPopup({
      running: false,
      finished: true,
      transcriptionRawText: "",
      transcriptionIs100: null,
      transcriptionPercentNumber: null,
      hasSubcategory: null,
      catalogOk: false,
      catalogCode: null,
      courseId,
      iconStatus: null,
      categorySlug: null,
      courseSlug: null,
      pendingIconCheck: false,
      totalActiveVideos: 0,
      productType,
      platform: effectivePlatform,
      forumBlocked,
      themeOk,
      expectedTheme,
      actualTheme: theme,
      sub27: subResults.sub27,
      sub126: subResults.sub126,
      issues: { emptyHref: [], githubNonStandard: {}, nonOfficialCloud: {}, link404: {}, missingTranscription: [], adminFields: [], reorderedSections: [], genericSectionNames: [], tecnicoRules: [], orderIssues: [] },
      error: null
    });
  }


  // ---------- Tick central ----------
  async function tick() {
    const state = await getState();
    if (!state?.running) return;

    // Modo revisão: só trata reload inesperado
    await finalize(state, "Revisão interrompida por reload da página.");
  }

  // ---------- Heartbeat ----------
  let heartbeatStarted = false;
  function startHeartbeat() {
    if (heartbeatStarted) return;
    heartbeatStarted = true;

    const loop = async () => {
      try {
        await tick();
      } catch (e) {
        const st = await getState();
        if (st?.running) await finalize(st, e?.message || String(e));
      } finally {
        const st = await getState();
        if (st?.running) setTimeout(loop, 800);
        else heartbeatStarted = false;
      }
    };

    loop();
  }

  // ---------- Revisão de transcrição ----------
  // Abre video-uploader.alura.com.br/video/{uploaderCode} uma única vez
  // e retorna nome do vídeo + presença de legendas PT/ESP.
  async function getVideoInfo(uploaderCode, checks, logContext = {}) {
    return await new Promise(resolve => {
      chrome.runtime.sendMessage(
        { type: "ALURA_REVISOR_GET_VIDEO_INFO", uploaderCode, checks, logContext },
        resp => resolve({
          videoName:        resp?.videoName        ?? "",
          hasPortugues:     resp?.hasPortugues     ?? false,
          hasEspanhol:      resp?.hasEspanhol      ?? false,
          legendaSolicitada: resp?.legendaSolicitada ?? false,
          usageLog:         resp?.usageLog         ?? null,
        })
      );
    });
  }

  async function auditCourseTranscription(courseId, checks, courseName = "") {
    const sections = await getAdminSections(courseId);

    // Coleta tarefas de vídeo em paralelo (pool de 4 seções por vez),
    // tolerante a falhas individuais e preservando a ordem das seções.
    const activeSections = sections.filter(s => s.active);
    const sectionTaskLists = new Array(activeSections.length);
    let sectionCursor = 0;
    const SECTION_CONCURRENCY = 2;

    const sectionWorker = async () => {
      while (true) {
        const idx = sectionCursor++;
        if (idx >= activeSections.length) return;
        const section = activeSections[idx];
        try {
          const r = await getAdminSectionTasks(courseId, section.id);
          sectionTaskLists[idx] = { section, tasks: r.tasks || [] };
        } catch (_) {
          sectionTaskLists[idx] = { section, tasks: [] };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(SECTION_CONCURRENCY, activeSections.length) }, sectionWorker)
    );

    const queue = [];
    for (const entry of sectionTaskLists) {
      if (!entry) continue;
      for (const task of entry.tasks) {
        if (task.type !== "Vídeo") continue;
        queue.push({ section: entry.section, task });
      }
    }

    // Pool de workers — processa N vídeos em paralelo, preservando ordem
    const CONCURRENCY = 4;
    const results = new Array(queue.length);
    let cursor = 0;

    const processOne = async ({ section, task }) => {
      const { videoUrl, transcriptionText } = await getAdminTaskContent(task.editUrl);
      const hasUrl = videoUrl && videoUrl.trim() !== "0" && videoUrl.trim() !== "";
      if (!hasUrl) return null;

      const hasTranscription = (transcriptionText || "").replace(/\s+/g, "").length > 50;

      let hasEspanhol = true, hasPortugues = true, legendaSolicitada = false;
      const taskId = task.editUrl.match(/\/task\/edit\/(\d+)/)?.[1] ?? "";
      let videoName = "";
      let uploaderCode = "";

      if (videoUrl.includes("player.vimeo.com")) {
        videoName = "vídeo no vimeo";
      } else {
        uploaderCode = videoUrl.includes("/") ? videoUrl.split("/")[1] : videoUrl;
        const info = await getVideoInfo(uploaderCode, checks, {
          courseId,
          courseName,
          taskId,
          taskTitle: task.title,
          sectionTitle: section.title,
          source: "batch_audit",
        });
        videoName = info.videoName;
        if (checks.pt)  hasPortugues = info.hasPortugues;
        if (checks.esp) hasEspanhol  = info.hasEspanhol;
        legendaSolicitada = info.legendaSolicitada;
      }

      const failed = (checks.transcription && !hasTranscription)
        || (checks.esp && !hasEspanhol)
        || (checks.pt && !hasPortugues);

      return {
        taskId, sectionTitle: section.title, title: task.title,
        videoName, uploaderCode,
        hasTranscription, hasEspanhol, hasPortugues, legendaSolicitada,
        checks, failed
      };
    };

    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= queue.length) return;
        try {
          results[idx] = await processOne(queue[idx]);
        } catch (_) {
          // silencioso: falha em um vídeo não derruba o curso
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)
    );

    return results.filter(Boolean);
  }

  function htmlToText(html) {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent.replace(/\s+/g, " ").trim();
  }

  async function getCourseTextualSections(courseId) {
    const sections = await getAdminSections(courseId);
    const result = [];
    for (const section of sections.filter(s => s.active)) {
      const { tasks } = await getAdminSectionTasks(courseId, section.id);
      const taskData = [];
      for (const task of tasks.filter(t => t.active)) {
        const content = await getAdminTaskContent(task.editUrl);
        taskData.push({
          type: task.type,
          title: task.title,
          videoUrl: content.videoUrl,
          transcriptionText: content.transcriptionText,
          htmlContents: content.htmlContents,
          alternatives: content.alternatives,
        });
      }
      result.push({ title: section.title, tasks: taskData });
    }
    return result;
  }

  async function getCourseTextualInfo(courseId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ALURA_REVISOR_GET_COURSE_TEXTUAL", courseId }, (resp) => {
        resolve(resp);
      });
    });
  }

  function generateTextualMd(textualResults) {
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;
    let md = `# Download Textual — ${dateStr}\n\n`;
    for (const item of textualResults) {
      const { courseId, fields, error } = item;
      md += `---\n\n## Curso ID: ${courseId}\n\n`;
      if (error || !fields) {
        md += `> Erro ao coletar informações: ${error || "desconhecido"}\n\n`;
        continue;
      }
      const f = fields;
      const link = f.courseCode ? `https://cursos.alura.com.br/start/course/${f.courseCode}` : "Null";
      md += `- **Nome do curso:** ${f.courseName || "Null"}\n`;
      md += `- **Tradução do nome em inglês:** ${f.nameInEnglish || "Null"}\n`;
      md += `- **Tradução do nome em espanhol:** ${f.nameInSpanish || "Null"}\n`;
      md += `- **Link do curso:** ${link}\n`;
      md += `- **Horas:** ${f.estimatedHours || "Null"}\n`;
      md += `- **Meta Description:** ${f.metaDescription || "Null"}\n`;
      md += `- **Exclusivo:** ${f.courseExclusive ? "True" : "False"}\n`;
      md += `- **Desativado:** ${f.coursePrivate ? "True" : "False"}\n`;
      md += `- **Público-alvo:** ${f.targetPublic || "Null"}\n`;
      md += `- **Autor(es):** ${f.authors || "Null"}\n`;
      md += `- **Faça esse curso e...:** ${f.highlightedInformation || "Null"}\n`;
      md += `- **Ementa:**\n\n${f.ementa || "Null"}\n\n`;

      // Seções e atividades
      const sections = item.sections || [];
      if (sections.length > 0) {
        md += `---\n\n`;
        for (const section of sections) {
          md += `### Aula — ${section.title}\n\n`;
          for (const task of section.tasks || []) {
            const isOqueAprendemos = task.title?.toLowerCase().includes("o que vamos aprender");
            const typeLabel = task.type === "Vídeo" ? "video"
              : isOqueAprendemos ? "O que vamos aprender"
              : task.type === "Texto" ? "Texto explicativo"
              : "Atividade";

            md += `**${typeLabel} — ${task.title || "sem título"}**\n\n`;

            if (task.type === "Vídeo") {
              md += task.transcriptionText
                ? `${task.transcriptionText}\n\n`
                : `_Sem transcrição_\n\n`;
            } else if (typeLabel === "O que vamos aprender" || typeLabel === "Texto explicativo") {
              const txt = htmlToText(task.htmlContents?.[0] || "");
              md += txt ? `${txt}\n\n` : `_Sem conteúdo_\n\n`;
            } else {
              const enunciado = htmlToText(task.htmlContents?.[0] || "");
              if (enunciado) md += `Enunciado:\n${enunciado}\n\n`;
              const correct = (task.alternatives || []).filter(a => a.correct);
              if (correct.length > 0) {
                md += `Alternativas corretas:\n`;
                for (const alt of correct) md += `- ${htmlToText(alt.body)}\n`;
                md += `\n`;
              }
            }

            md += `---\n\n`;
          }
        }
      }
    }
    return md;
  }

  function buildTextualFilename(item) {
    const id = item.courseId;
    const name = (item.fields?.courseName || "").replace(/[^a-zA-Z0-9À-ú\s]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
    return name ? `download-textual-${id}-${name}.md` : `download-textual-${id}.md`;
  }

  function downloadTextualMd(textualResults) {
    const md = generateTextualMd(textualResults);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const nameParts = textualResults.map(r => {
      const id = r.courseId;
      const name = (r.fields?.courseName || "").replace(/[^a-zA-Z0-9À-ú\s]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
      return name ? `${id}-${name}` : id;
    });
    a.download = `download-textual-${nameParts.join("_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadTextualMdPerCourse(textualResults) {
    for (const item of textualResults) {
      const md = generateTextualMd([item]);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildTextualFilename(item);
      a.click();
      URL.revokeObjectURL(url);
      if (textualResults.length > 1) await new Promise(r => setTimeout(r, 300));
    }
  }

  async function runBatchTranscriptionAudit(courseIds, checks, courseNames = {}) {
    const { modal, overlay } = createOverlayModal("420px");
    const titleEl = document.createElement("h3");
    titleEl.style.cssText = "margin:0 0 14px;font-weight:700;font-size:16px;";
    titleEl.textContent = "Auditoria em lote";
    modal.appendChild(titleEl);
    const progressEl = document.createElement("p");
    progressEl.style.cssText = "margin:0;font-size:14px;color:#555;";
    modal.appendChild(progressEl);

    const allResults = [];
    const textualResults = [];

    for (let i = 0; i < courseIds.length; i++) {
      const courseId = courseIds[i];
      progressEl.textContent = `Curso ${i + 1}/${courseIds.length} — ID: ${courseId}…`;
      if (checks.transcription || checks.pt || checks.esp) {
        try {
          const results = await auditCourseTranscription(courseId, checks, courseNames?.[String(courseId)] || "");
          for (const r of results) allResults.push({ courseId, ...r });
        } catch (e) {
          allResults.push({ courseId, taskId: "", videoUrl: "", videoName: `Erro: ${e?.message || String(e)}` });
        }
      }
      if (checks.downloadTextual) {
        try {
          const resp = await getCourseTextualInfo(courseId);
          const sections = await getCourseTextualSections(courseId);
          textualResults.push({ courseId, fields: resp?.ok ? resp : null, sections, error: resp?.ok ? null : (resp?.error || "Erro desconhecido") });
        } catch (e) {
          textualResults.push({ courseId, fields: null, sections: [], error: e?.message || String(e) });
        }
      }
    }

    overlay.remove();
    showBatchTranscriptionReport(allResults, courseIds.length, courseIds, { textualResults, checks });
  }

  function showBatchTranscriptionReport(allResults, totalCourses, courseIds, opts = {}) {
    const persistHistory = opts.persistHistory !== false;
    const textualResults = opts.textualResults || [];
    const checks = opts.checks || {};
    const hasTextual = textualResults.length > 0;
    const hasTranscriptionChecks = !!(checks.transcription || checks.pt || checks.esp);
    const onlyTextual = hasTextual && !hasTranscriptionChecks;

    // Separate all videos from failed-only for summary counts
    const failedResults = allResults.filter(r => r.failed);

    const { modal, overlay } = createOverlayModal("760px");

    // ---------- Título ----------
    const title = document.createElement("h3");
    title.style.cssText = "margin:0 0 16px 0;color:#1c1c1c;font-weight:700;font-size:16px;";
    if (onlyTextual) {
      title.textContent = `Auditoria completa ✅ (${totalCourses} curso(s))`;
    } else {
      title.textContent = failedResults.length === 0
        ? `Auditoria em lote: Tudo OK ✅ (${totalCourses} curso(s))`
        : `Auditoria em lote: ${failedResults.length} vídeo(s) com pendências ⚠️`;
    }
    modal.appendChild(title);

    // ---------- Banner: legendas solicitadas automaticamente ----------
    const generationCount = allResults.filter(r => r.legendaSolicitada).length;
    if (generationCount > 0) {
      const genBanner = document.createElement("div");
      genBanner.style.cssText = "padding:10px 14px;border-radius:8px;background:#fff4e5;border:1px solid #f57c00;margin-bottom:14px;font-size:13px;font-weight:600;color:#bf5b00;";
      genBanner.textContent = generationCount === 1
        ? "📝 1 legenda foi solicitada automaticamente"
        : `📝 ${generationCount} legendas foram solicitadas automaticamente`;
      modal.appendChild(genBanner);
    }

    // ---------- Banner textual (modo combinado) ----------
    if (hasTextual && hasTranscriptionChecks) {
      const textualBanner = document.createElement("div");
      textualBanner.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:8px;background:#f0f7ff;border:1px solid #b3d4f5;margin-bottom:14px;gap:12px;";
      const bannerLabel = document.createElement("span");
      bannerLabel.style.cssText = "font-size:13px;font-weight:600;color:#0060b8;flex:1;";
      bannerLabel.textContent = "📥 Informações textuais prontas para baixar";
      const bannerBtnAll = document.createElement("button");
      bannerBtnAll.style.cssText = "padding:6px 14px;border:0;border-radius:6px;cursor:pointer;background:#067ada;color:#fff;font-size:12px;font-weight:600;font-family:inherit;white-space:nowrap;";
      bannerBtnAll.textContent = "Baixar tudo (.md)";
      bannerBtnAll.onclick = () => downloadTextualMd(textualResults);
      const bannerBtnPer = document.createElement("button");
      bannerBtnPer.style.cssText = "padding:6px 14px;border:1.5px solid #067ada;border-radius:6px;cursor:pointer;background:#fff;color:#067ada;font-size:12px;font-weight:600;font-family:inherit;white-space:nowrap;";
      bannerBtnPer.textContent = "Baixar por curso";
      bannerBtnPer.onclick = () => downloadTextualMdPerCourse(textualResults);
      textualBanner.appendChild(bannerLabel);
      textualBanner.appendChild(bannerBtnAll);
      textualBanner.appendChild(bannerBtnPer);
      modal.appendChild(textualBanner);
    }

    // Agrupar por courseId (todos os vídeos)
    const byCourse = {};
    for (const r of allResults) {
      if (!byCourse[r.courseId]) byCourse[r.courseId] = [];
      byCourse[r.courseId].push(r);
    }

    const allCourseIds = courseIds || Object.keys(byCourse);
    const failedCourseIds = new Set(failedResults.map(r => String(r.courseId)));
    const coursesOk = allCourseIds.filter(id => !failedCourseIds.has(String(id)));

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    let reportText = `Auditoria em lote — ${dateStr}\n`;

    const scrollBox = document.createElement("div");
    scrollBox.style.cssText = "max-height:480px;overflow-y:auto;margin-bottom:16px;";

    if (allResults.length === 0) {
      const p = document.createElement("p");
      p.style.cssText = "margin:0 0 20px 0;font-size:14px;color:#555;";
      p.textContent = onlyTextual
        ? `Informações textuais de ${totalCourses} curso(s) coletadas.`
        : `Todos os ${totalCourses} curso(s) auditados estão com transcrição e legendas completas.`;
      scrollBox.appendChild(p);
      reportText += `\nTodos os ${totalCourses} curso(s) estão OK.\n`;
    } else {
      // ── Tabela por curso ──────────────────────────────────
      const TH = "padding:6px 10px;text-align:left;background:#f0f0f0;border-bottom:2px solid #ddd;font-size:11px;font-weight:700;white-space:nowrap;";
      const THc = TH + "text-align:center;";

      for (const courseId of allCourseIds) {
        const items = byCourse[courseId] || [];
        const failCount = items.filter(r => r.failed).length;

        // Cabeçalho do curso
        const courseHeader = document.createElement("div");
        courseHeader.style.cssText = "font-weight:700;font-size:13px;margin:16px 0 6px;color:#1c1c1c;display:flex;align-items:center;gap:8px;";
        courseHeader.innerHTML = `Curso ${courseId} <span style="font-weight:400;font-size:12px;color:${failCount > 0 ? "#c62828" : "#00a857"};">${failCount > 0 ? `⚠️ ${failCount} pendência(s)` : "✅ OK"}</span>`;
        scrollBox.appendChild(courseHeader);

        if (items.length === 0) {
          const noData = document.createElement("div");
          noData.style.cssText = "font-size:12px;color:#888;margin-bottom:8px;";
          noData.textContent = "Nenhum vídeo encontrado.";
          scrollBox.appendChild(noData);
          continue;
        }

        const table = document.createElement("table");
        table.style.cssText = "width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;";

        // Cabeçalho da tabela
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        const cols = [
          { label: "Seção", style: TH },
          { label: "Aula", style: TH },
          { label: "Código Uploader", style: TH },
        ];
        if (checks.pt)            cols.push({ label: "PT", style: THc });
        if (checks.esp)           cols.push({ label: "ESP", style: THc });
        if (checks.transcription) cols.push({ label: "Transcrição", style: THc });
        cols.forEach(({ label, style }) => {
          const th = document.createElement("th");
          th.style.cssText = style;
          th.textContent = label;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Linhas
        const tbody = document.createElement("tbody");
        items.forEach((item, i) => {
          const c = item.checks || { transcription: true, pt: true, esp: true };
          const tr = document.createElement("tr");
          tr.style.cssText = `background:${i % 2 === 0 ? "#fff" : "#fafafa"};${item.failed ? "border-left:3px solid #f44336;" : ""}`;

          const TD = "padding:5px 10px;border-bottom:1px solid #eee;vertical-align:middle;";
          const TDc = TD + "text-align:center;font-size:15px;";

          const tdSec = document.createElement("td");
          tdSec.style.cssText = TD + "color:#555;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          tdSec.title = item.sectionTitle || "";
          tdSec.textContent = item.sectionTitle || "—";

          const tdAula = document.createElement("td");
          tdAula.style.cssText = TD + "max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          tdAula.title = item.title || "";
          tdAula.textContent = item.title || item.videoName || "—";

          const tdCode = document.createElement("td");
          tdCode.style.cssText = TD + "font-family:monospace;font-size:11px;color:#444;";
          if (item.legendaSolicitada) {
            const codeSpan = document.createElement("span");
            codeSpan.textContent = item.uploaderCode || "vimeo";
            const reqSpan = document.createElement("span");
            reqSpan.textContent = " 📝";
            reqSpan.title = "Geração de legenda solicitada automaticamente";
            reqSpan.style.cssText = "color:#f57c00;font-weight:600;";
            tdCode.appendChild(codeSpan);
            tdCode.appendChild(reqSpan);
          } else {
            tdCode.textContent = item.uploaderCode || "vimeo";
          }

          tr.appendChild(tdSec);
          tr.appendChild(tdAula);
          tr.appendChild(tdCode);

          const check = (ok) => {
            const td = document.createElement("td");
            td.style.cssText = TDc;
            td.innerHTML = ok
              ? `<span style="color:#00a857;font-size:16px;">✓</span>`
              : `<span style="color:#f44336;font-size:16px;">✗</span>`;
            return td;
          };

          if (checks.pt)            tr.appendChild(check(item.hasPortugues));
          if (checks.esp)           tr.appendChild(check(item.hasEspanhol));
          if (checks.transcription) tr.appendChild(check(item.hasTranscription));

          tbody.appendChild(tr);

          // Texto para copiar
          const c2 = c;
          let line = `${item.sectionTitle || ""} | ${item.title || ""} | ${item.uploaderCode || "vimeo"}`;
          if (c2.pt)            line += ` | PT: ${item.hasPortugues ? "OK" : "FALTA"}`;
          if (c2.esp)           line += ` | ESP: ${item.hasEspanhol ? "OK" : "FALTA"}`;
          if (c2.transcription) line += ` | Transcrição: ${item.hasTranscription ? "OK" : "FALTA"}`;
          if (item.legendaSolicitada) line += ` | 📝 Geração solicitada`;
          reportText += line + "\n";
        });

        table.appendChild(tbody);
        scrollBox.appendChild(table);
      }
    }

    modal.appendChild(scrollBox);

    // ---------- Botões ----------
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;";

    if (onlyTextual && hasTextual) {
      const mdAllBtn = document.createElement("button");
      mdAllBtn.style.cssText = "padding:9px 18px;border:0;border-radius:8px;cursor:pointer;background:#067ada;color:#fff;font-size:13px;font-weight:600;font-family:inherit;";
      mdAllBtn.textContent = "Baixar tudo (.md)";
      mdAllBtn.onclick = () => downloadTextualMd(textualResults);
      btnRow.appendChild(mdAllBtn);

      const mdPerBtn = document.createElement("button");
      mdPerBtn.style.cssText = "padding:9px 18px;border:1.5px solid #067ada;border-radius:8px;cursor:pointer;background:#fff;color:#067ada;font-size:13px;font-weight:600;font-family:inherit;";
      mdPerBtn.textContent = "Baixar por curso";
      mdPerBtn.onclick = () => downloadTextualMdPerCourse(textualResults);
      btnRow.appendChild(mdPerBtn);
    }

    if (!onlyTextual) {
      if (allResults.length > 0) {
        const copyBtn = document.createElement("button");
        copyBtn.style.cssText = "padding:9px 18px;border:1.5px solid #ddd;border-radius:8px;cursor:pointer;background:#fff;color:#1c1c1c;font-size:13px;font-weight:600;font-family:inherit;";
        copyBtn.textContent = "Copiar tabela";
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(reportText.trim()).then(() => {
            copyBtn.textContent = "Copiado!";
            setTimeout(() => { copyBtn.textContent = "Copiar tabela"; }, 1500);
          });
        };
        btnRow.appendChild(copyBtn);
      }
    }

    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = "padding:9px 18px;border:1.5px solid #ddd;border-radius:8px;cursor:pointer;background:#fff;color:#1c1c1c;font-size:13px;font-weight:600;font-family:inherit;";
    closeBtn.textContent = "Fechar";
    closeBtn.onclick = () => overlay.remove();
    btnRow.appendChild(closeBtn);

    modal.appendChild(btnRow);

    // ---------- Salvar no histórico ----------
    if (persistHistory) {
      saveToHistory({
        type: "batchAudit",
        runAt: Date.now(),
        courseIds: allCourseIds,
        totalCourses,
        ok: allResults.length === 0,
        batchResults: allResults,
        textualResults,
        checks,
      });
    }
  }

  // ---------- Start via popup ----------
  let starting = false;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_START") return;

    (async () => {
      try {
        if (starting) return sendResponse({ ok: false, error: "Já estou iniciando uma execução." });
        starting = true;

        await clearState();
        if (!isHomePage()) return sendResponse({ ok: false, error: "Abra a Home do curso antes de clicar Start." });

        sendResponse({ ok: true });
        await startFromHome(msg.productType || "tecnico", msg.platform || null);
        startHeartbeat();
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      } finally {
        starting = false;
      }
    })();

    return true;
  });

  // ---------- Show report via popup ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_SHOW_REPORT") return;
    showFinalPopup(msg.state, { persistHistory: false });
    sendResponse({ ok: true });
    return true;
  });

  // Busca nomes dos cursos e mostra modal de confirmação antes de auditar.
  async function confirmAndRunBatchTranscriptionAudit(courseIds, checks) {
    const { modal, overlay } = createOverlayModal("480px");

    const title = document.createElement("h3");
    title.style.cssText = "margin:0 0 12px;font-weight:700;font-size:16px;color:#1c1c1c;";
    title.textContent = "Confirmar cursos";
    modal.appendChild(title);

    const status = document.createElement("p");
    status.style.cssText = "margin:0 0 12px;font-size:13px;color:#555;";
    status.textContent = `Buscando nomes de ${courseIds.length} curso(s)…`;
    modal.appendChild(status);

    // Busca nomes em paralelo (pool de 2)
    const NAME_CONCURRENCY = 2;
    const names = new Array(courseIds.length);
    let nameCursor = 0;
    const nameWorker = async () => {
      while (true) {
        const idx = nameCursor++;
        if (idx >= courseIds.length) return;
        const id = courseIds[idx];
        try {
          const resp = await getCourseTextualInfo(id);
          names[idx] = resp?.ok
            ? { id, name: (resp.courseName || "").trim() || "(sem nome)", error: null }
            : { id, name: null, error: resp?.error || "Erro desconhecido" };
        } catch (e) {
          names[idx] = { id, name: null, error: e?.message || String(e) };
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(NAME_CONCURRENCY, courseIds.length) }, nameWorker)
    );

    status.remove();

    const listLabel = document.createElement("p");
    listLabel.style.cssText = "margin:0 0 8px;font-size:13px;color:#1c1c1c;font-weight:600;";
    listLabel.textContent = "Confirma a auditoria e geração de legenda dos cursos abaixo?";
    modal.appendChild(listLabel);

    const list = document.createElement("ul");
    list.style.cssText = "margin:0 0 16px;padding:0;list-style:none;max-height:300px;overflow-y:auto;border:1px solid #eee;border-radius:8px;";
    for (const { id, name, error } of names) {
      const li = document.createElement("li");
      li.style.cssText = "padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;display:flex;gap:10px;align-items:baseline;";
      const idSpan = document.createElement("span");
      idSpan.style.cssText = "font-family:monospace;color:#666;min-width:54px;flex-shrink:0;";
      idSpan.textContent = id;
      const nameSpan = document.createElement("span");
      if (name) {
        nameSpan.textContent = name;
        nameSpan.style.cssText = "color:#1c1c1c;";
      } else {
        nameSpan.textContent = `⚠️ ${error || "Curso não encontrado"}`;
        nameSpan.style.cssText = "color:#c62828;";
      }
      li.appendChild(idSpan);
      li.appendChild(nameSpan);
      list.appendChild(li);
    }
    modal.appendChild(list);

    const validIds = names.filter(n => n.name).map(n => n.id);
    const validCourseNames = {};
    for (const item of names) {
      if (item.name) validCourseNames[String(item.id)] = item.name;
    }

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

    const cancelBtn = document.createElement("button");
    cancelBtn.style.cssText = "padding:9px 18px;border:1.5px solid #ddd;border-radius:8px;cursor:pointer;background:#fff;color:#1c1c1c;font-size:13px;font-weight:600;font-family:inherit;";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.onclick = () => overlay.remove();
    btnRow.appendChild(cancelBtn);

    const confirmBtn = document.createElement("button");
    const enabled = validIds.length > 0;
    confirmBtn.style.cssText = `padding:9px 18px;border:0;border-radius:8px;cursor:${enabled ? "pointer" : "not-allowed"};background:#1565c0;color:#fff;font-size:13px;font-weight:600;font-family:inherit;opacity:${enabled ? "1" : "0.5"};`;
    confirmBtn.textContent = enabled ? `Auditar ${validIds.length} curso(s)` : "Nenhum curso válido";
    confirmBtn.disabled = !enabled;
    confirmBtn.onclick = () => {
      overlay.remove();
      runBatchTranscriptionAudit(validIds, checks, validCourseNames);
    };
    btnRow.appendChild(confirmBtn);

    modal.appendChild(btnRow);
  }

  // ---------- Batch transcription audit via popup ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_BATCH_TRANSCRIPTION_AUDIT") return;
    sendResponse({ ok: true });
    confirmAndRunBatchTranscriptionAudit(
      msg.courseIds || [],
      msg.checks || { transcription: true, pt: true, esp: true }
    );
    return true;
  });

  // ---------- Reabrir relatório de auditoria em lote (histórico) ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_SHOW_BATCH_REPORT") return;
    showBatchTranscriptionReport(msg.allResults || [], msg.totalCourses, msg.courseIds, {
      persistHistory: false,
      textualResults: msg.textualResults || [],
      checks: msg.checks || {},
    });
    sendResponse({ ok: true });
    return true;
  });

  // ---------- Transferência para LATAM ----------
  function sendToBackground(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(resp);
      });
    });
  }

  function markdownToHtml(md) {
    if (!md) return "";
    const lines = md.split("\n");
    const result = [];
    let i = 0;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (!trimmed) { i++; continue; }
      // Heading
      const hm = trimmed.match(/^(#{1,4})\s+(.+)/);
      if (hm) {
        result.push(`<h${hm[1].length}>${hm[2]}</h${hm[1].length}>`);
        i++; continue;
      }
      // Code block
      if (trimmed.startsWith("```")) {
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) { codeLines.push(lines[i]); i++; }
        result.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        i++; continue;
      }
      // Unordered list
      if (/^[-*+]\s/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
          items.push(`<li>${lines[i].trim().replace(/^[-*+]\s+/, "")}</li>`);
          i++;
        }
        result.push(`<ul>${items.join("")}</ul>`);
        continue;
      }
      // Ordered list
      if (/^\d+\.\s/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          items.push(`<li>${lines[i].trim().replace(/^\d+\.\s+/, "")}</li>`);
          i++;
        }
        result.push(`<ol>${items.join("")}</ol>`);
        continue;
      }
      // Paragraph
      const paraLines = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t || /^#{1,4}\s/.test(t) || /^[-*+]\s/.test(t) || /^\d+\.\s/.test(t) || t.startsWith("```")) break;
        paraLines.push(t);
        i++;
      }
      const paraText = paraLines.join(" ")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      result.push(`<p>${paraText}</p>`);
    }
    return result.join("\n");
  }

  function _splitH2Sections(lines) {
    const sections = [];
    let current = null;
    for (const line of lines) {
      const h2 = line.match(/^##\s+(.+)/);
      if (h2) {
        if (current) sections.push(current);
        current = { heading: h2[1].trim(), body: "" };
      } else if (current) {
        current.body += (current.body ? "\n" : "") + line;
      }
    }
    if (current) sections.push(current);
    return sections;
  }

  // Extrai texto de uma seção cujo heading começa com o prefixo dado.
  // O texto pode estar na mesma linha do heading ("## Título Texto aqui")
  // ou nas linhas seguintes (body da seção).
  function _secText(sec, prefixRegex) {
    if (!sec) return "";
    const fromHeading = sec.heading.replace(prefixRegex, "").trim();
    return fromHeading || sec.body.trim();
  }

  function _parseTareaFormat(lines) {
    const sections = _splitH2Sections(lines.slice(1));
    const tituloSec    = sections.find(s => /^t[ií]tulo\b/i.test(s.heading));
    const contenidoSec = sections.find(s => /^contenido\b/i.test(s.heading));
    const opinionSec   = sections.find(s => /^opini[oó]n\b/i.test(s.heading));

    if (tituloSec && contenidoSec) {
      // Formato C: tem "## Título" e "## Contenido" (texto pode estar na mesma linha ou nas seções seguintes)
      const title = _secText(tituloSec, /^t[ií]tulo\s*/i);
      let body = _secText(contenidoSec, /^contenido:?\s*/i);
      // Se o corpo de Contenido é vazio, acumula as seções seguintes até Opinión
      if (!body) {
        const contenidoIdx = sections.indexOf(contenidoSec);
        const opinionIdx = opinionSec ? sections.indexOf(opinionSec) : sections.length;
        body = sections.slice(contenidoIdx + 1, opinionIdx).map(s => {
          const parts = [`## ${s.heading}`];
          if (s.body.trim()) parts.push(s.body.trim());
          return parts.join("\n");
        }).join("\n\n").trim();
      }
      const opinion = _secText(opinionSec, /^opini[oó]n\s*/i);
      return { title, body, opinion, alternatives: [] };
    }

    // Formato A: a primeira seção H2 é o título (ex: "## Para saber más: texto aqui")
    const firstSec = sections[0];
    if (firstSec) {
      const title = firstSec.heading; // o heading inteiro é o título
      const bodyLines = [];
      let opinion;
      for (const sec of sections.slice(1)) { // pula o primeiro (é o título)
        // Opinión vai para campo separado (não para o body)
        if (/^opini[oó]n\b/i.test(sec.heading)) {
          const opinionText = _secText(sec, /^opini[oó]n\s*/i);
          if (opinionText) opinion = opinionText;
          continue;
        }
        bodyLines.push(`## ${sec.heading}`);
        if (sec.body.trim()) bodyLines.push(sec.body.trim());
      }
      return { title, body: bodyLines.join("\n").trim(), opinion, alternatives: [] };
    }
    return { title: "", body: lines.slice(1).join("\n").trim(), alternatives: [] };
  }

  // Determina o dataTag de HQ_EXPLANATION com base no título:
  // Se o título for uma variante de "O que vamos aprender?" / "¿Qué aprendimos?" → WHAT_WE_LEARNED
  // Caso contrário → COMPLEMENTARY_INFORMATION
  function _hqDataTag(title) {
    if (/qu[eé]\s+aprendimos|que\s+aprendemos|o\s+que\s+aprendemos/i.test(title || "")) return "WHAT_WE_LEARNED";
    return "COMPLEMENTARY_INFORMATION";
  }

  function _parseTipoFormat(lines) {
    // Parser linha a linha para: # Tarea Tipo Única elección / Opción múltiple
    // Suporta dois formatos de heading:
    //   Formato A: ## Alternativa N / ### Opinión N
    //   Formato B: ### Alternativa N / #### Opinión N
    let title = "";
    const bodyLines = [];
    const alternatives = [];
    let currentAlt = null;
    let opinionLines = [];
    let mode = ""; // "title_body" | "body" | "alt" | "opinion"

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^#\s/.test(trimmed)) continue; // pula o H1

      // H2: ## Título / ## Enunciado / ## Alternativa N
      const h2m = trimmed.match(/^##\s+(.+)/);
      if (h2m) {
        const h2text = h2m[1].trim();

        if (/^t[ií]tulo\b/i.test(h2text)) {
          const inline = h2text.replace(/^t[ií]tulo\s*/i, "").trim();
          title = inline;
          mode = inline ? "" : "title_body";
          continue;
        }

        if (/^enunciado\b/i.test(h2text)) {
          const inline = h2text.replace(/^enunciado\s*/i, "").trim();
          if (inline) bodyLines.push(inline);
          mode = "body";
          continue;
        }

        const altM = h2text.match(/^Alternativa\s+\d+\s*(.*)/i);
        if (altM) {
          if (currentAlt) { currentAlt.justification = opinionLines.join("\n").trim(); alternatives.push(currentAlt); }
          opinionLines = [];
          currentAlt = { body: altM[1].trim(), justification: "", correct: false };
          mode = "alt";
          continue;
        }

        if (mode === "body") bodyLines.push(`## ${h2text}`);
        continue;
      }

      // H3: ### Alternativa N (Formato B) ou ### Opinión N (Formato A)
      const h3m = trimmed.match(/^###\s+(.+)/);
      if (h3m) {
        const h3text = h3m[1].trim();
        const altM3 = h3text.match(/^(?:Alternativa|Opci[oó]n)\s+\d+\s*(.*)/i);
        if (altM3) {
          if (currentAlt) { currentAlt.justification = opinionLines.join("\n").trim(); alternatives.push(currentAlt); }
          opinionLines = [];
          currentAlt = { body: altM3[1].trim(), justification: "", correct: false };
          mode = "alt";
          continue;
        }
        if (/^Opini[oó]n\s+\d+/i.test(h3text)) { mode = "opinion"; continue; }
        if (mode === "body") bodyLines.push(`### ${h3text}`);
        continue;
      }

      // H4: #### Opinión N (Formato B)
      const h4m = trimmed.match(/^####\s+(.+)/);
      if (h4m) {
        if (/^Opini[oó]n\s+\d+/i.test(h4m[1].trim())) { mode = "opinion"; continue; }
        if (mode === "body") bodyLines.push(`#### ${h4m[1]}`);
        continue;
      }

      // Labels de texto puro (formato hard-break: "Título  \n", "Alternativa 1  \n")
      if (/^t[ií]tulo\s*$/i.test(trimmed)) { mode = "title_body"; continue; }
      if (/^enunciado\s*$/i.test(trimmed)) { mode = "body"; continue; }
      const altPlain = trimmed.match(/^Alternativa\s+\d+\s*$/i);
      if (altPlain) {
        if (currentAlt) { currentAlt.justification = opinionLines.join("\n").trim(); alternatives.push(currentAlt); }
        opinionLines = [];
        currentAlt = { body: "", justification: "", correct: false };
        mode = "alt";
        continue;
      }
      if (/^Opini[oó]n\s+\d+\s*$/i.test(trimmed)) { mode = "opinion"; continue; }
      // Bold inline format: **Opinión N** (sem heading #)
      if (/^\*\*Opini[oó]n\s+\d+\*\*\s*$/i.test(trimmed)) { mode = "opinion"; continue; }

      // Correcta:/Correcto: (cobre feminino, masculino e formato bold **Correcto:**)
      if (/^\**Correct[oa]:\**\s*(s[ií]|yes|true)/i.test(trimmed)) {
        if (currentAlt) currentAlt.correct = true;
        continue;
      }
      if (/^\**Correct[oa]:\**/i.test(trimmed)) continue;

      if (mode === "title_body" && !title) { title = trimmed; mode = ""; }
      else if (mode === "body") bodyLines.push(line);
      else if (mode === "alt" && currentAlt) { currentAlt.body += (currentAlt.body ? "\n" : "") + trimmed; }
      else if (mode === "opinion") { opinionLines.push(trimmed); }
    }

    if (currentAlt) { currentAlt.justification = opinionLines.join("\n").trim(); alternatives.push(currentAlt); }

    return {
      title,
      body: bodyLines.join("\n").trim(),
      alternatives: alternatives.filter(a => a.body.trim()),
    };
  }

  function _parseFlatSinRespuestaFormat(text) {
    // Task Kind Sin Respuesta del Estudiante — flat challenge/desafio
    // Labels: Title / Content / Opinion (sem número, sem ##)
    const lines = text.split("\n");
    let title = "", contentLines = [], opinionLines = [], mode = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^Task Kind\s/i.test(trimmed)) continue;
      if (/^Tarea\s+Sin\s+Respuesta/i.test(trimmed)) continue;
      if (/^T[ií]tulo:?\s*$/i.test(trimmed) || /^Title:?\s*$/i.test(trimmed)) { mode = "title"; continue; }
      if (/^Contenido:?\s*$/i.test(trimmed) || /^Content:?\s*$/i.test(trimmed)) { mode = "content"; continue; }
      if (/^Opini[oó]n:?\s*$/i.test(trimmed) || /^Opinion:?\s*$/i.test(trimmed)) { mode = "opinion"; continue; }
      if (mode === "title" && !title && trimmed) { title = trimmed; mode = ""; continue; }
      if (mode === "content") contentLines.push(line);
      else if (mode === "opinion") opinionLines.push(line);
    }
    const opinion = opinionLines.join("\n").trim();
    const dataTag = /desaf[íi]o|reto|challenge/i.test(title) ? "CHALLENGE" : "DO_AFTER_ME";
    return {
      title,
      body: contentLines.join("\n").trim(),
      opinion: opinion || undefined,
      alternatives: [],
      taskEnum: "TEXT_CONTENT",
      dataTag,
    };
  }

  function _parseFlatFormat(text) {
    const lines = text.split("\n");
    let title = "", enunciationLines = [], alternatives = [], mode = "", currentAlt = null;
    let opinionLines = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^Task Kind\s/i.test(trimmed)) continue;
      if (/^Tarea\s+Tipo\s/i.test(trimmed) && !title && mode === "") continue;

      // "Title"/"Título" sozinho na linha (label separado do valor) ou "Title <texto>" na mesma linha
      if (/^Title\s+/i.test(trimmed)) { title = trimmed.replace(/^Title\s+/i, "").trim(); mode = ""; continue; }
      if (/^Title\s*$/i.test(trimmed) || /^T[ií]tulo\s*$/i.test(trimmed)) { mode = "title"; continue; }
      if (mode === "title" && !title && trimmed) { title = trimmed; mode = ""; continue; }

      // Enunciação: inglês "Enunciation" ou espanhol "Enunciado"
      if (/^Enunci(ation|ado)\s*$/i.test(trimmed)) { mode = "enunciation"; continue; }

      // Alternativa: inglês "Alternative N" ou espanhol "Alternativa N"
      if (/^Alternati(?:ve|va)\s+\d+\s*$/i.test(trimmed)) {
        if (currentAlt) { currentAlt.justification = opinionLines.join("\n").trim(); alternatives.push(currentAlt); }
        currentAlt = { body: "", correct: false, justification: "" };
        opinionLines = [];
        mode = "alternative"; continue;
      }

      // Opinión: inglês "Opinion N" ou espanhol "Opinión N"
      if (/^Opini[oó]n\s+\d+\s*$/i.test(trimmed)) { mode = "opinion"; continue; }

      // Correcto/Correct
      if (/^Correct[oa]?:\s*(s[ií]|yes|true)/i.test(trimmed)) { if (currentAlt) currentAlt.correct = true; continue; }
      if (/^Correct[oa]?:/i.test(trimmed)) continue;

      if (mode === "enunciation" && trimmed) enunciationLines.push(line);
      else if (mode === "alternative" && currentAlt && trimmed) currentAlt.body += (currentAlt.body ? "\n" : "") + trimmed;
      else if (mode === "opinion" && trimmed) opinionLines.push(trimmed);
    }
    if (currentAlt) { currentAlt.justification = opinionLines.join("\n").trim(); alternatives.push(currentAlt); }
    return {
      title,
      body: enunciationLines.join("\n").trim(),
      alternatives: alternatives.filter(a => a.body.trim()),
    };
  }

  function parseTranslationMarkdown(md) {
    const result = _parseTranslationMarkdownRaw(md);
    // Filtro geral: remove label "## Contenido:" ou "## Content:" que possa ter vazado para o body
    if (result.body) {
      result.body = result.body
        .replace(/^##\s+(?:contenido|content):?\s*\n?/i, "")
        .trim();
    }
    // Post-processo: se o body contém estrutura inline "Título / Contenido / Opinión"
    // (ex: task cuja tradução embute o texto estruturado em vez de preencher os campos separados)
    if (result.body && /^T[ií]tulo\s*$/im.test(result.body)) {
      const re = _parseFlatSinRespuestaFormat(result.body);
      if (re.title) result.title = re.title;
      if (re.body) result.body = re.body;
      if (re.opinion && !result.opinion) result.opinion = re.opinion;
    }
    return result;
  }

  function _parseTranslationMarkdownRaw(md) {
    if (!md) return { title: "", body: "", alternatives: [], taskEnum: null, dataTag: null };
    const text = md.trim();

    // Formato flat sem "#" — "Tarea Sin Respuesta del Estudiante" como texto plano
    if (/^Tarea\s+Sin\s+Respuesta/i.test(text.split("\n")[0])) {
      return _parseFlatSinRespuestaFormat(text);
    }

    // Formato flat sem "#" — "Tarea Tipo Única elección" / "Tarea Tipo Opción múltiple" como texto plano
    if (/^Tarea\s+Tipo\s+[Úú]nica/i.test(text.split("\n")[0])) {
      const r = _parseFlatFormat(text);
      const correctCount = r.alternatives.filter(a => a.correct).length;
      const taskEnum = correctCount > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE";
      return { ...r, taskEnum, dataTag: "PRACTICE_CLASS_CONTENT" };
    }
    if (/^Tarea\s+Tipo\s+Opci[oó]n\s+m[uú]ltiple/i.test(text.split("\n")[0])) {
      const r = _parseFlatFormat(text);
      return { ...r, taskEnum: "MULTIPLE_CHOICE", dataTag: "PRACTICE_CLASS_CONTENT" };
    }

    // Formato E — flat (Task Kind ...)
    if (/^Task Kind\s/i.test(text)) {
      const firstLine = text.split("\n")[0];
      // "Sin Respuesta del Estudiante" = desafio/faça como eu fiz (sem quiz)
      if (/^Task Kind\s+Sin\s+Respuesta/i.test(firstLine)) {
        return _parseFlatSinRespuestaFormat(text);
      }
      // "Explicación" = Para saber mais (HQ_EXPLANATION)
      if (/^Task Kind\s+Explicaci[oó]n/i.test(firstLine)) {
        const r = _parseFlatSinRespuestaFormat(text);
        return { ...r, taskEnum: "HQ_EXPLANATION", dataTag: _hqDataTag(r.title) };
      }
      const r = _parseFlatFormat(text);
      const correctCount = r.alternatives.filter(a => a.correct).length;
      const taskEnum = correctCount > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE";
      return { ...r, taskEnum, dataTag: "PRACTICE_CLASS_CONTENT" };
    }

    const lines = text.split("\n");
    const h1 = lines[0]?.trim() || "";

    // "# Tarea Sin Respuesta del Estudiante" com H1
    if (/^#\s+Tarea\s+Sin\s+Respuesta/i.test(h1)) {
      // Se o conteúdo usa "## Título / ## Contenido / ## Opinión" → _parseTareaFormat
      // Se usa labels de texto plano ("Título\nValor\n") → _parseFlatSinRespuestaFormat
      const hasH2Sections = lines.slice(1).some(l => /^##\s+(?:t[ií]tulo|contenido|opini[oó]n)\s*$/i.test(l.trim()));
      if (hasH2Sections) {
        const r = _parseTareaFormat(lines);
        const dataTag = /desaf[íi]o|reto|challenge/i.test(r.title) ? "CHALLENGE" : "DO_AFTER_ME";
        return { ...r, taskEnum: "TEXT_CONTENT", dataTag };
      }
      // Formato: primeiro conteúdo após H1 é "## <título>" (não label estrutural) → título + corpo
      const restLines = lines.slice(1);
      const firstNonEmptyIdx = restLines.findIndex(l => l.trim() !== "");
      if (firstNonEmptyIdx >= 0 && /^##\s+/.test(restLines[firstNonEmptyIdx].trim())) {
        const title = restLines[firstNonEmptyIdx].replace(/^##\s+/, "").trim();
        const bodyLines = restLines.slice(firstNonEmptyIdx + 1);
        const dataTag = /desaf[íi]o|reto|challenge/i.test(title) ? "CHALLENGE" : "DO_AFTER_ME";
        return { title, body: bodyLines.join("\n").trim(), alternatives: [], taskEnum: "TEXT_CONTENT", dataTag };
      }
      return _parseFlatSinRespuestaFormat(lines.slice(1).join("\n"));
    }

    // Formato B — ¿Qué aprendimos? → WHAT_WE_LEARNED
    if (/^#\s+[¿¡]?Qu[eé]\s+aprendimos/i.test(h1)) {
      let bodyLines = lines.slice(1);
      const cIdx = bodyLines.findIndex(l => /^(?:contenido|content):?\s*$/i.test(l.trim()));
      if (cIdx >= 0) bodyLines.splice(cIdx, 1);
      return {
        title: h1.replace(/^#+\s*/, "").trim(),
        body: bodyLines.join("\n").trim(),
        alternatives: [],
        taskEnum: "HQ_EXPLANATION",
        dataTag: "WHAT_WE_LEARNED",
      };
    }

    // Formato D — "# Tarea Tipo Única elección", "# Tarea Kind Única elección" ou "# Tarea Única" → SINGLE_CHOICE
    if (/^#\s+Tarea\s+(Tipo|Kind)\s+[Úú]nica(\s+elecci[oó]n)?/i.test(h1) || /^#\s+Tarea\s+[Úú]nica(\s+elecci[oó]n)?/i.test(h1)) {
      const r = _parseTipoFormat(lines);
      return { ...r, taskEnum: "SINGLE_CHOICE", dataTag: "PRACTICE_CLASS_CONTENT" };
    }

    // "# Tarea Múltiple" → MULTIPLE_CHOICE
    if (/^#\s+Tarea\s+M[uú]ltiple/i.test(h1)) {
      const r = _parseTipoFormat(lines);
      return { ...r, taskEnum: "MULTIPLE_CHOICE", dataTag: "PRACTICE_CLASS_CONTENT" };
    }

    // Outros "# Tarea Tipo X" — detecta pelo nome
    if (/^#\s+Tarea\s+Tipo/i.test(h1)) {
      const tipoName = h1.replace(/^#\s+Tarea\s+Tipo\s+/i, "").trim();
      // Opción múltiple
      if (/opci[oó]n\s+m[uú]ltiple/i.test(tipoName)) {
        const r = _parseTipoFormat(lines);
        return { ...r, taskEnum: "MULTIPLE_CHOICE", dataTag: "PRACTICE_CLASS_CONTENT" };
      }
      // Explicación — suporta "Título\n<real title>" (plain) e "## Título\n<real title>" (H2) + "Contenido:"
      const restLines = lines.slice(1);
      const tituloIdx = restLines.findIndex(l => /^(?:##\s+)?t[ií]tulo\s*$/i.test(l.trim()));
      const contenidoIdx = restLines.findIndex(l => /^(?:##\s+)?contenido:?\s*$/i.test(l.trim()) || /^contenido:/i.test(l.trim()));
      if (tituloIdx >= 0 && contenidoIdx >= 0 && contenidoIdx > tituloIdx) {
        const titleStr = (restLines.slice(tituloIdx + 1).find(l => l.trim()) || "").trim();
        let bodyLines = restLines.slice(contenidoIdx + 1);
        const cRest = restLines[contenidoIdx].trim().replace(/^contenido:\s*/i, "").trim();
        if (cRest) bodyLines = [cRest, ...bodyLines];
        return { title: titleStr, body: bodyLines.join("\n").trim(), alternatives: [], taskEnum: "HQ_EXPLANATION", dataTag: _hqDataTag(titleStr) };
      }
      const r = _parseTareaFormat(lines);
      return { ...r, taskEnum: "HQ_EXPLANATION", dataTag: _hqDataTag(r.title) };
    }

    // "# Tarea Explicación" (sem "Tipo") — Para saber mais com formato flat
    if (/^#\s+Tarea\s+Explicaci[oó]n/i.test(h1)) {
      const restLines = lines.slice(1);
      const tituloIdx = restLines.findIndex(l => /^t[ií]tulo\s*$/i.test(l.trim()));
      const contenidoIdx = restLines.findIndex(l => /^contenido:/i.test(l.trim()));
      if (tituloIdx >= 0 && contenidoIdx >= 0 && contenidoIdx > tituloIdx) {
        const titleStr = (restLines.slice(tituloIdx + 1).find(l => l.trim()) || "").trim();
        let bodyLines = restLines.slice(contenidoIdx + 1);
        const cRest = restLines[contenidoIdx].trim().replace(/^contenido:\s*/i, "").trim();
        if (cRest) bodyLines = [cRest, ...bodyLines];
        return { title: titleStr, body: bodyLines.join("\n").trim(), alternatives: [], taskEnum: "HQ_EXPLANATION", dataTag: _hqDataTag(titleStr) };
      }
      const r = _parseTareaFormat(lines);
      return { ...r, taskEnum: "HQ_EXPLANATION", dataTag: _hqDataTag(r.title) };
    }

    // Formato "Para saber más" com título direto no H1 (ex: "# Material del curso")
    // H1 que não começa com "# Tarea" → título = H1, corpo = resto sem "Contenido:"
    if (!/^#\s+Tarea\b/i.test(h1)) {
      // Se o conteúdo tem alternativas (### Alternativa N ou ## Alternativa N), é quiz
      if (/^#{2,3}\s+Alternativa\s+\d+/im.test(text)) {
        const r = _parseTipoFormat(lines);
        const correctCount = r.alternatives.filter(a => a.correct).length;
        const taskEnum = correctCount > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE";
        return { ...r, taskEnum, dataTag: "PRACTICE_CLASS_CONTENT" };
      }

      let titleStr = h1.replace(/^#+\s*/, "").trim();
      let bodyLines = lines.slice(1);

      // Se H1 é literalmente "Título" (espanhol) ou "Title" (inglês), a primeira linha não-vazia é o título real
      if (/^t[ií]tulo\s*$/i.test(titleStr) || /^title\s*$/i.test(titleStr)) {
        const firstNonEmpty = bodyLines.findIndex(l => l.trim());
        if (firstNonEmpty >= 0) {
          titleStr = bodyLines[firstNonEmpty].trim();
          bodyLines = bodyLines.slice(firstNonEmpty + 1);
        }
      }

      // Remove o marcador "Contenido:" / "## Contenido:" (espanhol) ou "Content:" (inglês)
      const cIdx = bodyLines.findIndex(l => /^(?:##\s+)?(?:contenido|content):?\s*$/i.test(l.trim()));
      if (cIdx >= 0) {
        const rest = bodyLines[cIdx].trim().replace(/^(?:##\s+)?(?:contenido|content):?\s*/i, "").trim();
        if (rest) {
          bodyLines[cIdx] = rest; // mantém texto após "Contenido:"
        } else {
          bodyLines.splice(cIdx, 1); // remove linha vazia
        }
      }

      return {
        title: titleStr,
        body: bodyLines.join("\n").trim(),
        alternatives: [],
        taskEnum: "HQ_EXPLANATION",
        dataTag: _hqDataTag(titleStr),
      };
    }

    // Formato A ou C — "# Tarea Sin Respuesta del Estudiante"
    const r = _parseTareaFormat(lines);
    // Determina taskEnum/dataTag pelo conteúdo
    const sections = _splitH2Sections(lines.slice(1));
    const tituloSec = sections.find(s => /^t[ií]tulo$/i.test(s.heading));
    const firstSec = sections[0];

    if (tituloSec) {
      // Tem seção "Título" → verifica o conteúdo do título para determinar o tipo
      const tituloText = (tituloSec.body || tituloSec.heading || "");
      // "Para saber más" → HQ_EXPLANATION
      if (/para\s+saber\s+m[aá]s/i.test(tituloText)) {
        return { ...r, taskEnum: "HQ_EXPLANATION", dataTag: _hqDataTag(r.title) };
      }
      const dataTag = /desaf[íi]o|reto|challenge/i.test(tituloText)
        ? "CHALLENGE"
        : "DO_AFTER_ME";
      return { ...r, taskEnum: "TEXT_CONTENT", dataTag };
    }

    if (firstSec) {
      const heading = firstSec.heading;
      if (/preparando|configurando|ambiente|setup/i.test(heading)) {
        return { ...r, taskEnum: "HQ_EXPLANATION", dataTag: "SETUP_EXPLANATION" };
      }
    }

    // Default: HQ_EXPLANATION → Para saber mais
    return { ...r, taskEnum: "HQ_EXPLANATION", dataTag: _hqDataTag(r.title) };
  }

  // ---------- Stop via popup ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_STOP") return;

    (async () => {
      await clearState();
      sendResponse({ ok: true });
    })();

    return true;
  });

  // ---------- Upload ícone Start via popup ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_UPLOAD_START_ICON") return;

    (async () => {
      const courseSlug = getCourseSlugFromUrl();
      if (!courseSlug) {
        sendResponse({ ok: false, error: "Abra a Home do curso Start antes de usar." });
        return;
      }

      sendResponse({ ok: true });

      // Selecionar qual ícone Start
      const startSlug = await askSelectStartIcon();
      if (!startSlug) return; // cancelado

      // Verificar se o ícone para esse slug já existe no repositório
      const iconCheck = await checkIcon(courseSlug);
      if (iconCheck.exists) {
        const { modal, overlay } = createOverlayModal("420px");
        modal.innerHTML = `
          <h3 style="margin:0 0 12px 0; color:#c62828; font-weight:700;">URL já em uso</h3>
          <p style="margin:0 0 16px 0; font-size:14px; color:#555;">
            Já existe um ícone para o slug <strong>${courseSlug}</strong> no repositório.<br>
            Corrija o slug do curso antes de subir o ícone.
          </p>
          <div style="display:flex;justify-content:flex-end;">
            <button id="starticon-err-close" style="padding:9px 20px; border:0; border-radius:8px; cursor:pointer; background:#c62828; color:#fff; font-size:14px; font-weight:600;">Entendido</button>
          </div>
        `;
        document.getElementById("starticon-err-close").onclick = () => overlay.remove();
        return;
      }

      // Fazer upload do ícone
      const waitOverlay = showIconWaiting();
      const ok = await uploadIcon(startSlug, courseSlug);
      waitOverlay.remove();

      const { modal, overlay } = createOverlayModal("380px");
      if (ok) {
        modal.innerHTML = `
          <p style="margin:0 0 16px 0; text-align:center; font-size:15px; color:#1c1c1c;">
            ✅ Ícone <strong>${startSlug}</strong> enviado com sucesso para <strong>${courseSlug}.svg</strong>!
          </p>
          <div style="display:flex;justify-content:center;">
            <button id="starticon-success-ok" style="padding:9px 24px; border:0; border-radius:8px; cursor:pointer; background:#00c86f; color:#fff; font-size:14px; font-weight:600;">OK</button>
          </div>
        `;
        document.getElementById("starticon-success-ok").onclick = () => overlay.remove();
      } else {
        modal.innerHTML = `
          <p style="margin:0 0 16px 0; text-align:center; font-size:15px; color:#c62828;">
            ❌ Erro ao enviar o ícone. Verifique o token GitHub e tente novamente.
          </p>
          <div style="display:flex;justify-content:center;">
            <button id="starticon-fail-close" style="padding:9px 24px; border:0; border-radius:8px; cursor:pointer; background:#f0f0f0; color:#333; font-size:14px; font-weight:600;">Fechar</button>
          </div>
        `;
        document.getElementById("starticon-fail-close").onclick = () => overlay.remove();
      }
    })();

    return true;
  });

  // ---------- Desativar em lote: busca seções ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_DEACT_GET_SECTIONS") return;
    (async () => {
      try {
        const resp = await sendToBackground({ type: "ALURA_REVISOR_GET_SECTIONS", courseId: msg.courseId });
        sendResponse(resp);
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  });

  // ---------- Desativar em lote: busca tasks de uma seção ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_DEACT_GET_TASKS") return;
    (async () => {
      try {
        const resp = await sendToBackground({
          type: "ALURA_REVISOR_GET_SECTION_TASKS",
          courseId: msg.courseId, sectionId: msg.sectionId, includeInactive: true
        });
        sendResponse({ ok: resp.ok, sectionId: msg.sectionId, sectionTitle: msg.sectionTitle, tasks: resp.tasks || [], error: resp.error });
      } catch (e) { sendResponse({ ok: false, sectionId: msg.sectionId, sectionTitle: msg.sectionTitle, tasks: [], error: e.message }); }
    })();
    return true;
  });


  // ---------- Publicação: Faça como eu fiz via popup ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_PUBLISH_FEZ_TASK") return;
    (async () => {
      try { sendResponse(await sendToBackground(msg)); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  });

  // ---------- Publicação: Desafio via popup ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_PUBLISH_DESAFIO_TASK") return;

    (async () => {
      try {
        const resp = await sendToBackground(msg);
        sendResponse(resp);
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();

    return true;
  });

  // ---------- Publicação: atividade unificada (PREP/FEZ/PSM/GLOSSARIO) ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_PUBLISH_ACTIVITY") return;
    (async () => {
      try { sendResponse(await sendToBackground(msg)); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  });

  // ---------- Publicação: criar exercício (Ordenar Blocos) ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_CREATE_EXERCICIO") return;
    (async () => {
      try { sendResponse(await sendToBackground(msg)); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  });

  // ---------- Publicação: preencher avaliação ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "ALURA_REVISOR_FILL_ASSESSMENT") return;
    (async () => {
      try {
        const { field, value, question } = msg;

        if (field === "title") {
          const titleValue = msg.value;
          if (titleValue === undefined || titleValue === null) {
            sendResponse({ ok: false, error: `value não chegou (recebido: ${JSON.stringify(msg)})` });
            return;
          }
          const el = document.querySelector('input[name="title"]');
          if (!el) { sendResponse({ ok: false, error: "Campo título não encontrado na página" }); return; }
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          if (nativeSetter) nativeSetter.call(el, titleValue);
          else el.value = titleValue;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          sendResponse({ ok: true, received: titleValue.slice(0, 60) });

        } else if (field === "description") {
          // EasyMDE usa um contenteditable interno do CodeMirror.
          // execCommand('insertText') simula digitação real e dispara todos os
          // eventos que o EasyMDE escuta para sincronizar com o hidden input.
          const codeDiv = document.querySelector(".CodeMirror-code[contenteditable='true']");

          if (codeDiv && msg.markdown) {
            codeDiv.focus();
            document.execCommand("selectAll", false, null);
            document.execCommand("insertText", false, msg.markdown);
          } else if (!codeDiv) {
            // Fallback: tenta cm.setValue() mesmo assim
            const cm = document.querySelector(".CodeMirror")?.CodeMirror;
            if (cm && msg.markdown) {
              cm.setValue(msg.markdown);
              cm.setCursor(cm.lineCount(), 0);
            }
          }

          // Garante hidden input com HTML independentemente
          const hidden = document.querySelector('input[name="descriptionHighlightedText"]');
          if (hidden && msg.html) {
            hidden.value = msg.html;
            hidden.dispatchEvent(new Event("input",  { bubbles: true }));
            hidden.dispatchEvent(new Event("change", { bubbles: true }));
          }

          if (!codeDiv && !hidden) {
            sendResponse({ ok: false, error: "contenteditable e hidden input não encontrados" });
            return;
          }
          sendResponse({ ok: true, codeDivFound: !!codeDiv, hiddenFound: !!hidden });

        } else if (field === "createStructure") {
          // altsPerQuestion: array com qtde de alternativas por questão (ex.: [4,5,2,4,...])
          // questionTypes: array paralelo "MULTIPLE_CHOICE" | "DISCURSIVE"
          // Compatível com o formato antigo {totalQuestions, totalAlts} caso ainda seja usado.
          const altsPerQuestion = Array.isArray(msg.altsPerQuestion)
            ? msg.altsPerQuestion
            : Array.from({ length: msg.totalQuestions || 10 }, () => msg.totalAlts || 4);
          const questionTypes = Array.isArray(msg.questionTypes)
            ? msg.questionTypes
            : altsPerQuestion.map(() => "MULTIPLE_CHOICE");
          const totalQ = altsPerQuestion.length;

          const addQBtn = document.querySelector(".assessment__questions__add");
          if (!addQBtn) {
            sendResponse({ ok: false, error: "Botão 'Adicionar questão' não encontrado — abra a página de questões primeiro" });
            return;
          }

          let created = 0;
          for (let qi = 0; qi < totalQ; qi++) {
            // Garante que o wrapper da questão qi existe
            let wrapper = document.querySelectorAll(".assessment__question__wrapper")[qi];
            if (!wrapper) {
              addQBtn.click();
              await sleep(500);
              wrapper = document.querySelectorAll(".assessment__question__wrapper")[qi];
            }
            if (!wrapper) continue;

            const qType = questionTypes[qi] || "MULTIPLE_CHOICE";

            // Discursiva: troca o select questionType e dispara change.
            // O script da página oculta o container de alternativas e exibe o discursivo.
            if (qType === "DISCURSIVE") {
              const sel = wrapper.querySelector("select.questionType");
              if (sel && sel.value !== "DISCURSIVE") {
                sel.value = "DISCURSIVE";
                sel.dispatchEvent(new Event("change", { bubbles: true }));
                await sleep(400);
              }
              created++;
              continue;
            }

            // Múltipla escolha: ajusta a qtde de alternativas para bater exatamente com a questão.
            const targetA = altsPerQuestion[qi] || 0;
            if (targetA > 0) {
              const addAltBtn = wrapper.querySelector(".assessment__question__alternatives__add");
              let altCount = wrapper.querySelectorAll(".assessment__question__alternative").length;

              // Adiciona se faltam
              let safety = 10;
              while (altCount < targetA && safety-- > 0) {
                addAltBtn?.click();
                await sleep(350);
                altCount = wrapper.querySelectorAll(".assessment__question__alternative").length;
              }

              // Remove se sobram (sempre da última)
              safety = 10;
              while (altCount > targetA && safety-- > 0) {
                const removes = wrapper.querySelectorAll(".assessment__alternative__options__remove");
                if (!removes.length) break;
                removes[removes.length - 1].click();
                await sleep(350);
                altCount = wrapper.querySelectorAll(".assessment__question__alternative").length;
              }
            }
            created++;
          }
          sendResponse({ ok: true, created });

        } else if (field === "question") {
          const q    = msg.question;
          const qIdx = (q.num || 1) - 1;

          async function fillHked(container, text) {
            const codeDiv = container?.querySelector('.CodeMirror-code[contenteditable="true"]');
            if (!codeDiv) return false;
            codeDiv.focus();
            document.execCommand("selectAll", false, null);
            document.execCommand("insertText", false, text);
            return true;
          }

          function setHidden(input, html) {
            if (!input) return;
            input.value = html;
            input.dispatchEvent(new Event("input",  { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }

          // Localiza wrapper por posição DOM (mais confiável que name para blocos dinâmicos)
          const wrapper = document.querySelectorAll(".assessment__question__wrapper")[qIdx];
          if (!wrapper) {
            sendResponse({ ok: false, error: `Questão ${q.num} não encontrada — use "Criar estrutura" primeiro` });
            return;
          }

          const debugRadio = { correctAlt: q.correctAlt, correctIdx: -1, radioFound: false, checkedBefore: null, checkedAfter: null };

          if (q.tipo === "discursive") {
            // Discursiva: troca o tipo no select (se necessário) e preenche
            // editor de pergunta + textarea de resposta esperada.
            const sel = wrapper.querySelector("select.questionType");
            if (sel && sel.value !== "DISCURSIVE") {
              sel.value = "DISCURSIVE";
              sel.dispatchEvent(new Event("change", { bubbles: true }));
              await sleep(400);
            }

            const dSection = wrapper.querySelector(".assessment__question--discursive");
            // Two-pass fill: o CodeMirror desse editor fica "frio" enquanto o
            // .discursiveQuestionContainer está com a classe hidden (até a troca
            // de tipo), e a primeira chamada execCommand não insere texto. A
            // primeira passada acorda o editor, a segunda preenche de fato.
            // Equivale ao que o usuário observou ao clicar em "Repreencher".
            await fillHked(dSection, q.text || "");
            await sleep(150);
            await fillHked(dSection, q.text || "");

            const expected = wrapper.querySelector('textarea[name="expectedAnswer"]');
            if (expected && q.expectedAnswer) {
              expected.value = q.expectedAnswer;
              expected.dispatchEvent(new Event("input",  { bubbles: true }));
              expected.dispatchEvent(new Event("change", { bubbles: true }));
            }

            await sleep(300);
            document.activeElement?.blur();
            // Após o sleep: sobrescreve antes que o EasyMDE possa re-renderizar com HTML errado.
            setHidden(
              dSection?.querySelector("input.hackeditor-sync"),
              markdownToHtml(q.text || "")
            );
          } else {
            // Múltipla escolha: enunciado + alternativas + radio.
            // Enunciado: .assessment__question--alternative (hífen, não underscore)
            const qSection = wrapper.querySelector(".assessment__question--alternative");
            await fillHked(qSection, q.text || "");

            // Alternativas: seleciona por posição DOM — name é incorreto nas alternativas dinâmicas (C, D...)
            const altBlocks = wrapper.querySelectorAll(".assessment__question__alternative");
            for (let j = 0; j < (q.alts || []).length; j++) {
              const altBlock = altBlocks[j];
              if (!altBlock) continue;
              await fillHked(altBlock, q.alts[j].text);
              setHidden(altBlock.querySelector("input.hackeditor-sync"), `<p>${q.alts[j].text}</p>`);
            }

            // Aguarda DOM estabilizar após os execCommands antes de clicar no radio
            await sleep(500);
            document.activeElement?.blur();
            // Após o sleep: sobrescreve antes que o EasyMDE possa re-renderizar com HTML errado.
            setHidden(
              qSection?.querySelector("input.hackeditor-sync"),
              markdownToHtml(q.text || "")
            );

            if (q.correctAlt) {
              const correctIdx = (q.alts || []).findIndex(a => a.letter === q.correctAlt);
              debugRadio.correctIdx = correctIdx;
              if (correctIdx >= 0) {
                const freshBlocks = wrapper.querySelectorAll(".assessment__question__alternative");
                debugRadio.totalBlocks = freshBlocks.length;
                const radio = freshBlocks[correctIdx]?.querySelector('input[type="radio"]');
                debugRadio.radioFound = !!radio;
                if (radio) {
                  debugRadio.checkedBefore = radio.checked;
                  radio.click();
                  await sleep(200);
                  debugRadio.checkedAfter = radio.checked;
                }
                freshBlocks.forEach((block, idx) => {
                  const hidden = block.querySelector("input.correct-alternative");
                  if (!hidden) return;
                  hidden.value = idx === correctIdx ? "true" : "false";
                  hidden.dispatchEvent(new Event("change", { bubbles: true }));
                });
              }
            }
          }

          // Normaliza texto p/ matching de descritor (sem acento, sem pontuação, lower, single-space)
          function normAttr(s) {
            return (s || "")
              .toLowerCase()
              .normalize("NFD").replace(/[̀-ͯ]/g, "")
              .replace(/[^a-z0-9\s]/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          }
          function jaccardWords(a, b) {
            const sa = new Set(a.split(" ").filter(Boolean));
            const sb = new Set(b.split(" ").filter(Boolean));
            if (!sa.size || !sb.size) return 0;
            let inter = 0;
            for (const w of sa) if (sb.has(w)) inter++;
            const union = sa.size + sb.size - inter;
            return inter / union;
          }

          // Habilidade avaliada: ativa o bloco e seleciona eixo + skill + descritor
          // O .skill__container já existe no DOM mas começa vazio dentro de
          // <div class="skill --disabled">. O clique em "Adicionar habilidade avaliada"
          // remove --disabled E popula as options do group__select.
          const skillDebug = { code: null, eixo: null, activated: false, groupSet: false, skillSet: false, attrSet: false, attrScore: null, saved: false };
          if (q.habilidade?.code) {
            const code = q.habilidade.code.toUpperCase();
            // Prefere o eixo capturado do doc (ex: "Pensamento Computacional" → PC,
            // "Competência 3" → C3); fallback no mapa estático.
            const eixo = q.habilidade.eixo || SKILL_GROUP_MAP[code];
            skillDebug.code = code;
            skillDebug.eixo = eixo || null;
            if (eixo) {
              try {
                const skillBlock = wrapper.querySelector(".skill");
                const skillContainer = wrapper.querySelector(".skill__container");
                let groupSel = skillContainer?.querySelector(".group__select");
                const needsActivation =
                  !skillBlock ||
                  skillBlock.classList.contains("--disabled") ||
                  !groupSel ||
                  groupSel.options.length <= 1;

                if (needsActivation) {
                  const addBtn = [...wrapper.querySelectorAll("button.add__skill__button, button")]
                    .find(b => /Adicionar habilidade avaliada/i.test(b.textContent));
                  if (addBtn) {
                    addBtn.click();
                    await waitFor(() => {
                      const sel = wrapper.querySelector(".skill__container .group__select");
                      return sel && sel.options.length > 1 ? sel : null;
                    }, 5000);
                    groupSel = wrapper.querySelector(".skill__container .group__select");
                  }
                }
                skillDebug.activated = !!(groupSel && groupSel.options.length > 1);

                if (skillDebug.activated) {
                  const groupOpt = [...groupSel.options].find(o =>
                    o.textContent.trim().startsWith(`(${eixo})`)
                  );
                  if (groupOpt) {
                    groupSel.value = groupOpt.value;
                    groupSel.dispatchEvent(new Event("change", { bubbles: true }));
                    skillDebug.groupSet = true;

                    const skillSel = await waitFor(() => {
                      const s = wrapper.querySelector(".skill__container .skill__select");
                      return s && !s.disabled && s.options.length > 1 ? s : null;
                    }, 5000);
                    const skillOpt = skillSel && [...skillSel.options].find(o =>
                      o.textContent.trim().startsWith(`(${code})`)
                    );
                    if (skillSel && skillOpt) {
                      skillSel.value = skillOpt.value;
                      skillSel.dispatchEvent(new Event("change", { bubbles: true }));
                      skillDebug.skillSet = true;

                      // Seleciona o descritor (atributo) que melhor casa com q.habilidade.descriptor
                      if (q.habilidade.descriptor) {
                        const descTarget = normAttr(q.habilidade.descriptor);
                        const attrList = await waitFor(() => {
                          const c = wrapper.querySelector(".attribute__container");
                          if (!c || c.classList.contains("--disabled")) return null;
                          const list = c.querySelector(".attributes__List");
                          return list && list.querySelectorAll('input[type="radio"]').length > 0 ? list : null;
                        }, 5000);

                        if (attrList) {
                          const radios = [...attrList.querySelectorAll('input[type="radio"]')];
                          let bestRadio = null, bestScore = -1;
                          for (const radio of radios) {
                            const container = radio.closest("label, .attribute__item, li, div") || radio.parentElement;
                            const rawText = (container?.textContent || "").replace(/^\s*\(D\d+\)\s*/i, "").trim();
                            const score = jaccardWords(normAttr(rawText), descTarget);
                            if (score > bestScore) { bestScore = score; bestRadio = radio; }
                          }
                          skillDebug.attrScore = Math.round(bestScore * 100);
                          if (bestRadio && bestScore >= 0.5) {
                            bestRadio.click();
                            await sleep(150);
                            skillDebug.attrSet = true;
                          }
                        }
                      }

                      // Salva a habilidade clicando em "Adicionar habilidade"
                      const saveBtn = await waitFor(() => {
                        const b = wrapper.querySelector(".save__skill__button");
                        return b && !b.disabled ? b : null;
                      }, 3000);
                      if (saveBtn) {
                        saveBtn.click();
                        skillDebug.saved = true;
                      }
                    }
                  }
                }
              } catch (e) {
                skillDebug.error = e.message;
              }
            }
          }

          sendResponse({ ok: true, debugRadio, skillDebug, discursive: q.tipo === "discursive" });

        } else {
          sendResponse({ ok: false, error: `Campo desconhecido: ${field}` });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  });

  // ================================================================
})();
