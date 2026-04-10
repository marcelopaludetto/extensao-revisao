const KEY = "aluraRevisorRunState";
const KEY_HISTORY = "aluraRevisorHistory";
const KEY_DROPBOX_UPLOAD = "aluraRevisorDropboxUploadState";

const statusEl = document.getElementById("status");
const btn = document.getElementById("start");
const btnDownload = document.getElementById("btnDownload");
const btnUpload = document.getElementById("btnUpload");
const historyEl = document.getElementById("history");

let isRunning = false;
let isDownloading = false;
let isUploading = false;
let currentHistory = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function setRunningUI(running) {
  isRunning = running;
  btn.textContent = running ? "Parar revisão" : "Start revisão";
  btn.style.background = running ? "#e53935" : "#00c86f";
  btn.style.color = "#fff";
  if (btnDownload) btnDownload.disabled = running;
}

function setUploadingUI(uploading, count) {
  isUploading = uploading;
  if (!btnUpload) return;
  if (uploading) {
    const label = count != null ? `Subindo… (${count} vídeo(s))` : "Subindo…";
    btnUpload.textContent = label;
    btnUpload.style.background = "#e53935";
    btnUpload.style.color = "#fff";
    btn.disabled = true;
    if (btnDownload) btnDownload.disabled = true;
  } else {
    btnUpload.textContent = "Subir vídeos do curso";
    btnUpload.style.background = "#067ada";
    btnUpload.style.color = "#fff";
    btn.disabled = false;
    if (btnDownload) btnDownload.disabled = false;
  }
}

function setDownloadingUI(downloading, count) {
  isDownloading = downloading;
  if (!btnDownload) return;
  if (downloading) {
    const label = count != null ? `Baixando… (${count} vídeo(s))` : "Baixando…";
    btnDownload.textContent = label;
    btnDownload.style.background = "#e53935";
    btnDownload.style.color = "#fff";
    btn.disabled = true;
  } else {
    btnDownload.textContent = "Baixar vídeos do curso";
    btnDownload.style.background = "#1c1c1c";
    btnDownload.style.color = "#fff";
    btn.disabled = false;
  }
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

// ---------- Dropbox OAuth2 PKCE ----------
const dropboxClientIdEl = document.getElementById("dropbox-client-id");
const dropboxConnectBtn = document.getElementById("dropbox-connect-btn");
const dropboxDisconnectBtn = document.getElementById("dropbox-disconnect-btn");
const dropboxAuthStatusEl = document.getElementById("dropbox-auth-status");
const dropboxRedirectHint = document.getElementById("dropbox-redirect-hint");
const dropboxRedirectUriEl = document.getElementById("dropbox-redirect-uri");

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function applyDropboxAuthState(data) {
  if (!dropboxConnectBtn) return;
  const connected = !!data?.aluraRevisorDropboxRefreshToken;
  dropboxConnectBtn.style.display = connected ? "none" : "";
  dropboxDisconnectBtn.style.display = connected ? "" : "none";
  if (dropboxAuthStatusEl) {
    dropboxAuthStatusEl.textContent = connected ? "✅ Conectado" : "";
  }
  if (dropboxClientIdEl && data?.aluraRevisorDropboxClientId) {
    dropboxClientIdEl.value = data.aluraRevisorDropboxClientId;
  }
}

if (dropboxConnectBtn) {
  const redirectUri = chrome.identity.getRedirectURL();
  if (dropboxRedirectUriEl) dropboxRedirectUriEl.textContent = redirectUri;
  if (dropboxRedirectHint) dropboxRedirectHint.style.display = "";

  dropboxConnectBtn.addEventListener("click", async () => {
    const clientId = dropboxClientIdEl?.value.trim();
    if (!clientId) {
      dropboxAuthStatusEl.textContent = "Informe o App Key antes de conectar.";
      return;
    }
    dropboxConnectBtn.disabled = true;
    dropboxAuthStatusEl.textContent = "Abrindo autenticação Dropbox…";
    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const authUrl = new URL("https://www.dropbox.com/oauth2/authorize");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("token_access_type", "offline");

      const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });
      const code = new URL(responseUrl).searchParams.get("code");
      if (!code) throw new Error("Código de autorização não recebido.");

      dropboxAuthStatusEl.textContent = "Trocando código por tokens…";
      const tokenResp = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      if (!tokenResp.ok) throw new Error(`Token exchange HTTP ${tokenResp.status}: ${(await tokenResp.text()).slice(0, 150)}`);
      const tokens = await tokenResp.json();
      if (!tokens.access_token) throw new Error(JSON.stringify(tokens).slice(0, 150));

      await chrome.storage.local.set({
        aluraRevisorDropboxToken: tokens.access_token,
        aluraRevisorDropboxRefreshToken: tokens.refresh_token,
        aluraRevisorDropboxTokenExpiry: Date.now() + (tokens.expires_in ?? 14400) * 1000,
        aluraRevisorDropboxClientId: clientId,
      });
      applyDropboxAuthState({ aluraRevisorDropboxRefreshToken: tokens.refresh_token, aluraRevisorDropboxClientId: clientId });
    } catch (e) {
      dropboxAuthStatusEl.textContent = `Erro: ${e.message}`;
    } finally {
      dropboxConnectBtn.disabled = false;
    }
  });
}

if (dropboxDisconnectBtn) {
  dropboxDisconnectBtn.addEventListener("click", async () => {
    await chrome.storage.local.remove([
      "aluraRevisorDropboxToken", "aluraRevisorDropboxRefreshToken",
      "aluraRevisorDropboxTokenExpiry", "aluraRevisorDropboxClientId",
    ]);
    if (dropboxAuthStatusEl) dropboxAuthStatusEl.textContent = "Desconectado.";
    applyDropboxAuthState({});
  });
}

// ---------- Token video-uploader ----------
const uploaderTokenEl = document.getElementById("uploader-token");
const uploaderTokenSaveBtn = document.getElementById("uploader-token-save-btn");
const uploaderTokenStatusEl = document.getElementById("uploader-token-status");

if (uploaderTokenSaveBtn) {
  uploaderTokenSaveBtn.addEventListener("click", async () => {
    const token = uploaderTokenEl.value.trim();
    await chrome.storage.local.set({ aluraRevisorUploaderToken: token });
    uploaderTokenStatusEl.textContent = token ? "✅ Token salvo." : "Token removido.";
    setTimeout(() => { uploaderTokenStatusEl.textContent = ""; }, 2000);
  });
}

// ---------- Tab switching ----------
const tabReviewBtn = document.getElementById("tab-review-btn");
const tabToolsBtn = document.getElementById("tab-tools-btn");
const tabReview = document.getElementById("tab-review");
const tabTools = document.getElementById("tab-tools");

tabReviewBtn.addEventListener("click", () => {
  tabReviewBtn.classList.add("active");
  tabToolsBtn.classList.remove("active");
  tabReview.style.display = "";
  tabTools.style.display = "none";
});

tabToolsBtn.addEventListener("click", () => {
  tabToolsBtn.classList.add("active");
  tabReviewBtn.classList.remove("active");
  tabTools.style.display = "";
  tabReview.style.display = "none";
});

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
      const ack = await chrome.tabs.sendMessage(tab.id, { type: "ALURA_REVISOR_START", productType });

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

// ---------- Baixar vídeos ----------
if (btnDownload) {
  btnDownload.addEventListener("click", async () => {
    try {
      btnDownload.disabled = true;

      if (isDownloading) {
        setStatus("Parando download…");
        try {
          const tab = await getActiveTab();
          await chrome.tabs.sendMessage(tab.id, { type: "ALURA_REVISOR_STOP" });
        } catch {
          // Tab may be navigating; clear storage directly as fallback
        } finally {
          await chrome.storage.local.remove(KEY);
        }
        setDownloadingUI(false);
        setStatus("Download parado.");
      } else {
        setStatus("Iniciando download…");
        const tab = await getActiveTab();
        const ack = await chrome.tabs.sendMessage(tab.id, { type: "ALURA_REVISOR_START_DOWNLOAD" });

        if (!ack?.ok) {
          setStatus(`Não iniciou: ${ack?.error || "erro desconhecido"}`);
          return;
        }

        setDownloadingUI(true, 0);
        setStatus("Baixando vídeos… (0 baixado(s))");
      }
    } catch (e) {
      setStatus(`Erro: ${e.message}`);
    } finally {
      btnDownload.disabled = false;
    }
  });
}

// ---------- Subir vídeos ----------
if (btnUpload) {
  btnUpload.addEventListener("click", async () => {
    try {
      btnUpload.disabled = true;

      if (isUploading) {
        setStatus("Parando upload…");
        try {
          const tab = await getActiveTab();
          await chrome.tabs.sendMessage(tab.id, { type: "ALURA_REVISOR_STOP" });
        } catch {
          // Tab may be navigating; clear storage directly as fallback
        } finally {
          await chrome.storage.local.remove("aluraRevisorRunState");
        }
        setUploadingUI(false);
        setStatus("Upload parado.");
      } else {
        setStatus("Iniciando upload…");
        const tab = await getActiveTab();
        const ack = await chrome.tabs.sendMessage(tab.id, { type: "ALURA_REVISOR_START_UPLOAD" });

        if (!ack?.ok) {
          setStatus(`Não iniciou: ${ack?.error || "erro desconhecido"}`);
          return;
        }

        setUploadingUI(true, 0);
        setStatus("Subindo vídeos… (0 enviado(s))");
      }
    } catch (e) {
      setStatus(`Erro: ${e.message}`);
    } finally {
      btnUpload.disabled = false;
    }
  });
}

// ---------- Fork ----------
const forkUrlEl = document.getElementById("fork-url");
const forkBtn = document.getElementById("fork-btn");
const forkStatusEl = document.getElementById("fork-status");

forkBtn.addEventListener("click", () => {
  const raw = forkUrlEl.value.trim();
  const match = raw.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?\s*$/);
  if (!match) { forkStatusEl.textContent = "❌ URL inválida. Use: https://github.com/owner/repo"; return; }
  const [, owner, repo] = match;
  forkBtn.disabled = true;
  forkStatusEl.textContent = "Criando fork...";
  chrome.runtime.sendMessage({ type: "ALURA_REVISOR_FORK_REPO", owner, repo }, (resp) => {
    forkBtn.disabled = false;
    if (resp?.ok) {
      forkStatusEl.textContent = `✅ Fork criado: ${resp.forkUrl}`;
    } else {
      forkStatusEl.textContent = `❌ ${resp?.error || "Erro desconhecido"}`;
    }
  });
});

const jsonReadyIndicator = document.getElementById("json-ready-indicator");
const jsonReadyCourse = document.getElementById("json-ready-course");
const jsonReadyCount = document.getElementById("json-ready-count");

function showJsonReadyIndicator(json) {
  if (!jsonReadyIndicator || !json?.sections) return;
  const count = json.sections.reduce((s, sec) =>
    s + sec.activities.filter(a => !a.skipped && !a.error).length, 0);
  const errorCount = json.sections.reduce((s, sec) =>
    s + sec.activities.filter(a => a.error).length, 0);
  if (jsonReadyCourse) jsonReadyCourse.textContent = `Curso ${json.courseId}`;
  if (jsonReadyCount) {
    jsonReadyCount.textContent = count > 0
      ? `${count} atividade(s)${errorCount > 0 ? ` · ⚠️ ${errorCount} com erro` : ""}`
      : `⚠️ 0 válidas (${errorCount} com erro — baixe novamente)`;
  }
  jsonReadyIndicator.style.color = count > 0 ? "#2e7d32" : "#b71c1c";
  jsonReadyIndicator.style.background = count > 0 ? "#e8f5e9" : "#ffebee";
  jsonReadyIndicator.style.display = "block";
}

// ---------- Download de atividades traduzidas ----------
const btnDownloadTranslated = document.getElementById("btnDownloadTranslated");
const downloadTranslatedStatus = document.getElementById("download-translated-status");

if (btnDownloadTranslated) {
  btnDownloadTranslated.addEventListener("click", async () => {
    btnDownloadTranslated.disabled = true;
    if (downloadTranslatedStatus) downloadTranslatedStatus.textContent = "Iniciando…";
    try {
      const tab = await getActiveTab();
      const ack = await chrome.tabs.sendMessage(tab.id, {
        type: "ALURA_REVISOR_DOWNLOAD_TRANSLATED",
      });
      if (!ack?.ok) {
        if (downloadTranslatedStatus) downloadTranslatedStatus.textContent = `Erro: ${ack?.error || "desconhecido"}`;
        btnDownloadTranslated.disabled = false;
      }
    } catch (e) {
      if (downloadTranslatedStatus) downloadTranslatedStatus.textContent = `Erro: ${e.message}`;
      btnDownloadTranslated.disabled = false;
    }
  });
}

// ---------- Credenciais AWS (Bedrock) ----------
const awsAccessKeyEl = document.getElementById("aws-access-key");
const awsSecretKeyEl = document.getElementById("aws-secret-key");
const awsRegionEl = document.getElementById("aws-region");
const awsCredsSaveBtn = document.getElementById("aws-creds-save-btn");
const awsCredsStatusEl = document.getElementById("aws-creds-status");

if (awsCredsSaveBtn) {
  awsCredsSaveBtn.addEventListener("click", async () => {
    const accessKeyId = awsAccessKeyEl?.value.trim() || "";
    const secretAccessKey = awsSecretKeyEl?.value.trim() || "";
    const region = awsRegionEl?.value.trim() || "us-east-1";
    await chrome.storage.local.set({ aluraRevisorAwsCreds: { accessKeyId, secretAccessKey, region } });
    awsCredsStatusEl.textContent = accessKeyId ? "Credenciais salvas." : "Credenciais removidas.";
    setTimeout(() => { awsCredsStatusEl.textContent = ""; }, 2000);
  });
}

// ---------- Renomear Seções com IA ----------
const renameSectionsBtn = document.getElementById("rename-sections-btn");
const renameSectionsStatusEl = document.getElementById("rename-sections-status");

if (renameSectionsBtn) {
  renameSectionsBtn.addEventListener("click", async () => {
    try {
      renameSectionsBtn.disabled = true;
      if (renameSectionsStatusEl) renameSectionsStatusEl.textContent = "Iniciando...";

      const data = await chrome.storage.local.get("aluraRevisorAwsCreds");
      const creds = data?.aluraRevisorAwsCreds;
      if (!creds?.accessKeyId || !creds?.secretAccessKey) {
        if (renameSectionsStatusEl) renameSectionsStatusEl.textContent = "Configure as credenciais AWS primeiro.";
        renameSectionsBtn.disabled = false;
        return;
      }

      const tab = await getActiveTab();
      const ack = await chrome.tabs.sendMessage(tab.id, {
        type: "ALURA_REVISOR_RENAME_SECTIONS",
      });

      if (!ack?.ok) {
        if (renameSectionsStatusEl) renameSectionsStatusEl.textContent = `Erro: ${ack?.error || "desconhecido"}`;
        renameSectionsBtn.disabled = false;
      } else {
        if (renameSectionsStatusEl) renameSectionsStatusEl.textContent = "Processando...";
      }
    } catch (e) {
      if (renameSectionsStatusEl) renameSectionsStatusEl.textContent = `Erro: ${e.message}`;
      renameSectionsBtn.disabled = false;
    }
  });
}

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
  const data = await chrome.storage.local.get([
    "aluraRevisorGithubToken",
    "aluraRevisorUploaderToken",
    "aluraRevisorAwsCreds",
    "aluraRevisorDropboxRefreshToken",
    "aluraRevisorDropboxClientId",
  ]);

  if (githubTokenEl && data.aluraRevisorGithubToken)
    githubTokenEl.value = data.aluraRevisorGithubToken;

  if (uploaderTokenEl && data.aluraRevisorUploaderToken)
    uploaderTokenEl.value = data.aluraRevisorUploaderToken;

  if (data.aluraRevisorAwsCreds) {
    if (awsAccessKeyEl) awsAccessKeyEl.value = data.aluraRevisorAwsCreds.accessKeyId || "";
    if (awsSecretKeyEl) awsSecretKeyEl.value = data.aluraRevisorAwsCreds.secretAccessKey || "";
    if (awsRegionEl)    awsRegionEl.value    = data.aluraRevisorAwsCreds.region || "us-east-1";
  }

  applyDropboxAuthState(data);
})();

