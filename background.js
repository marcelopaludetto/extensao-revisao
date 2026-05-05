if (typeof self.UsageReport === "undefined" && typeof importScripts === "function") {
  importScripts("report.js");
}

const UsageReport = self.UsageReport;
const ALURA_ORIGIN = "https://cursos.alura.com.br";
const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("")).origin;

function applyActionPopupForTab(tab) {
  if (!tab || !tab.id) return;
  const isAlura = (tab.url || "").startsWith(ALURA_ORIGIN);
  try {
    chrome.action.setPopup({ tabId: tab.id, popup: isAlura ? "" : "popup.html" });
  } catch (_) {}
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" || changeInfo.url) applyActionPopupForTab(tab);
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => { if (!chrome.runtime.lastError) applyActionPopupForTab(tab); });
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, (tabs) => tabs.forEach(applyActionPopupForTab));
  UsageReport.flushQueuedUsageLogs().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  chrome.tabs.query({}, (tabs) => tabs.forEach(applyActionPopupForTab));
  UsageReport.flushQueuedUsageLogs().catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  if (!(tab.url || "").startsWith(ALURA_ORIGIN)) return;
  chrome.tabs.sendMessage(tab.id, { type: "ALURA_REVISOR_TOGGLE_PANEL" }, () => {
    void chrome.runtime.lastError;
  });
});

let _credentialsConfig = null;

async function getCredentialsConfig() {
  if (_credentialsConfig) return _credentialsConfig;
  const resp = await fetch(chrome.runtime.getURL("credentials.config.json"));
  _credentialsConfig = await resp.json();
  return _credentialsConfig;
}

async function getGithubToken() {
  const data = await chrome.storage.local.get(["aluraRevisorGithubToken"]);
  return data?.aluraRevisorGithubToken || "";
}

function isValidSender(sender) {
  const origin = sender?.url ? new URL(sender.url).origin : "";
  return origin === ALURA_ORIGIN || origin === EXTENSION_ORIGIN;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_LOG_CAPTION_REQUESTS") return;

  (async () => {
    const entries = Array.isArray(msg.entries) ? msg.entries : [];
    const results = [];

    for (const entry of entries) {
      const data = UsageReport.normalizeCaptionLogEntry(entry);
      if (!data.courseId || data.count <= 0) continue;

      results.push(await UsageReport.queueUsageLogEntry(data));
    }

    const failed = results.filter(r => !r.ok);
    sendResponse({ ok: failed.length === 0, logged: results.length - failed.length, failed });
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_LOG_USAGE") return;

  (async () => {
    const entries = Array.isArray(msg.entries) ? msg.entries : [msg.entry || msg];
    const results = [];

    for (const entry of entries) {
      const data = UsageReport.normalizeUsageLogEntry(entry);
      if (!data.feature || data.count <= 0) continue;
      results.push(await UsageReport.queueUsageLogEntry(data));
    }

    const failed = results.filter(r => !r.ok);
    sendResponse({ ok: failed.length === 0, logged: results.length - failed.length, failed });
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_NOTIFY") return;

  const r = msg.result || {};
  const okAll = !!r.transcriptionIs100 && !!r.finished && !r.error;

  const title = okAll ? "Revisão finalizada ✅" : "Revisão finalizada ⚠️";

  const lines = [
    `${r.transcriptionIs100 ? "✅" : "❌"} Transcrição 100% (atual: ${r.transcriptionPercentText || "?"})`,
    `📌 Cliques em "Próxima atividade": ${typeof r.steps === "number" ? r.steps : "?"}`,
    r.finished ? "🏁 Chegou ao fim do curso (voltou pra Home)" : "⏸️ Execução interrompida"
  ];

  if (r.error) lines.push(`Erro: ${r.error}`);

  chrome.notifications.create({
    type: "basic",
    title,
    message: lines.join("\n")
  });

  sendResponse({ ok: true });
});

const LINK_CHECK_TIMEOUT_MS = 10000;
const CONCURRENCY = 8;

const SKIP_404_HOSTNAMES = new Set([
  "figma.com",
  "www.figma.com",
]);

function shouldSkip404Check(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SKIP_404_HOSTNAMES.has(host);
  } catch {
    return false;
  }
}

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = LINK_CHECK_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store"
    });
  } finally {
    clearTimeout(t);
  }
}

async function check404(url) {
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD" });
    if (res.status === 404) return true;
    if (res.status !== 405) return false;
  } catch {}

  try {
    const res = await fetchWithTimeout(url, { method: "GET" });
    return res.status === 404;
  } catch {
    return false;
  }
}

async function runWithConcurrency(items, worker, concurrency = CONCURRENCY) {
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

async function openTab(url, timeoutMs = 20000) {
  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
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

function openCatalogTab(courseId, baseUrl) {
  const url = `${baseUrl}/admin/catalogs/contents/course/${encodeURIComponent(courseId)}`;
  return openTab(url, 15000);
}

// Após criar uma atividade, o admin redireciona para a lista de tasks da seção.
// Para corrigir a renderização do markdown: navega para essa lista, acha a task
// pelo título, entra no link "Editar" e clica em Salvar novamente.
async function resaveAfterCreate(tabId, courseId, sectionId, activityTitle) {
  const baseUrl = "https://cursos.alura.com.br";

  // Aguarda o salvamento inicial processar antes de navegar
  await new Promise(r => setTimeout(r, 3000));

  // Navega para a lista de tasks da seção
  const tasksUrl = `${baseUrl}/admin/course/v2/${courseId}/section/${sectionId}/tasks`;
  await chrome.tabs.update(tabId, { url: tasksUrl });
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 15000);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });

  // Procura o link "Editar" da task pelo título na tabela #tasks-table
  let editHref = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: (title) => {
        const rows = document.querySelectorAll("#tasks-table tbody tr");
        if (!rows.length) return null;
        for (const row of rows) {
          if (row.cells[2]?.textContent?.trim() === title) {
            return row.querySelector('a[href*="/task/edit/"]')?.getAttribute("href") || null;
          }
        }
        // fallback: última task da lista (a recém-criada costuma ser a última)
        const lastRow = [...rows].at(-1);
        return lastRow?.querySelector('a[href*="/task/edit/"]')?.getAttribute("href") || null;
      },
      args: [activityTitle],
    }).catch(() => null);
    if (res?.[0]?.result) { editHref = res[0].result; break; }
  }
  if (!editHref) return;

  // Navega para a URL de edição
  await chrome.tabs.update(tabId, { url: `${baseUrl}${editHref}` });
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 15000);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });

  // Aguarda #submitTask e clica
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.querySelector("#submitTask"),
    }).catch(() => null);
    if (res?.[0]?.result) break;
  }
  await new Promise(r => setTimeout(r, 400));
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { document.querySelector("#submitTask")?.click(); },
  });
  await new Promise(r => setTimeout(r, 2000));
}

function checkAnyInTarget(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const targetEl = document.querySelector("#target");
      if (!targetEl) return false;
      return targetEl.querySelectorAll(".connectedSortable_v2-item").length > 0;
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_CHECK_CATALOG") return;

  (async () => {
    let tabId;
    const baseUrl = new URL(sender.url).origin;

    try {
      tabId = await openCatalogTab(msg.courseId, baseUrl);
      const results = await checkAnyInTarget(tabId);

      sendResponse({
        ok: true,
        catalogOk: results?.[0]?.result === true
      });
    } catch {
      sendResponse({ ok: false, catalogOk: false });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_ADD_TO_CATALOG") return;

  (async () => {
    let tabId;
    const baseUrl = new URL(sender.url).origin;
    console.log(`[Catalog] courseId=${msg.courseId}, label="${msg.catalogLabel}"`);

    try {
      tabId = await openCatalogTab(msg.courseId, baseUrl);

      const step1 = await chrome.scripting.executeScript({
        target: { tabId },
        func: (catalogLabel, catalogId) => {
          const sourceEl = document.querySelector("#source");
          if (!sourceEl) {
            return { ok: false, error: "Seletor de catálogos não encontrado" };
          }

          let item = null;
          if (catalogId) {
            item = sourceEl.querySelector(`.connectedSortable_v2-item[title="${catalogId}"]`);
          } else {
            const items = sourceEl.querySelectorAll(".connectedSortable_v2-item");
            for (const el of items) {
              const label = el.querySelector(".connectedSortable_v2-item-label");
              if (label && label.textContent.trim().includes(catalogLabel)) {
                item = el;
                break;
              }
            }
          }

          if (!item) {
            const desc = catalogId ? `ID ${catalogId}` : `"${catalogLabel}"`;
            return { ok: false, error: `Catálogo ${desc} não encontrado na lista` };
          }

          const checkbox = item.querySelector(".connectedSortable_v2-item-checkbox");
          if (!checkbox) {
            return { ok: false, error: "Checkbox do catálogo não encontrado" };
          }

          checkbox.click();
          return { ok: true };
        },
        args: [msg.catalogLabel || "", msg.catalogId || ""]
      });

      if (!step1?.[0]?.result?.ok) {
        sendResponse({
          ok: false,
          error: step1?.[0]?.result?.error || "Falha ao selecionar catálogo"
        });
        return;
      }

      await new Promise(r => setTimeout(r, 400));

      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          document
            .querySelector(".connectedSortable_v2-moveRight")
            ?.click();
        }
      });

      await new Promise(r => setTimeout(r, 400));

      const navDone = new Promise(resolve => {
        const timer = setTimeout(resolve, 10000);

        chrome.tabs.onUpdated.addListener(function listener(id, info) {
          if (id === tabId && info.status === "complete") {
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        });
      });

      chrome.scripting
        .executeScript({
          target: { tabId },
          func: () => {
            document.querySelector("#submitForm")?.click();
          }
        })
        .catch(() => {});

      await navDone;

      // Após submit a página navega — não é possível verificar #target. Considera OK.
      console.log(`[Catalog] resultado: OK`);
      sendResponse({ ok: true });
    } catch (e) {
      console.error("[Catalog] erro:", e.message);
      sendResponse({
        ok: false,
        error: e?.message || String(e)
      });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_REMOVE_FROM_CATALOG") return;

  (async () => {
    let tabId;
    const baseUrl = new URL(sender.url).origin;

    try {
      tabId = await openCatalogTab(msg.courseId, baseUrl);

      const step1 = await chrome.scripting.executeScript({
        target: { tabId },
        func: (catalogLabel) => {
          const targetEl = document.querySelector("#target");
          if (!targetEl) {
            return { ok: false, error: "Seletor #target não encontrado" };
          }

          const items = targetEl.querySelectorAll(".connectedSortable_v2-item");

          for (const item of items) {
            const label = item.querySelector(".connectedSortable_v2-item-label");

            if (label && label.textContent.trim().includes(catalogLabel)) {
              const checkbox = item.querySelector(".connectedSortable_v2-item-checkbox");

              if (!checkbox) {
                return { ok: false, error: `Checkbox de "${catalogLabel}" não encontrado` };
              }

              checkbox.click();
              return { ok: true };
            }
          }

          return {
            ok: false,
            error: `Catálogo "${catalogLabel}" não encontrado em #target`
          };
        },
        args: [msg.catalogLabel]
      });

      if (!step1?.[0]?.result?.ok) {
        sendResponse({
          ok: false,
          error: step1?.[0]?.result?.error || "Falha ao selecionar catálogo em #target"
        });
        return;
      }

      await new Promise(r => setTimeout(r, 400));

      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          document.querySelector(".connectedSortable_v2-moveLeft")?.click();
        }
      });

      await new Promise(r => setTimeout(r, 400));

      const navDone = new Promise(resolve => {
        const timer = setTimeout(resolve, 10000);

        chrome.tabs.onUpdated.addListener(function listener(id, info) {
          if (id === tabId && info.status === "complete") {
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        });
      });

      chrome.scripting
        .executeScript({
          target: { tabId },
          func: () => {
            document.querySelector("#submitForm")?.click();
          }
        })
        .catch(() => {});

      await navDone;

      const verify = await chrome.scripting.executeScript({
        target: { tabId },
        func: (catalogLabel) => {
          const targetEl = document.querySelector("#target");
          if (!targetEl) return true;
          const items = [...targetEl.querySelectorAll(".connectedSortable_v2-item")];
          return !items.some(item =>
            item.querySelector(".connectedSortable_v2-item-label")?.textContent?.trim() === catalogLabel
          );
        },
        args: [msg.catalogLabel]
      });

      sendResponse({
        ok: verify?.[0]?.result === true
      });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e?.message || String(e)
      });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_CHECK_ICON") return;

  (async () => {
    const { courseSlug } = msg;
    const pat = await getGithubToken();

    const url = `https://api.github.com/repos/caelum/gnarus-api-assets/contents/alura/assets/api/cursos/${encodeURIComponent(courseSlug)}.svg`;

    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json"
        }
      });

      sendResponse({
        exists: resp.status === 200,
        notFound: resp.status === 404
      });
    } catch {
      sendResponse({ exists: false, notFound: false });
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_UPLOAD_ICON") return;

  (async () => {
    const { categorySlug, courseSlug } = msg;
    const pat = await getGithubToken();

    try {
      const svgResp = await fetch(
        chrome.runtime.getURL(`icons/${categorySlug}.svg`)
      );

      if (!svgResp.ok) {
        sendResponse({
          ok: false,
          error: `SVG template não encontrado: ${categorySlug}.svg`
        });
        return;
      }

      const svgText = await svgResp.text();
      const base64 = btoa(unescape(encodeURIComponent(svgText)));

      const url = `https://api.github.com/repos/caelum/gnarus-api-assets/contents/alura/assets/api/cursos/${encodeURIComponent(courseSlug)}.svg`;

      const resp = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Add icon for ${courseSlug}`,
          content: base64,
          branch: "master"
        })
      });

      const ok = resp.status === 201;
      if (ok) {
        await UsageReport.queueFeatureUsageLog("icon_uploaded", "uploaded", msg, {
          categorySlug,
          courseSlug,
        });
      }
      sendResponse({ ok });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e?.message || String(e)
      });
    }
  })();

  return true;
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_GET_SECTIONS") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = new URL(sender.url).origin;
      const url = `${baseUrl}/admin/courses/v2/${encodeURIComponent(msg.courseId)}/sections`;
      tabId = await openTab(url);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const rows = document.querySelectorAll("#sectionIds tbody tr");
          return [...rows].map(tr => ({
            id: tr.id,
            title: tr.cells[2]?.textContent?.trim() ?? "",
            active: !tr.classList.contains("danger") && (tr.cells[3]?.textContent ?? "").includes("Ativo")
          })).filter(s => s.id);
        }
      });

      sendResponse({ ok: true, sections: results?.[0]?.result ?? [] });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e), sections: [] });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_GET_SECTION_TASKS") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = new URL(sender.url).origin;
      const url = `${baseUrl}/admin/course/v2/${encodeURIComponent(msg.courseId)}/section/${encodeURIComponent(msg.sectionId)}/tasks`;
      tabId = await openTab(url);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (includeInactive) => {
          const rows = [...document.querySelectorAll("#tasks-table tbody tr")];
          const allTasks = rows.map(tr => ({
            id: tr.querySelector("input[name='sectionIds']")?.value ?? "",
            type: tr.cells[1]?.textContent?.trim() ?? "",
            title: tr.cells[2]?.textContent?.trim() ?? "",
            active: !tr.classList.contains("danger"),
            editUrl: tr.querySelector("a[href*='/task/edit/']")?.href ?? "",
            activityUrl: tr.querySelector("a[href*='/course/'][href*='/task/']:not([href*='/admin/'])")?.href ?? ""
          })).filter(t => t.id);

          const hasActive = allTasks.some(t => t.active);
          const hasInactive = allTasks.some(t => !t.active);
          let reordered = false;

          if (hasActive && hasInactive) {
            const firstActiveIndex = allTasks.findIndex(t => t.active);
            const hasInactiveBeforeActive = allTasks.slice(0, firstActiveIndex).some(t => !t.active);
            if (hasInactiveBeforeActive) {
              const btn = document.querySelector("#button__submit");
              if (btn) { btn.click(); reordered = true; }
            }
          }

          return { tasks: allTasks.filter(t => includeInactive ? !!t.editUrl : (t.active && t.editUrl)), reordered };
        },
        args: [msg.includeInactive || false]
      });

      const result = results?.[0]?.result ?? { tasks: [], reordered: false };
      if (result.reordered) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await UsageReport.queueFeatureUsageLog("activity_order_fixed", "inactive_tasks_reordered", msg, {
          sectionId: msg.sectionId,
          autoFix: true,
        });
      }
      const tasksWithAdminUrl = result.tasks.map(t => {
        const taskId = t.editUrl.match(/\/task\/edit\/(\d+)/)?.[1];
        return {
          ...t,
          activityUrl: taskId
            ? `${baseUrl}/admin/course/v2/${msg.courseId}/section/${msg.sectionId}/task/edit/${taskId}`
            : t.activityUrl
        };
      });
      sendResponse({ ok: true, tasks: tasksWithAdminUrl, reordered: result.reordered });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e), tasks: [] });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_GET_VIDEO_INFO") return;

  (async () => {
    let tabId;
    try {
      const url = `https://video-uploader.alura.com.br/video/${msg.uploaderCode}`;
      tabId = await openTab(url);

      const checks = msg.checks || {};
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (checks) => {
          const videoName = document.querySelector("h1")?.textContent?.trim() ?? "";

          let hasPortugues = false;
          let hasEspanhol  = false;

          if (checks.pt || checks.esp) {
            const waitFor = (fn, timeout = 3000) => new Promise(resolve => {
              const start = Date.now();
              const check = () => {
                const r = fn();
                if (r !== null && r !== undefined) return resolve(r);
                if (Date.now() - start > timeout) return resolve(null);
                setTimeout(check, 300);
              };
              check();
            });

            await waitFor(() => document.querySelector("[data-subtitle-id]") ? true : null, 3000);

            const allTdText = [...document.querySelectorAll("[data-subtitle-id] td")]
              .map(td => (td.textContent || "").trim().toLowerCase());
            if (checks.pt)  hasPortugues = allTdText.some(t => t.includes("portugu"));
            if (checks.esp) hasEspanhol  = allTdText.some(t => t.includes("espanhol") || t.includes("español"));
          }

          return { videoName, hasPortugues, hasEspanhol };
        },
        args: [checks],
      });

      const r = result?.[0]?.result ?? { videoName: "", hasPortugues: false, hasEspanhol: false };

      // Se faltar PT ou ES (entre os idiomas verificados), solicita geração via
      // POST direto no endpoint do form "Gerar legenda" (mesma sessão da aba).
      let legendaSolicitada = false;
      let usageLog = null;
      const faltaAlguma = (checks.pt && !r.hasPortugues) || (checks.esp && !r.hasEspanhol);
      if (faltaAlguma) {
        try {
          const out = await chrome.scripting.executeScript({
            target: { tabId },
            func: async () => {
              const btn = [...document.querySelectorAll('button[type="submit"], input[type="submit"]')]
                .find(b => /gerar\s+legenda/i.test((b.textContent || b.value || "").trim()));
              if (!btn) return { ok: false, reason: "botão não encontrado" };

              const form = btn.closest("form");
              if (!form) return { ok: false, reason: "form não encontrado" };

              const action = form.action;
              const method = (form.method || "POST").toUpperCase();
              const body = new FormData(form);

              try {
                const resp = await fetch(action, {
                  method,
                  body: method === "GET" ? undefined : body,
                  credentials: "include",
                  headers: { "X-Requested-With": "XMLHttpRequest" },
                });
                return { ok: resp.ok, status: resp.status, action };
              } catch (e) {
                return { ok: false, reason: "fetch error: " + (e?.message || String(e)) };
              }
            },
          });
          legendaSolicitada = !!out?.[0]?.result?.ok;
          if (legendaSolicitada) {
            try {
              usageLog = await UsageReport.queueUsageLogEntry(UsageReport.buildCaptionUsageLogEntry(msg));
            } catch (e) {
              usageLog = { ok: false, queued: false, error: e?.message || String(e) };
            }
          }
        } catch (_) {
          // silencioso: falha ao solicitar não bloqueia a auditoria
        }
      }

      sendResponse({ ok: true, ...r, legendaSolicitada, usageLog });
    } catch (err) {
      sendResponse({ ok: false, videoName: "", hasPortugues: false, hasEspanhol: false, legendaSolicitada: false, error: err?.message });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_LOAD_VIDEO_DURATION") return;

  (async () => {
    let tabId;
    try {
      tabId = await openTab(msg.activityUrl, 20000);
      await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          const start = Date.now();
          await new Promise(resolve => {
            const check = () => {
              if (document.querySelector("video.vjs-tech") || Date.now() - start > 8000) {
                resolve();
              } else {
                setTimeout(check, 300);
              }
            };
            check();
          });
        },
      });
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_GET_TASK_CONTENT") return;

  (async () => {
    let tabId;
    try {
      tabId = await openTab(msg.editUrl);

      // Loop externo no service worker: executeScript com função SÍNCRONA no MAIN world.
      // Funções async no MAIN world podem não ter o resultado capturado corretamente pelo
      // Chrome (a Promise não é esperada), fazendo results[0].result ficar undefined.
      // Solução: polling fora do executeScript, injetando função síncrona a cada tentativa.
      let contentResult = { videoUrl: null, htmlContents: [], transcriptionText: "" };

      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          // MAIN world: acessa expando cmEl.CodeMirror setado pelo script da página.
          // No isolated world padrão essa propriedade é invisível.
          world: "MAIN",
          func: () => {
            const videoUrl = document.querySelector("input[name='uri']")?.value ?? null;

            const htmlContents = [...document.querySelectorAll("input.hackeditor-sync")]
              .map(el => el.value)
              .filter(Boolean);

            // Alternativas: cada .fieldGroup-alternative dentro de #alternatives
            const alternatives = [...document.querySelectorAll("#alternatives .fieldGroup-alternative")].map(alt => {
              const textInput = alt.querySelector("input.hackeditor-sync[name*='.textHighlighted']");
              const opinionInput = alt.querySelector("input.hackeditor-sync[name*='.opinionHighlighted']");
              const correctInput = alt.querySelector("input.fieldGroup-alternative-actions-correct");
              return { body: textInput?.value || "", justification: opinionInput?.value || "", correct: correctInput?.checked === true };
            }).filter(a => a.body);

            // cm.getValue() retorna o texto completo do CodeMirror sem virtual scrolling.
            // Só acessível via MAIN world (expando no elemento .CodeMirror).
            const transcriptionText = [...document.querySelectorAll("textarea.markdownEditor-source")]
              .map(ta => {
                const cmEl = ta.closest(".hackeditor")?.querySelector(".CodeMirror");
                return cmEl?.CodeMirror?.getValue()?.trim() || (ta.value || "").trim();
              })
              .filter(Boolean)
              .join(" ");

            const singleChoiceEl = document.querySelector("input[name='singleChoiceCanUseAsOpenTask']");
            const isLuri = singleChoiceEl?.checked ?? false;
            const hasSingleChoiceField = singleChoiceEl !== null;
            return { videoUrl, htmlContents, alternatives, transcriptionText, isLuri, hasSingleChoiceField };
          }
        });

        const r = res?.[0]?.result;
        if (r) {
          contentResult = r;
          // Checkbox de Luri tem prioridade — quebra assim que aparecer
          if (r.hasSingleChoiceField) break;
          // Para vídeos, quebra quando tiver transcrição
          if (r.videoUrl && r.videoUrl !== "0" && r.transcriptionText.length > 0) break;
          // Para outros conteúdos, aguarda ao menos 1 ciclo (500ms) para o checkbox ter chance de renderizar
          if ((r.transcriptionText.length > 0 || r.htmlContents.length > 0) && attempt >= 1) break;
        }

        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 500));
      }

      sendResponse({ ok: true, ...contentResult });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e), videoUrl: null, htmlContents: [], transcriptionText: "" });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_CHECK_404") return;

  (async () => {
    const urls = Array.isArray(msg.urls)
      ? msg.urls.filter(isHttpUrl).filter(u => !shouldSkip404Check(u))
      : [];

    const uniq = Array.from(new Set(urls));

    const res = await runWithConcurrency(
      uniq,
      async u => ((await check404(u)) ? u : null)
    );

    const bad = res.filter(Boolean);

    sendResponse({ ok: true, bad404: bad });
  })().catch(e => {
    sendResponse({
      ok: false,
      error: e?.message || String(e),
      bad404: []
    });
  });

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_GET_CATALOGS") return;

  (async () => {
    let tabId;
    const baseUrl = new URL(sender.url).origin;
    try {
      tabId = await openCatalogTab(msg.courseId, baseUrl);
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const items = document.querySelectorAll("#source .connectedSortable_v2-item");
          return [...items].map(item => ({
            label: item.querySelector(".connectedSortable_v2-item-label")?.textContent?.trim() ?? ""
          })).filter(c => c.label);
        }
      });
      sendResponse({ ok: true, catalogs: results?.[0]?.result ?? [] });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e), catalogs: [] });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_GET_SUBCATEGORIES") return;

  (async () => {
    let tabId;
    const baseUrl = new URL(sender.url).origin;
    try {
      tabId = await openTab(`${baseUrl}/admin/categories`, 15000);
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const rows = [...document.querySelectorAll("table tbody tr")];
          return rows
            .filter(tr =>
              !tr.classList.contains("danger") &&
              tr.querySelector("a[href*='/admin/subcategories/']")
            )
            .map(tr => ({
              name: tr.cells[0]?.textContent?.trim() ?? "",
              urlSlug: tr.cells[1]?.textContent?.trim() ?? "",
              category: tr.cells[2]?.textContent?.trim() ?? "",
              id: tr.cells[3]?.textContent?.trim() ?? "",
            }))
            .filter(sub =>
              sub.id &&
              sub.category !== "Cursos proprietários" &&
              !sub.urlSlug.includes("escolas")
            );
        },
      });
      sendResponse({ ok: true, subcategories: result?.[0]?.result ?? [] });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message, subcategories: [] });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_ADD_TO_SUBCATEGORY") return;

  (async () => {
    let tabId;
    const baseUrl = new URL(sender.url).origin;
    console.log(`[Subcategory] subcategoryId=${msg.subcategoryId}, courseId=${msg.courseId}, urlType=${msg.urlType}`);
    try {
      const url = msg.urlType === "catalog"
        ? `${baseUrl}/admin/catalogs/${msg.subcategoryId}/contents`
        : `${baseUrl}/admin/subcategories/${msg.subcategoryId}/edit`;
      tabId = await openTab(url, 15000);

      const step1 = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (courseId) => {
          // Aguarda os itens do connectedSortable renderizarem (até 8s)
          const waitForItems = (ms = 8000) => new Promise(resolve => {
            const start = Date.now();
            const check = () => {
              if (document.querySelectorAll(".connectedSortable_v2-item-checkbox").length > 0) return resolve(true);
              if (Date.now() - start > ms) return resolve(false);
              setTimeout(check, 200);
            };
            check();
          });
          const loaded = await waitForItems();
          if (!loaded) return { ok: false, error: "Timeout: itens do connectedSortable não carregaram em 8s." };

          // Se o curso já está em #target, considera OK sem precisar adicionar
          const alreadyInTarget = document.querySelector(`.connectedSortable_v2-item-checkbox[value="${courseId}"]`) !== null
            && (() => {
              const cb = document.querySelector(`.connectedSortable_v2-item-checkbox[value="${courseId}"]`);
              return cb?.closest("#target, [id*='target']") !== null;
            })();
          if (alreadyInTarget) return { ok: true, alreadyPresent: true };

          const checkboxAnywhere = document.querySelector(`.connectedSortable_v2-item-checkbox[value="${courseId}"]`);
          if (!checkboxAnywhere) {
            const allCbs = [...document.querySelectorAll(".connectedSortable_v2-item-checkbox")];
            const sample = allCbs.slice(0, 8).map(el => el.value).join(", ");
            return { ok: false, error: `Curso ${courseId} não encontrado. Total: ${allCbs.length}. Valores exemplo: ${sample}` };
          }
          checkboxAnywhere.click();
          return { ok: true };
        },
        args: [msg.courseId],
      });

      if (!step1?.[0]?.result?.ok) {
        sendResponse({ ok: false, error: step1?.[0]?.result?.error });
        return;
      }

      // Curso já estava na subcategoria — não precisa submeter
      if (step1?.[0]?.result?.alreadyPresent) {
        console.log(`[Subcategory] já estava na subcategoria`);
        sendResponse({ ok: true });
        return;
      }

      await new Promise(r => setTimeout(r, 400));
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => { document.querySelector(".connectedSortable_v2-moveRight")?.click(); },
      });
      await new Promise(r => setTimeout(r, 400));

      const navDone = new Promise(resolve => {
        const timer = setTimeout(resolve, 10000);
        chrome.tabs.onUpdated.addListener(function listener(id, info) {
          if (id === tabId && info.status === "complete") {
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        });
      });
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => { document.querySelector("#submitForm")?.click(); },
      }).catch(() => {});
      await navDone;

      // Após submit a página navega — não é possível verificar #target. Considera OK.
      console.log(`[Subcategory] resultado: OK`);
      sendResponse({ ok: true });
    } catch (e) {
      console.error("[Subcategory] erro:", e.message);
      sendResponse({ ok: false, error: e?.message });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_GET_COURSE_TEXTUAL") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = new URL(sender.url).origin;
      const url = `${baseUrl}/admin/courses/v2/${encodeURIComponent(msg.courseId)}`;
      tabId = await openTab(url);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const courseName = document.querySelector("input[name='name']")?.value?.trim() ?? "";
          const nameInEnglish = document.querySelector("input[name='nameInEnglish']")?.value?.trim() ?? "";
          const nameInSpanish = document.querySelector("input[name='nameInSpanish']")?.value?.trim() ?? "";
          const courseCode = document.querySelector("input[name='code']")?.value?.trim() ?? "";
          const estimatedHours = document.querySelector("input[name='estimatedTimeToFinish']")?.value?.trim() ?? "";
          const metaDescription = document.querySelector("input[name='metadescription']")?.value?.trim() ?? "";
          const courseExclusive = document.querySelector("#courseExclusive")?.checked ?? false;
          const coursePrivate = document.querySelector("#course-private-toggle")?.checked ?? false;
          const targetPublic = document.querySelector("input[name='targetPublic']")?.value?.trim() ?? "";
          const authors = Array.from(document.querySelectorAll("select[name='authors'] option:checked"))
            .map(o => o.textContent.trim()).join(", ");
          const highlightedInformation = document.querySelector("textarea[name='highlightedInformation']")?.value?.trim() ?? "";
          const ementa = document.querySelector("textarea[name='ementa.raw']")?.value?.trim() ?? "";

          return { courseName, nameInEnglish, nameInSpanish, courseCode, estimatedHours,
                   metaDescription, courseExclusive, coursePrivate, targetPublic,
                   authors, highlightedInformation, ementa };
        }
      });

      sendResponse({ ok: true, ...(results?.[0]?.result ?? {}) });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_GET_ADMIN_FIELDS") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = new URL(sender.url).origin;
      const url = `${baseUrl}/admin/courses/v2/${encodeURIComponent(msg.courseId)}`;
      tabId = await openTab(url);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const courseName = document.querySelector("input[name='name']")?.value?.trim() ?? "";
          const courseCode = document.querySelector("input[name='code']")?.value?.trim() ?? "";
          const estimatedHours = document.querySelector("input[name='estimatedTimeToFinish']")?.value?.trim() ?? "";
          const metaDescription = document.querySelector("input[name='metadescription']")?.value?.trim() ?? "";
          const highlightedInformation = document.querySelector("textarea[name='highlightedInformation']")?.value?.trim() ?? "";
          const ementa = document.querySelector("textarea[name='ementa.raw']")?.value?.trim() ?? "";
          const courseExclusive = document.querySelector("#courseExclusive")?.checked ?? false;

          // Log de diagnóstico: lista todos os checkboxes da página para identificar o seletor correto
          const allCheckboxes = [...document.querySelectorAll("input[type='checkbox']")]
            .map(el => ({ id: el.id, name: el.name, checked: el.checked }));
          console.log("[Revisor] Checkboxes na página admin:", JSON.stringify(allCheckboxes));

          const forumBlocked =
            document.querySelector("#isToBlockForum")?.checked ??
            document.querySelector("#blockForum")?.checked ??
            document.querySelector("#block-forum")?.checked ??
            document.querySelector("input[name='blockForum']")?.checked ??
            document.querySelector("input[name='block_forum']")?.checked ??
            document.querySelector("input[name='forumBlocked']")?.checked ??
            false;

          const theme = document.querySelector("#theme")?.value ?? "";

          return { courseName, courseCode, estimatedHours,
                   metaDescription, highlightedInformation, ementa,
                   courseExclusive, forumBlocked, theme };
        }
      });

      sendResponse({ ok: true, ...(results?.[0]?.result ?? {}) });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_FIX_FORUM") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = new URL(sender.url).origin;
      const url = `${baseUrl}/admin/courses/v2/${encodeURIComponent(msg.courseId)}`;
      tabId = await openTab(url);

      // Passo 1: marcar o checkbox
      const checkResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const checkbox =
            document.querySelector("#isToBlockForum") ||
            document.querySelector("#blockForum") ||
            document.querySelector("#block-forum") ||
            document.querySelector("input[name='blockForum']") ||
            document.querySelector("input[name='block_forum']") ||
            document.querySelector("input[name='forumBlocked']");

          if (!checkbox) {
            // Diagnóstico: lista todos os checkboxes para identificar o seletor correto
            const all = [...document.querySelectorAll("input[type='checkbox']")]
              .map(el => `id="${el.id}" name="${el.name}"`).join(" | ");
            return { ok: false, error: `Checkbox não encontrado. Checkboxes na página: ${all || "(nenhum)"}` };
          }
          if (checkbox.checked) return { ok: true, alreadyChecked: true };

          // Tenta via label primeiro (mais confiável no React)
          const label =
            (checkbox.id && document.querySelector(`label[for="${checkbox.id}"]`)) ||
            checkbox.closest("label");
          if (label) {
            label.click();
          } else {
            checkbox.click();
          }

          return { ok: true, nowChecked: checkbox.checked };
        }
      });

      const cr = checkResults?.[0]?.result;
      if (!cr?.ok) { sendResponse({ ok: false, error: cr?.error || "Erro desconhecido." }); return; }

      // Passo 2: aguarda React processar e verifica se ficou checked
      await new Promise(res => setTimeout(res, 1200));
      const verifyResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const checkbox =
            document.querySelector("#isToBlockForum") ||
            document.querySelector("#blockForum") ||
            document.querySelector("#block-forum") ||
            document.querySelector("input[name='blockForum']") ||
            document.querySelector("input[name='block_forum']") ||
            document.querySelector("input[name='forumBlocked']");
          return { checked: checkbox?.checked ?? false };
        }
      });
      const checked = verifyResults?.[0]?.result?.checked;
      if (!checked) {
        sendResponse({ ok: false, error: "Checkbox não ficou marcado após o clique. Pode ser necessário marcar manualmente no admin." });
        return;
      }

      // Passo 3: salvar
      const saveResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const btn =
            document.querySelector("#submit-form__button") ||
            document.querySelector("input[type='submit']") ||
            document.querySelector("button[type='submit']");
          if (!btn) return { ok: false, error: "Botão salvar não encontrado." };
          btn.click();
          return { ok: true };
        }
      });

      const sr = saveResults?.[0]?.result;
      sendResponse(sr?.ok ? { ok: true } : { ok: false, error: sr?.error || "Erro ao salvar." });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) setTimeout(() => chrome.tabs.remove(tabId).catch(() => {}), 2500);
    }
  })();

  return true;
});


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_FIX_THEME") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = new URL(sender.url).origin;
      const url = `${baseUrl}/admin/courses/v2/${encodeURIComponent(msg.courseId)}`;
      tabId = await openTab(url);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        args: [msg.expectedTheme],
        func: (expectedTheme) => {
          const select = document.querySelector("#theme");
          if (!select) return { ok: false, error: "Select #theme não encontrado." };
          if (select.value === expectedTheme) return { ok: true, alreadyCorrect: true };

          // Usa o setter nativo para que o React/Vue reconheça a mudança
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
          setter.call(select, expectedTheme);
          select.dispatchEvent(new Event("change", { bubbles: true }));
          select.dispatchEvent(new Event("input", { bubbles: true }));

          return { ok: true, nowValue: select.value };
        }
      });

      const r = results?.[0]?.result;
      if (!r?.ok) { sendResponse({ ok: false, error: r?.error || "Erro desconhecido." }); return; }

      await new Promise(res => setTimeout(res, 1200));
      const saveResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const btn =
            document.querySelector("#submit-form__button") ||
            document.querySelector("input[type='submit']") ||
            document.querySelector("button[type='submit']");
          if (!btn) return { ok: false, error: "Botão salvar não encontrado." };
          btn.click();
          return { ok: true };
        }
      });

      const sr = saveResults?.[0]?.result;
      sendResponse(sr?.ok ? { ok: true } : { ok: false, error: sr?.error || "Erro ao salvar." });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) setTimeout(() => chrome.tabs.remove(tabId).catch(() => {}), 2500);
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_CHECK_SUBCATEGORY") return;

  (async () => {
    let tabId;
    const baseUrl = new URL(sender.url).origin;
    try {
      const url = msg.urlType === "catalog"
        ? `${baseUrl}/admin/catalogs/${msg.subcategoryId}/contents`
        : `${baseUrl}/admin/subcategories/${msg.subcategoryId}/edit`;
      tabId = await openTab(url, 15000);
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        args: [String(msg.courseId)],
        func: async (courseId) => {
          // Aguarda os itens renderizarem (até 8s)
          const loaded = await new Promise(resolve => {
            const start = Date.now();
            const check = () => {
              if (document.querySelectorAll(".connectedSortable_v2-item-checkbox").length > 0) return resolve(true);
              if (Date.now() - start > 8000) return resolve(false);
              setTimeout(check, 200);
            };
            check();
          });
          if (!loaded) return { inSubcategory: false };

          const cb = document.querySelector(`.connectedSortable_v2-item-checkbox[value="${courseId}"]`);
          const inTarget = cb !== null && cb.closest("#target, [id*='target']") !== null;
          return { inSubcategory: inTarget };
        }
      });
      sendResponse({ ok: true, inSubcategory: result?.[0]?.result?.inSubcategory ?? false });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

// Helper: aguarda tab completar carregamento (sem fechar)
function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

// Handler 1: Busca tipo e subtipo de uma task no admin da Alura
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_GET_ALURA_TASK_META") return;

  (async () => {
    let tabId;
    try {
      tabId = await openTab(msg.editUrl);

      // Polling até o select#chooseTask aparecer
      let result = { taskEnum: null, dataTag: null };
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const select = document.querySelector("#chooseTask");
            if (!select) return null;
            const selected = select.options[select.selectedIndex];
            return {
              taskEnum: selected?.dataset?.taskEnum ?? null,
              dataTag: selected?.dataset?.tag ?? null,
            };
          }
        });
        const r = res?.[0]?.result;
        if (r?.taskEnum) { result = r; break; }
        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 500));
      }

      sendResponse({ ok: true, ...result });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e), taskEnum: null, dataTag: null });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

// Handler 2: Busca tradução em espanhol de uma task da Alura
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_FETCH_TRANSLATION") return;

  (async () => {
    let tabId;
    try {
      const taskId = msg.taskId;
      // Tentativa 1: fetch direto do service worker
      try {
        const resp = await fetch(
          `https://cursos.alura.com.br/translate/task/${encodeURIComponent(taskId)}/es`,
          { method: "GET", credentials: "include", cache: "no-store" }
        );
        if (resp.ok) {
          return sendResponse({ ok: true, markdown: await resp.text() });
        }
      } catch (_) { /* fallback */ }

      // Fallback: abrir tab em cursos.alura.com.br e fazer fetch de lá
      tabId = await openTab("https://cursos.alura.com.br/dashboard", 20000);
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: async (tid) => {
          try {
            const r = await fetch(
              `/translate/task/${encodeURIComponent(tid)}/es`,
              { method: "GET", credentials: "include", cache: "no-store" }
            );
            return { ok: r.ok, markdown: await r.text(), status: r.status };
          } catch (e) {
            return { ok: false, markdown: "", error: e.message };
          }
        },
        args: [taskId],
      });
      const result = res?.[0]?.result ?? { ok: false, markdown: "", error: "executeScript falhou" };
      sendResponse(result);
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

// ---------- Verificação de atualização ----------
async function verificarAtualizacao() {
  try {
    const resp = await fetch("https://hub-producao-conteudo.vercel.app/update.xml");
    const text = await resp.text();
    const match = text.match(/<updatecheck[^>]+version='([\d.]+)'/);
    if (!match) return;

    const versaoHub = match[1];
    const versaoAtual = chrome.runtime.getManifest().version;

    const desatualizada = versaoHub !== versaoAtual &&
      versaoHub.localeCompare(versaoAtual, undefined, { numeric: true }) > 0;

    await chrome.storage.local.set({ atualizacaoDisponivel: desatualizada, versaoHub });

    if (desatualizada) {
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#e53935" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (e) {
    console.warn("[Revisor] Falha ao verificar atualização:", e?.message);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_REORDER_SECTION_TASKS") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = new URL(sender.url).origin;
      const url = `${baseUrl}/admin/course/v2/${encodeURIComponent(msg.courseId)}/section/${encodeURIComponent(msg.sectionId)}/tasks`;
      tabId = await openTab(url);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (orderedTaskIds) => {
          const tbody = document.querySelector("#tasks-table tbody");
          if (!tbody) return { ok: false, error: "#tasks-table tbody não encontrado" };

          const rows = [...tbody.querySelectorAll("tr")];

          // Mapeia cada linha ao ID da task (via input[name='sectionIds'] ou link de edição)
          const rowsWithId = rows.map(tr => {
            const id = tr.querySelector("input[name='sectionIds']")?.value
              || tr.querySelector("a[href*='/task/edit/']")?.href?.match(/\/task\/edit\/(\d+)/)?.[1]
              || "";
            return { tr, id };
          });

          const orderedSet = new Set(orderedTaskIds.map(String));

          // Primeiro: linhas na ordem desejada; depois: linhas restantes (categoria desconhecida)
          const ordered = orderedTaskIds
            .map(id => rowsWithId.find(r => r.id === String(id)))
            .filter(Boolean);
          const rest = rowsWithId.filter(r => !orderedSet.has(r.id));
          const sorted = [...ordered, ...rest];

          // Reinsere linhas na nova ordem
          for (const { tr } of sorted) tbody.appendChild(tr);

          const btn = document.querySelector("#button__submit");
          if (!btn) return { ok: false, error: "Botão 'Alterar ordem' não encontrado" };
          btn.click();

          return { ok: true };
        },
        args: [msg.orderedTaskIds || []]
      });

      const res = results?.[0]?.result;
      if (!res?.ok) {
        sendResponse({ ok: false, error: res?.error || "Erro desconhecido" });
        return;
      }

      // Aguarda o form POST recarregar a página
      await new Promise(r => setTimeout(r, 500));
      await waitForTabComplete(tabId, 10000);
      await UsageReport.queueFeatureUsageLog("activity_order_fixed", "section_tasks_reordered", msg, {
        sectionId: msg.sectionId,
        orderedTaskCount: Array.isArray(msg.orderedTaskIds) ? msg.orderedTaskIds.length : 0,
        autoFix: false,
      });

      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    }
  })();

  return true;
});

chrome.runtime.onInstalled.addListener(verificarAtualizacao);
chrome.runtime.onStartup.addListener(verificarAtualizacao);

// ---------- Desativar / Ativar atividade ----------
async function setTaskStatus(editUrl, status) {
  let tabId;
  try {
    tabId = await openTab(editUrl);

    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => !!document.getElementById("task.status")
      });
      if (res?.[0]?.result) { ready = true; break; }
    }

    if (!ready) return { ok: false, error: "Campo de status não encontrado." };

    await chrome.scripting.executeScript({
      target: { tabId },
      args: [status],
      func: (s) => {
        const sel = document.getElementById("task.status");
        if (!sel) return;
        sel.value = s;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelector("#submitTask, button[type='submit']")?.click();
      }
    });

    await new Promise(r => setTimeout(r, 1500));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    if (tabId != null) {
      await new Promise(r => setTimeout(r, 300));
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_DEACTIVATE_TASK" && msg?.type !== "ALURA_REVISOR_ACTIVATE_TASK") return;
  const status = msg.type === "ALURA_REVISOR_DEACTIVATE_TASK" ? "INACTIVE" : "ACTIVE";
  setTaskStatus(msg.editUrl, status).then(sendResponse);
  return true;
});

// ---------- Publicação: Faça como eu fiz ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_PUBLISH_FEZ_TASK") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = "https://cursos.alura.com.br";

      // 1. Busca seções e pega o sectionId da aula
      const sectionsUrl = `${baseUrl}/admin/courses/v2/${msg.courseId}/sections`;
      tabId = await openTab(sectionsUrl);

      let sections = [];
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 800));
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const rows = document.querySelectorAll("#sectionIds tbody tr");
            if (!rows.length) return null;
            return [...rows].map(tr => ({ id: tr.id, title: tr.cells[2]?.textContent?.trim() ?? "" })).filter(s => s.id);
          }
        });
        if (res?.[0]?.result?.length) { sections = res[0].result; break; }
      }

      const section = sections[msg.lessonNum - 1];
      if (!section?.id) { sendResponse({ ok: false, error: `Seção da Aula ${msg.lessonNum} não encontrada.` }); return; }

      // 2. Navegar para criação de atividade
      const createUrl = `${baseUrl}/admin/course/v2/${msg.courseId}/section/${section.id}/task/create`;
      await chrome.tabs.update(tabId, { url: createUrl });

      // Aguarda #chooseTask
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        const res = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!document.querySelector("#chooseTask") });
        if (res?.[0]?.result) break;
      }

      // 3. Seleciona "Faça como eu fiz na aula" (value="3")
      const clicked = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const option = document.querySelector('option[data-tag="DO_AFTER_ME"]');
          if (!option) return { ok: false, error: "opção não encontrada" };
          const select = option.closest("select");
          if (!select) return { ok: false, error: "select não encontrado" };
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return { ok: true };
        }
      });
      if (!clicked?.[0]?.result?.ok) { sendResponse({ ok: false, error: clicked?.[0]?.result?.error || "Erro ao selecionar tipo" }); return; }

      // 4. Aguarda formulário (campo título + editores)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => !!(document.querySelector("#task\\.title") && document.querySelector("#text .CodeMirror"))
        });
        if (res?.[0]?.result) break;
      }

      // 5. Preenche título
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const el = document.getElementById("task.title") || document.querySelector('input[name="title"]');
          if (el) { el.value = "Faça como eu fiz"; el.dispatchEvent(new Event("input", { bubbles: true })); }
        }
      });

      // 6. Função auxiliar: copia para clipboard e cola no CodeMirror indicado
      async function pasteIntoEditor(selector, content) {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: (sel, text) => {
            const cmEl = document.querySelector(sel);
            if (!cmEl?.CodeMirror) return false;
            const cm = cmEl.CodeMirror;

            // 1. Seta o conteúdo diretamente via API do CodeMirror
            cm.focus();
            cm.setValue(text);

            // 2. Sincroniza o textarea oculto do EasyMDE (fora do .CodeMirror)
            const hackeditor = cmEl.closest(".hackeditor");
            if (hackeditor) {
              const ta = hackeditor.querySelector("textarea.markdownEditor-source");
              if (ta) {
                ta.value = text;
                ta.dispatchEvent(new Event("input",  { bubbles: true }));
                ta.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
            return true;
          },
          args: [selector, content]
        });
        await new Promise(r => setTimeout(r, 400));
      }

      // Conteúdo → #text .CodeMirror
      await pasteIntoEditor("#text .CodeMirror", msg.content);

      // Opinião → #opinion .CodeMirror
      if (msg.opinion) {
        await pasteIntoEditor("#opinion .CodeMirror", msg.opinion);
      }

      // 7. Salva
      await new Promise(r => setTimeout(r, 400));
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => { document.querySelector("#submitTask")?.click(); }
      });

      // 8. Re-save na página de edição para garantir renderização do markdown
      await resaveAfterCreate(tabId, msg.courseId, section.id, "Faça como eu fiz");

      await UsageReport.queueFeatureUsageLog("activity_published", "do_after_me_published", msg, {
        lessonNum: msg.lessonNum,
        activityType: "FEZ",
      });
      sendResponse({ ok: true });

    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) { await new Promise(r => setTimeout(r, 500)); chrome.tabs.remove(tabId).catch(() => {}); }
    }
  })();

  return true;
});

// ---------- Publicação: Desafio ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_PUBLISH_DESAFIO_TASK") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = "https://cursos.alura.com.br";

      // 1. Abrir página de seções para descobrir o sectionId da aula
      const sectionsUrl = `${baseUrl}/admin/courses/v2/${msg.courseId}/sections`;
      tabId = await openTab(sectionsUrl);

      let sections = [];
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 800));
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const rows = document.querySelectorAll("#sectionIds tbody tr");
            if (!rows.length) return null;
            return [...rows].map(tr => ({
              id: tr.id,
              title: tr.cells[2]?.textContent?.trim() ?? "",
            })).filter(s => s.id);
          }
        });
        if (res?.[0]?.result?.length) { sections = res[0].result; break; }
      }

      const section = sections[msg.lessonNum - 1];
      if (!section?.id) {
        sendResponse({ ok: false, error: `Seção da Aula ${msg.lessonNum} não encontrada (total: ${sections.length}).` });
        return;
      }

      // 2. Navegar para a página de criação de atividade da seção
      const createUrl = `${baseUrl}/admin/course/v2/${msg.courseId}/section/${section.id}/task/create`;
      await chrome.tabs.update(tabId, { url: createUrl });

      // Aguardar #chooseTask
      let chooseReady = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => !!document.querySelector("#chooseTask")
        });
        if (res?.[0]?.result) { chooseReady = true; break; }
      }

      if (!chooseReady) {
        sendResponse({ ok: false, error: "Página de criação não carregou (#chooseTask)." });
        return;
      }

      // 3. Selecionar "Para saber mais" no <select> do #chooseTask
      const clicked = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const option = document.querySelector('option[data-title="Para saber mais"]');
          if (!option) return { ok: false, error: "option não encontrada" };

          const select = option.closest("select");
          if (!select) return { ok: false, error: "select não encontrado" };

          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));

          return { ok: true };
        }
      });

      if (!clicked?.[0]?.result?.ok) {
        sendResponse({ ok: false, error: `"Para saber mais" não encontrado. ${clicked?.[0]?.result?.error || ""}` });
        return;
      }

      // 4. Aguardar o formulário de criação carregar (nome + editor)
      let formReady = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => !!(document.querySelector("#submitTask") && document.querySelector(".CodeMirror, .hackeditor, [contenteditable='true']"))
        });
        if (res?.[0]?.result) { formReady = true; break; }
      }

      if (!formReady) {
        sendResponse({ ok: false, error: "Formulário de criação não carregou após selecionar 'Para saber mais'." });
        return;
      }

      // 5. Preencher o nome da atividade
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (name) => {
          const selectors = [
            'input[name="title"]', 'input[name="name"]', 'input[name="taskTitle"]',
            'input[placeholder*="ome"]', 'input[placeholder*="ítulo"]',
            '.form-group input[type="text"]'
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
              el.value = name;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              return sel;
            }
          }
          return null;
        },
        args: ["Hora do desafio!"]
      });

      // 6. Preencher o conteúdo no editor via foco + clipboard paste
      await new Promise(r => setTimeout(r, 400));
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (content) => {
          // Encontra o textarea interno do CodeMirror (onde o foco real fica)
          const cmEl = document.querySelector("#text .CodeMirror");

          if (cmEl?.CodeMirror) {
            const cm = cmEl.CodeMirror;
            cm.focus();
            cm.setValue(content);

            // Sincroniza textarea oculto do EasyMDE
            const hackeditor = cmEl.closest(".hackeditor");
            if (hackeditor) {
              const ta = hackeditor.querySelector("textarea.markdownEditor-source");
              if (ta) {
                ta.value = content;
                ta.dispatchEvent(new Event("input",  { bubbles: true }));
                ta.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
            return "codemirror-setvalue";
          }

          return null;
        },
        args: [msg.content]
      });

      // 7. Clicar em Salvar
      await new Promise(r => setTimeout(r, 500));
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const btn = document.querySelector("#submitTask");
          if (btn) { btn.click(); return true; }
          return false;
        }
      });

      // 8. Re-save na página de edição para garantir renderização do markdown
      await resaveAfterCreate(tabId, msg.courseId, section.id, "Hora do desafio!");

      await UsageReport.queueFeatureUsageLog("challenge_published", "challenge_published", msg, {
        lessonNum: msg.lessonNum,
      });
      sendResponse({ ok: true });

    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) {
        await new Promise(r => setTimeout(r, 500));
        chrome.tabs.remove(tabId).catch(() => {});
      }
    }
  })();

  return true;
});

// ---------- Publicação: atividade unificada (PREP/FEZ/PSM/GLOSSARIO) ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_PUBLISH_ACTIVITY") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = "https://cursos.alura.com.br";

      // Mapeamento de tipo → data-tag e título padrão
      const TYPE_MAP = {
        PREP:     { dataTag: "SETUP_EXPLANATION",        defaultTitle: "Preparando o ambiente" },
        FEZ:      { dataTag: "DO_AFTER_ME",              defaultTitle: "Faça como eu fiz" },
        PSM:      { dataTag: "COMPLEMENTARY_INFORMATION",defaultTitle: null },
        GLOSSARIO:{ dataTag: "COMPLEMENTARY_INFORMATION",defaultTitle: null },
      };
      const typeInfo = TYPE_MAP[msg.activityType];
      if (!typeInfo) { sendResponse({ ok: false, error: `Tipo desconhecido: ${msg.activityType}` }); return; }

      const activityTitle = typeInfo.defaultTitle || msg.activityName || "Atividade";

      // 1. Busca seções para obter sectionId da aula
      const sectionsUrl = `${baseUrl}/admin/courses/v2/${msg.courseId}/sections`;
      tabId = await openTab(sectionsUrl);

      let sections = [];
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 800));
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const rows = document.querySelectorAll("#sectionIds tbody tr");
            if (!rows.length) return null;
            return [...rows].map(tr => ({ id: tr.id, title: tr.cells[2]?.textContent?.trim() ?? "" })).filter(s => s.id);
          }
        });
        if (res?.[0]?.result?.length) { sections = res[0].result; break; }
      }

      const section = sections[msg.lessonNum - 1];
      if (!section?.id) {
        sendResponse({ ok: false, error: `Seção da Aula ${msg.lessonNum} não encontrada (total: ${sections.length}).` });
        return;
      }

      // 2. Navega para criação de atividade
      const createUrl = `${baseUrl}/admin/course/v2/${msg.courseId}/section/${section.id}/task/create`;
      await chrome.tabs.update(tabId, { url: createUrl });

      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        const res = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!document.querySelector("#chooseTask") });
        if (res?.[0]?.result) break;
      }

      // 3. Seleciona o tipo no #chooseTask
      const clicked = await chrome.scripting.executeScript({
        target: { tabId },
        func: (dataTag) => {
          const option = document.querySelector(`option[data-tag="${dataTag}"]`);
          if (!option) return { ok: false, error: `opção data-tag="${dataTag}" não encontrada` };
          const select = option.closest("select");
          if (!select) return { ok: false, error: "select não encontrado" };
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return { ok: true };
        },
        args: [typeInfo.dataTag]
      });
      if (!clicked?.[0]?.result?.ok) {
        sendResponse({ ok: false, error: clicked?.[0]?.result?.error || "Erro ao selecionar tipo" });
        return;
      }

      // 4. Aguarda formulário
      const needsOpinion = msg.activityType === "FEZ";
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: (withOpinion) => {
            const hasTitle = !!(document.getElementById("task.title") || document.querySelector('input[name="title"]'));
            const hasEditor = !!document.querySelector(".CodeMirror");
            const hasOpinion = !withOpinion || !!document.querySelector("#opinion .CodeMirror");
            return hasTitle && hasEditor && hasOpinion;
          },
          args: [needsOpinion]
        });
        if (res?.[0]?.result) break;
      }

      // 5. Preenche título
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (title) => {
          const el = document.getElementById("task.title") || document.querySelector('input[name="title"]');
          if (el) { el.value = title; el.dispatchEvent(new Event("input", { bubbles: true })); }
        },
        args: [activityTitle]
      });

      // 6. Função auxiliar: insere texto no CodeMirror do EasyMDE
      async function pasteIntoEditor(selector, text) {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: (sel, content) => {           // content é o texto recebido via args
            const cmEl = document.querySelector(sel);
            if (!cmEl?.CodeMirror) return false;
            const cm = cmEl.CodeMirror;
            cm.focus();
            cm.setValue(content);             // usa content, não text

            // Sincroniza o textarea oculto do EasyMDE
            const hackeditor = cmEl.closest(".hackeditor");
            if (hackeditor) {
              const ta = hackeditor.querySelector("textarea.markdownEditor-source");
              if (ta) {
                ta.value = content;           // usa content, não text
                ta.dispatchEvent(new Event("input",  { bubbles: true }));
                ta.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
            return true;
          },
          args: [selector, text]             // text do escopo externo → vira content no func
        });
        await new Promise(r => setTimeout(r, 400));
      }

      // Conteúdo → sempre #text .CodeMirror (FEZ também usa #text para conteúdo)
      const contentSelector = "#text .CodeMirror";
      await pasteIntoEditor(contentSelector, msg.content);

      // Opinião (somente FEZ)
      if (needsOpinion && msg.opinion) {
        await pasteIntoEditor("#opinion .CodeMirror", msg.opinion);
      }

      // 7. Salva
      await new Promise(r => setTimeout(r, 400));
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => { document.querySelector("#submitTask")?.click(); }
      });

      // 8. Re-save na página de edição para garantir renderização do markdown
      await resaveAfterCreate(tabId, msg.courseId, section.id, activityTitle);

      await UsageReport.queueFeatureUsageLog("activity_published", "activity_published", msg, {
        lessonNum: msg.lessonNum,
        activityType: msg.activityType,
        activityTitle,
      });
      sendResponse({ ok: true });

    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) { await new Promise(r => setTimeout(r, 500)); chrome.tabs.remove(tabId).catch(() => {}); }
    }
  })();

  return true;
});

// ---------- Exercícios: criar atividade ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isValidSender(sender)) return;
  if (msg?.type !== "ALURA_REVISOR_CREATE_EXERCICIO") return;

  (async () => {
    let tabId;
    try {
      const baseUrl = "https://cursos.alura.com.br";
      const { courseId, lessonNum, exercicio } = msg;

      const sectionsUrl = `${baseUrl}/admin/courses/v2/${courseId}/sections`;
      tabId = await openTab(sectionsUrl);

      let sections = [];
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 800));
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const rows = document.querySelectorAll("#sectionIds tbody tr");
            if (!rows.length) return null;
            return [...rows].map(tr => ({ id: tr.id, title: tr.cells[2]?.textContent?.trim() ?? "" })).filter(s => s.id);
          }
        });
        if (res?.[0]?.result?.length) { sections = res[0].result; break; }
      }

      const section = sections[lessonNum - 1];
      if (!section?.id) { sendResponse({ ok: false, error: `Seção Aula ${lessonNum} não encontrada (total: ${sections.length}).` }); return; }

      const createUrl = `${baseUrl}/admin/course/v2/${courseId}/section/${section.id}/task/create`;
      await chrome.tabs.update(tabId, { url: createUrl });

      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        const res = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!document.querySelector("#chooseTask") });
        if (res?.[0]?.result) break;
      }

      const taskEnum = exercicio.tipo === "ordenar" ? "SORT_BLOCKS" : "SINGLE_CHOICE";
      const selected = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (enumVal) => {
          const opt = document.querySelector(`#chooseTask option[data-task-enum="${enumVal}"]`);
          if (!opt) return { ok: false, error: `option[data-task-enum="${enumVal}"] não achado em #chooseTask` };
          const sel = document.getElementById("chooseTask");
          if (!sel) return { ok: false, error: "#chooseTask não encontrado" };

          // Marca a option, ajusta selectedIndex e value
          [...sel.options].forEach(o => o.selected = false);
          opt.selected = true;
          sel.selectedIndex = opt.index;

          // Dispara change nativo + jQuery (Alura usa jQuery)
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          sel.dispatchEvent(new Event("input",  { bubbles: true }));
          if (window.jQuery) {
            try { window.jQuery(sel).trigger("change"); } catch (e) {}
          }
          return { ok: true, selectedIndex: opt.index, enumFound: opt.dataset.taskEnum };
        },
        args: [taskEnum]
      });
      if (!selected?.[0]?.result?.ok) { sendResponse({ ok: false, error: selected?.[0]?.result?.error || "Erro ao selecionar tipo" }); return; }

      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => !!(document.getElementById("task.title") || document.querySelector('input[name="title"]'))
        });
        if (res?.[0]?.result) break;
      }

      // Aguarda o CodeMirror do enunciado inicializar
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 150));
        const res = await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: () => {
            const cm = document.querySelector("#text .CodeMirror") ||
                       document.querySelector("[id*='statement'] .CodeMirror") ||
                       document.querySelector(".CodeMirror");
            return !!cm?.CodeMirror;
          }
        });
        if (res?.[0]?.result) break;
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        func: (title) => {
          const el = document.getElementById("task.title") || document.querySelector('input[name="title"]');
          if (!el) return;
          el.value = title;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        },
        args: [exercicio.questNome]
      });

      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (text) => {
          const toHtml = (raw) => {
            const src = String(raw || "");
            const esc = (s) => s
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
            const lines = src.split("\n");
            const out = [];
            let i = 0;
            while (i < lines.length) {
              const line = lines[i].trimEnd();
              if (!line.trim()) { i++; continue; }
              if (line.trimStart().startsWith(">")) {
                const quote = [];
                while (i < lines.length && lines[i].trimStart().startsWith(">")) {
                  quote.push(lines[i].replace(/^\s*>\s?/, "").trimEnd());
                  i++;
                }
                out.push(`<blockquote>\n<p>${esc(quote.join("\n")).replace(/\n/g, "<br>")}</p>\n</blockquote>`);
                continue;
              }
              const para = [];
              while (i < lines.length && lines[i].trim()) {
                if (lines[i].trimStart().startsWith(">")) break;
                para.push(lines[i].trimEnd());
                i++;
              }
              out.push(`<p>${esc(para.join("\n")).replace(/\n/g, "<br>")}</p>`);
            }
            return out.join("\n");
          };
          const cmEl = document.querySelector("#text .CodeMirror") || document.querySelector("[id*='statement'] .CodeMirror") || document.querySelector(".CodeMirror");
          if (cmEl?.CodeMirror) {
            const cm = cmEl.CodeMirror;
            cm.focus();
            cm.setValue(text);
            cm.save();
            const hackeditor = cmEl.closest(".hackeditor");
            if (hackeditor) {
              const ta = hackeditor.querySelector("textarea.markdownEditor-source");
              if (ta) { ta.value = text; ta.dispatchEvent(new Event("input", { bubbles: true })); ta.dispatchEvent(new Event("change", { bubbles: true })); }
              const hidden = hackeditor.querySelector('input.hackeditor-sync[name="textHighlighted"], input.hackeditor-sync');
              if (hidden) {
                hidden.value = toHtml(text);
                hidden.dispatchEvent(new Event("input", { bubbles: true }));
                hidden.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
            return true;
          }
          const fallback = document.querySelector('textarea[name="text"], textarea[name="statement"], textarea[name="enunciado"], input[name="text"], input[name="statement"], input[name="enunciado"]');
          if (!fallback) return false;
          fallback.value = text;
          fallback.dispatchEvent(new Event("input", { bubbles: true }));
          fallback.dispatchEvent(new Event("change", { bubbles: true }));
          const highlighted = document.querySelector('input[name="textHighlighted"]');
          if (highlighted) {
            highlighted.value = toHtml(text);
            highlighted.dispatchEvent(new Event("input", { bubbles: true }));
            highlighted.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return true;
        },
        args: [exercicio.enunciado || ""]
      });
      await new Promise(r => setTimeout(r, 400));

      let feedbackDebug = null;
      if (exercicio.tipo !== "ordenar" && exercicio.alts?.length) {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: (alts, correctAlt) => {
            const toHtml = (raw) => {
              const text = String(raw || "");
              const esc = (s) => s
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
              const parts = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
              if (!parts.length) return "";
              return parts.map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n");
            };
            const setField = (sel, value) => {
              const el = document.querySelector(sel);
              if (!el) return false;
              el.value = value;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              return true;
            };
            const setMarkdownEditor = (i, field, value) => {
              const root = document.querySelector(`#alternatives-${i}-${field}`);
              const cmEl = root?.querySelector(".CodeMirror");
              if (cmEl?.CodeMirror) {
                const cm = cmEl.CodeMirror;
                cm.focus();
                cm.setValue(value);
                cm.save();
                const input = cm.getInputField ? cm.getInputField() : (cm.display?.input?.getField?.() || cm.display?.input?.textarea);
                if (input) input.focus();
              }
              setField(`textarea[name="alternatives[${i}].${field}"]`, value);
              setField(`input[name="alternatives[${i}].${field}Highlighted"]`, toHtml(value));
            };

            const current = document.querySelectorAll('textarea[name^="alternatives["][name$=".text"]').length;
            const needed = Math.max(0, alts.length - current);
            for (let j = 0; j < needed; j++) {
              const btn = document.querySelector('input.add-alternative[data-type="emptySingleAlternative"], .add-alternative[data-type="emptySingleAlternative"]');
              btn?.click();
            }

            alts.forEach((alt, i) => {
              const text = alt?.text || "";
              const opinion = alt?.opinion || "";
              setMarkdownEditor(i, "text", text);
              setMarkdownEditor(i, "opinion", opinion);
              const radio = document.querySelector(`input.fieldGroup-alternative-actions-correct[name="alternatives[${i}].correct"]`);
              const isCorrect = !!correctAlt && String(correctAlt).toUpperCase() === String(alt?.letter || "").toUpperCase();
              if (radio) {
                radio.checked = isCorrect;
                if (isCorrect) radio.click();
              }
            });
            return { totalAlts: alts.length, current };
          },
          args: [exercicio.alts, exercicio.correctAlt || ""]
        });
        await new Promise(r => setTimeout(r, 600));
      }

      if (exercicio.tipo === "ordenar" && exercicio.blocks?.length) {
        for (let bi = 0; bi < exercicio.blocks.length; bi++) {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const btn = document.querySelector('.add-block[data-type="emptySortBlocksBlock"]') ||
                          document.querySelector('input[value="Adicionar bloco"]') ||
                          document.querySelector(".btn.add-block");
              btn?.click();
              return !!btn;
            }
          });
          await new Promise(r => setTimeout(r, 500));
        }

        // Preenche blocks[N].text e marca blocks[N].partOfSolution em todos
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: (blocks) => {
            function fillBlockText(i, text) {
              const cmEl = document.querySelector(`#blocks\\.${i}\\.text + .CodeMirror`) ||
                           document.querySelector(`#blocks\\.${i}\\.text ~ .CodeMirror`) ||
                           document.querySelector(`[id="blocks.${i}.text"] + .CodeMirror`) ||
                           document.querySelector(`[id="blocks.${i}.text"] ~ .CodeMirror`) ||
                           document.querySelector(`textarea[name="blocks[${i}].text"] + .CodeMirror`) ||
                           document.querySelector(`textarea[name="blocks[${i}].text"] ~ .CodeMirror`);
              if (cmEl?.CodeMirror) {
                cmEl.CodeMirror.focus();
                cmEl.CodeMirror.setValue(text);
                const hackeditor = cmEl.closest(".hackeditor");
                if (hackeditor) {
                  const ta = hackeditor.querySelector("textarea.markdownEditor-source");
                  if (ta) {
                    ta.value = text;
                    ta.dispatchEvent(new Event("input", { bubbles: true }));
                    ta.dispatchEvent(new Event("change", { bubbles: true }));
                  }
                }
                return true;
              }
              const input = document.querySelector(`textarea[name="blocks[${i}].text"], input[name="blocks[${i}].text"]`);
              if (!input) return false;
              input.value = text;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
              return true;
            }

            const checkboxes = [...document.querySelectorAll('input[name^="blocks["][name$=".partOfSolution"]')];
            let filledTexts = 0;
            blocks.forEach((block, i) => {
              const text = typeof block === "string" ? block : (block?.text || "");
              const shouldCheck = typeof block === "string" ? true : !!block?.partOfSolution;

              if (fillBlockText(i, text)) {
                filledTexts++;
              }
              if (checkboxes[i] && checkboxes[i].checked !== shouldCheck) checkboxes[i].click();
            });
            return { filledTexts, checkboxes: checkboxes.length };
          },
          args: [exercicio.blocks]
        });
        await new Promise(r => setTimeout(r, 400));

        // Preenche feedback (Resposta correta / Resposta incorreta)
        const feedbackFillRes = await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: (correct, incorrect) => {
            const toHtml = (raw) => {
              const text = String(raw || "");
              const esc = (s) => s
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
              const parts = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
              if (!parts.length) return "";
              return parts.map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n");
            };
            function fillCM(cmEl, text) {
              if (!cmEl?.CodeMirror) return false;
              const cm = cmEl.CodeMirror;
              // Força foco real no input interno para ativar estado CodeMirror-focused
              cm.focus();
              try {
                const input = cm.getInputField ? cm.getInputField() : (cm.display?.input?.getField?.() || cm.display?.input?.textarea);
                if (input) {
                  input.focus();
                  input.dispatchEvent(new Event("focus", { bubbles: true }));
                }
                cm.getWrapperElement()?.classList.add("CodeMirror-focused");
              } catch (_) {}
              cm.setValue(text);
              cm.save();
              cm.getWrapperElement()?.dispatchEvent(new Event("input", { bubbles: true }));
              cm.getWrapperElement()?.dispatchEvent(new Event("change", { bubbles: true }));
              const hackeditor = cmEl.closest(".hackeditor");
              if (hackeditor) {
                const ta = hackeditor.querySelector("textarea.markdownEditor-source");
                if (ta) { ta.value = text; ta.dispatchEvent(new Event("input", { bubbles: true })); ta.dispatchEvent(new Event("change", { bubbles: true })); }
                const hidden = hackeditor.querySelector("input.hackeditor-sync");
                if (hidden) {
                  hidden.value = toHtml(text);
                  hidden.dispatchEvent(new Event("input", { bubbles: true }));
                  hidden.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }
              return true;
            }
            function fillByRoot(rootSel, text) {
              const root = document.querySelector(rootSel);
              if (!root) return false;
              const cmEl = root.querySelector(".CodeMirror");
              if (fillCM(cmEl, text)) return true;
              const plain = root.querySelector("textarea, input");
              if (plain) {
                plain.value = text;
                plain.dispatchEvent(new Event("input", { bubbles: true }));
                plain.dispatchEvent(new Event("change", { bubbles: true }));
                return true;
              }
              return false;
            }
            function fillByName(names, text) {
              for (const n of names) {
                const el = document.querySelector(`textarea[name="${n}"], input[name="${n}"], input[type="hidden"][name="${n}"]`);
                if (el) {
                  const isHighlighted = /highlighted/i.test(n) || el.type === "hidden";
                  el.value = isHighlighted ? toHtml(text) : text;
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  return true;
                }
              }
              return false;
            }
            const correctCM   = document.querySelector("#opinion .CodeMirror, #correctFeedback .CodeMirror, #successFeedback .CodeMirror, [id*='opinion'] .CodeMirror, [id*='correct'] .CodeMirror, [id*='success'] .CodeMirror");
            const incorrectCM = document.querySelector("#wrongOpinion .CodeMirror, #incorrectFeedback .CodeMirror, #failureFeedback .CodeMirror, [id*='wrongOpinion'] .CodeMirror, [id*='incorrect'] .CodeMirror, [id*='failure'] .CodeMirror");
            const correctNames   = ["opinion","opinionHighlighted","correctFeedback","successFeedback","correct_feedback","correctMessage","hit","answerFeedback","rightFeedback","feedbackRight"];
            const incorrectNames = ["wrongOpinion","wrongOpinionHighlighted","incorrectFeedback","failureFeedback","incorrect_feedback","incorrectMessage","miss","wrongFeedback","feedbackWrong","errorFeedback"];
            const rC = fillByRoot("#opinion", correct) || fillCM(correctCM, correct) || fillByName(correctNames, correct);
            const rI = fillByRoot("#wrongOpinion", incorrect) || fillCM(incorrectCM, incorrect) || fillByName(incorrectNames, incorrect);
            return { rC, rI, correctLen: (correct || "").length, incorrectLen: (incorrect || "").length };
          },
          args: [exercicio.respostaCorreta, exercicio.respostaIncorreta]
        });
        feedbackDebug = feedbackFillRes?.[0]?.result || null;

        const feedbackReadRes = await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: () => {
            const getCm = (sel) => {
              const cmEl = document.querySelector(sel);
              if (!cmEl?.CodeMirror) return null;
              const v = cmEl.CodeMirror.getValue() || "";
              return { len: v.length, sample: v.slice(0, 80) };
            };
            const getVal = (sel) => {
              const el = document.querySelector(sel);
              if (!el) return null;
              const v = el.value || "";
              return { len: v.length, sample: v.slice(0, 80) };
            };
            return {
              cmOpinion: getCm("#opinion .CodeMirror"),
              cmWrongOpinion: getCm("#wrongOpinion .CodeMirror"),
              taOpinion: getVal('textarea[name="opinion"]'),
              taWrongOpinion: getVal('textarea[name="wrongOpinion"]'),
              hiddenOpinion: getVal('input[name="opinionHighlighted"], input[name="opinion"]'),
              hiddenWrongOpinion: getVal('input[name="wrongOpinionHighlighted"], input[name="wrongOpinion"]'),
            };
          }
        });
        feedbackDebug = {
          ...(feedbackDebug || {}),
          readback: feedbackReadRes?.[0]?.result || null
        };
        await new Promise(r => setTimeout(r, 400));
      }

      // Múltipla/Única escolha: clica "Adicionar alternativa" N vezes, preenche e marca a correta
      if (exercicio.tipo === "multipla" && exercicio.alts?.length) {
        // Espera o botão "Adicionar alternativa" aparecer
        for (let i = 0; i < 15; i++) {
          const r = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => !!document.querySelector('.add-alternative')
          });
          if (r?.[0]?.result) break;
          await new Promise(r => setTimeout(r, 150));
        }
        // Clica "Adicionar alternativa" via jQuery (mesmo contexto dos handlers da Alura)
        const targetCount = exercicio.alts.length;
        for (let attempt = 0; attempt < targetCount + 5; attempt++) {
          const countRes = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const container = document.getElementById("alternatives");
              if (!container) return 0;
              return container.querySelectorAll(":scope > .fieldGroup-alternative").length;
            }
          });
          const current = countRes?.[0]?.result || 0;
          if (current >= targetCount) break;
          await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: () => {
              const $btn = window.jQuery?.('.add-alternative[data-type="emptySingleAlternative"]');
              if ($btn && $btn.length) {
                $btn.trigger("click");
                return "jquery";
              }
              const btn = document.querySelector('.add-alternative[data-type="emptySingleAlternative"]') ||
                          document.querySelector('.add-alternative');
              btn?.click();
              return btn ? "native" : "none";
            }
          });
          await new Promise(r => setTimeout(r, 500));
        }
        await new Promise(r => setTimeout(r, 200));

        // Preenche texto + opinion de cada alternativa e marca a correta
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "MAIN",
          func: (alts, correctLetter) => {
            const letters = ["A","B","C","D","E"];
            const toHtml = (raw) => {
              const text = String(raw || "");
              const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              const parts = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
              if (!parts.length) return "";
              return parts.map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n");
            };

            function fillByName(textareaName, hiddenName, text) {
              const ta = document.querySelector(`textarea[name="${textareaName}"]`);
              if (!ta) return false;
              // Acha o .hackeditor/.markdownEditor ancestral e o CodeMirror dentro
              const editor = ta.closest(".markdownEditor") || ta.closest(".hackeditor") || ta.parentElement;
              const cmEl = editor?.querySelector(".CodeMirror");
              if (cmEl?.CodeMirror) {
                cmEl.CodeMirror.focus();
                cmEl.CodeMirror.setValue(text);
                cmEl.CodeMirror.save();
              }
              ta.value = text;
              ta.dispatchEvent(new Event("input", { bubbles: true }));
              ta.dispatchEvent(new Event("change", { bubbles: true }));
              const hidden = document.querySelector(`input.hackeditor-sync[name="${hiddenName}"]`);
              if (hidden) {
                hidden.value = toHtml(text);
                hidden.dispatchEvent(new Event("input", { bubbles: true }));
                hidden.dispatchEvent(new Event("change", { bubbles: true }));
              }
              return true;
            }

            let filled = 0, opinions = 0;
            alts.forEach((alt, i) => {
              if (fillByName(`alternatives[${i}].text`, `alternatives[${i}].textHighlighted`, alt.text || "")) filled++;
              if (fillByName(`alternatives[${i}].opinion`, `alternatives[${i}].opinionHighlighted`, alt.opinion || "")) opinions++;
            });

            // Marca a alternativa correta via radio input[name="alternatives[N].correct"]
            const correctIdx = letters.indexOf((correctLetter || "").toUpperCase());
            let radioMarked = false;
            if (correctIdx >= 0) {
              const radio = document.querySelector(`input[type="radio"][name="alternatives[${correctIdx}].correct"]`);
              if (radio && !radio.checked) {
                radio.click();
                radioMarked = true;
              }
            }
            return { filled, opinions, correctIdx, radioMarked, total: alts.length };
          },
          args: [exercicio.alts, exercicio.correctAlt]
        });
        await new Promise(r => setTimeout(r, 800));
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (correct, incorrect) => {
          const toHtml = (raw) => {
            const text = String(raw || "");
            const esc = (s) => s
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
            const parts = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
            if (!parts.length) return "";
            return parts.map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n");
          };
          const setVal = (sel, v) => {
            const el = document.querySelector(sel);
            if (!el) return;
            el.value = v;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
          };
          setVal('input[name="opinionHighlighted"]', toHtml(correct));
          setVal('input[name="wrongOpinionHighlighted"]', toHtml(incorrect));
          setVal('textarea[name="opinion"]', correct);
          setVal('textarea[name="wrongOpinion"]', incorrect);
        },
        args: [exercicio.respostaCorreta || "", exercicio.respostaIncorreta || ""]
      });
      await new Promise(r => setTimeout(r, 1000));

      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => { document.querySelector("#submitTask")?.click(); }
      });
      await new Promise(r => setTimeout(r, 2500));
      await UsageReport.queueFeatureUsageLog("exercise_created", "exercise_created", msg, {
        lessonNum,
        exerciseType: exercicio?.tipo || "",
        exerciseTitle: exercicio?.questNome || "",
      });
      sendResponse({ ok: true, debugFeedback: feedbackDebug || null });

    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    } finally {
      if (tabId != null) { await new Promise(r => setTimeout(r, 500)); chrome.tabs.remove(tabId).catch(() => {}); }
    }
  })();

  return true;
});
