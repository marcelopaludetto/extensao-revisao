(function () {
  const PANEL_ID    = "alura-revisor-guia-panel-root";
  const HIDDEN_KEY  = "aluraRevisorGuiaPanelHidden";
  const COLLAPSED_KEY = "aluraRevisorGuiaPanelCollapsed";
  const PANEL_WIDTH = 490;

  if (window.top !== window.self) return;
  if (document.getElementById(PANEL_ID)) return;

  let rootEl = null;

  function setHidden(v) {
    if (!rootEl) return;
    rootEl.style.display = v ? "none" : "flex";
    try { chrome.storage.local.set({ [HIDDEN_KEY]: v }); } catch (_) {}
  }

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "ALURA_REVISOR_TOGGLE_PANEL") {
        if (!rootEl) return;
        const hidden = rootEl.style.display === "none";
        setHidden(!hidden);
      }
    });
  } catch (_) {}

  function injectPanel() {
    const root = document.createElement("div");
    root.id = PANEL_ID;
    root.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      width: ${PANEL_WIDTH}px;
      height: calc(100vh - 32px);
      background: #f0f4f8;
      border: 1px solid #d0d7de;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25);
      z-index: 2147483646;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: 'Cascadia Code','Fira Code','Consolas',monospace;
      transition: width 0.2s ease, height 0.2s ease;
    `;

    const bar = document.createElement("div");
    bar.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: #0d1117;
      color: #50DEFF;
      font-size: 12px;
      font-weight: 700;
      cursor: move;
      user-select: none;
      flex-shrink: 0;
    `;
    bar.innerHTML = `
      <span style="letter-spacing:0.5px;">Start <span style="color:#f0f4f8;">Revisor</span></span>
      <div style="display:flex;gap:6px;">
        <button id="arp-guia-toggle" title="Recolher/Expandir" style="background:transparent;border:1px solid #50DEFF;color:#50DEFF;border-radius:4px;padding:2px 8px;font-family:inherit;font-size:11px;cursor:pointer;">–</button>
        <button id="arp-guia-close" title="Fechar (reabrir pelo ícone da extensão)" style="background:transparent;border:1px solid #CA3328;color:#CA3328;border-radius:4px;padding:2px 8px;font-family:inherit;font-size:11px;cursor:pointer;">×</button>
      </div>
    `;

    const iframe = document.createElement("iframe");
    iframe.id = "arp-guia-iframe";
    iframe.src = chrome.runtime.getURL("popup.html") + "#guia";
    iframe.allow = "clipboard-write";
    iframe.style.cssText = `
      border: 0;
      width: 100%;
      height: 100%;
      background: #f0f4f8;
      flex: 1;
      min-height: 0;
    `;

    root.appendChild(bar);
    root.appendChild(iframe);
    document.body.appendChild(root);
    rootEl = root;

    try {
      chrome.storage.local.get(HIDDEN_KEY, (data) => {
        if (data && data[HIDDEN_KEY]) setHidden(true);
      });
    } catch (_) {}

    bar.querySelector("#arp-guia-close").addEventListener("click", (e) => {
      e.stopPropagation();
      setHidden(true);
    });

    let collapsed = false;
    const toggleBtn = bar.querySelector("#arp-guia-toggle");

    function applyCollapsed(v) {
      collapsed = v;
      iframe.style.display = v ? "none" : "block";
      toggleBtn.textContent = v ? "+" : "–";
      root.style.width = v ? "auto" : PANEL_WIDTH + "px";
      root.style.height = v ? "auto" : "calc(100vh - 32px)";
      try { chrome.storage.local.set({ [COLLAPSED_KEY]: v }); } catch (_) {}
    }

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyCollapsed(!collapsed);
    });

    try {
      chrome.storage.local.get(COLLAPSED_KEY, (data) => {
        if (data && data[COLLAPSED_KEY]) applyCollapsed(true);
      });
    } catch (_) {}

    // Drag
    let dragging = false, offX = 0, offY = 0;
    bar.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      const rect = root.getBoundingClientRect();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
      root.style.transition = "none";
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(window.innerWidth - 40, e.clientX - offX));
      const y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offY));
      root.style.left = x + "px";
      root.style.top  = y + "px";
      root.style.right = "auto";
    });
    document.addEventListener("mouseup", () => {
      if (dragging) {
        dragging = false;
        root.style.transition = "";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectPanel);
  } else {
    injectPanel();
  }
})();
