(() => {
  const USAGE_LOG_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw5YVSPvbk6ide40TKoWsZVcxI5QE1gr9pBG2avgLcWALjDejxG8g8ruxsSrQTbHHk/exec";
  const USAGE_LOG_TIMEOUT_MS = 15000;
  const USAGE_LOG_QUEUE_KEY = "aluraRevisorUsageLogQueue";
  const USAGE_LOG_MAX_QUEUE = 500;

  const FEATURES = Object.freeze({
    R2_MATERIAL_UPLOAD: "r2_material_upload",
    ASSESSMENT_PUBLISHED: "assessment_published",
    ACTIVITY_PUBLISHED: "activity_published",
    ACTIVITY_DEACTIVATED: "activity_deactivated",
    EXERCISE_CREATED: "exercise_created",
    CHALLENGE_PUBLISHED: "challenge_published",
    UNIT_REVIEW_COMPLETED: "unit_review_completed",
    CAPTION_GENERATION: "caption_generation",
    ICON_UPLOADED: "icon_uploaded",
    ACTIVITY_ORDER_FIXED: "activity_order_fixed",
  });

  function sanitizeUsageMetadata(metadata) {
    if (!metadata || typeof metadata !== "object") return {};
    try {
      return JSON.parse(JSON.stringify(metadata));
    } catch (_) {
      return { serializationError: true };
    }
  }

  function normalizeUsageLogEntry(entry) {
    const count = Number(entry?.count || 0);
    const metadata = sanitizeUsageMetadata(entry?.metadata);
    return {
      timestamp: entry?.timestamp || new Date().toISOString(),
      eventType: String(entry?.eventType || "feature_usage").trim(),
      feature: String(entry?.feature || FEATURES.CAPTION_GENERATION).trim(),
      action: String(entry?.action || "used").trim(),
      courseId: String(entry?.courseId || "").trim(),
      courseName: String(entry?.courseName || "").trim(),
      count: Number.isFinite(count) && count > 0 ? count : 0,
      metadata,
      metadataJson: JSON.stringify(metadata),
    };
  }

  function normalizeCaptionLogEntry(entry) {
    return normalizeUsageLogEntry({
      ...entry,
      eventType: entry?.eventType || "feature_usage",
      feature: entry?.feature || FEATURES.CAPTION_GENERATION,
      action: entry?.action || "requested",
    });
  }

  async function getQueuedUsageLogs() {
    const data = await chrome.storage.local.get([USAGE_LOG_QUEUE_KEY]);
    return Array.isArray(data?.[USAGE_LOG_QUEUE_KEY]) ? data[USAGE_LOG_QUEUE_KEY] : [];
  }

  async function setQueuedUsageLogs(entries) {
    await chrome.storage.local.set({
      [USAGE_LOG_QUEUE_KEY]: entries.slice(-USAGE_LOG_MAX_QUEUE),
    });
  }

  let usageLogStoragePromise = Promise.resolve();
  function runUsageLogStorageOperation(operation) {
    const run = usageLogStoragePromise.then(operation, operation);
    usageLogStoragePromise = run.catch(() => {});
    return run;
  }

  function appendQueuedUsageLog(entry) {
    const data = normalizeUsageLogEntry(entry);
    if (!data.feature || data.count <= 0) {
      return Promise.resolve({ ok: false, skipped: true, error: "Usage log entry missing feature or count" });
    }

    const queued = {
      ...data,
      queuedAt: new Date().toISOString(),
      attempts: Number(entry?.attempts || 0),
      lastError: entry?.lastError || "",
    };

    return runUsageLogStorageOperation(async () => {
      const pending = await getQueuedUsageLogs();
      pending.push(queued);
      await setQueuedUsageLogs(pending);
      return { ok: true, queued: true, feature: data.feature, courseId: data.courseId, count: data.count };
    });
  }

  async function fetchWithTimeoutLocal(url, options = {}, timeoutMs = USAGE_LOG_TIMEOUT_MS) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        redirect: "follow",
        cache: "no-store",
      });
    } finally {
      clearTimeout(t);
    }
  }

  async function postUsageLogEntry(entry) {
    const data = normalizeUsageLogEntry(entry);
    if (!data.feature || data.count <= 0) {
      return { ok: false, skipped: true, error: "Usage log entry missing feature or count" };
    }

    const response = await fetchWithTimeoutLocal(
      USAGE_LOG_WEB_APP_URL,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(data),
      },
      USAGE_LOG_TIMEOUT_MS
    );

    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(`Apps Script returned HTTP ${response.status}`);
    }

    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed?.ok === false) throw new Error(parsed?.error || "Apps Script rejected the log entry");
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(`Apps Script returned non-JSON: ${text.slice(0, 200)}`);
        throw e;
      }
    } else {
      throw new Error("Apps Script returned empty response");
    }

    return { ok: true, feature: data.feature, courseId: data.courseId, count: data.count };
  }

  let usageLogFlushPromise = null;
  async function flushQueuedUsageLogs() {
    if (usageLogFlushPromise) return usageLogFlushPromise;

    usageLogFlushPromise = runUsageLogStorageOperation(async () => {
      const pending = await getQueuedUsageLogs();
      if (pending.length === 0) return { ok: true, logged: 0, failed: [] };

      const remaining = [];
      const results = [];

      for (const entry of pending) {
        const data = normalizeUsageLogEntry(entry);
        if (!data.feature || data.count <= 0) continue;

        try {
          results.push(await postUsageLogEntry(data));
        } catch (e) {
          const error = e?.message || String(e);
          remaining.push({
            ...data,
            queuedAt: entry.queuedAt || new Date().toISOString(),
            attempts: Number(entry.attempts || 0) + 1,
            lastError: error,
          });
          results.push({ ok: false, feature: data.feature, courseId: data.courseId, error });
        }
      }

      await setQueuedUsageLogs(remaining);
      const failed = results.filter(r => !r.ok);
      return { ok: failed.length === 0, logged: results.length - failed.length, failed, queued: remaining.length };
    });

    try {
      return await usageLogFlushPromise;
    } finally {
      usageLogFlushPromise = null;
    }
  }

  async function recordUsageLogEntry(entry) {
    const queued = await appendQueuedUsageLog(entry);
    if (!queued?.ok) return queued;

    try {
      const flushed = await flushQueuedUsageLogs();
      return { ok: flushed.ok, queued: !flushed.ok, logged: flushed.logged, failed: flushed.failed };
    } catch (e) {
      return { ok: false, queued: true, error: e?.message || String(e) };
    }
  }

  async function queueUsageLogEntry(entry) {
    const queued = await appendQueuedUsageLog(entry);
    if (queued?.ok) flushQueuedUsageLogs().catch(() => {});
    return queued;
  }

  function buildFeatureUsageLogEntry(feature, action, msg = {}, metadata = {}) {
    return normalizeUsageLogEntry({
      timestamp: new Date().toISOString(),
      eventType: "feature_usage",
      feature,
      action,
      courseId: msg.courseId || metadata.courseId || "",
      courseName: msg.courseName || metadata.courseName || "",
      count: msg.count || metadata.count || 1,
      metadata: {
        ...metadata,
        sourceMessage: msg.type || "",
      },
    });
  }

  async function queueFeatureUsageLog(feature, action, msg = {}, metadata = {}) {
    return queueUsageLogEntry(buildFeatureUsageLogEntry(feature, action, msg, metadata));
  }

  function buildCaptionUsageLogEntry(msg) {
    const ctx = msg?.logContext || {};
    return normalizeCaptionLogEntry({
      timestamp: new Date().toISOString(),
      courseId: ctx.courseId || msg?.courseId || "",
      courseName: ctx.courseName || msg?.courseName || "",
      count: 1,
      metadata: {
        taskId: ctx.taskId || "",
        taskTitle: ctx.taskTitle || "",
        sectionTitle: ctx.sectionTitle || "",
        uploaderCode: msg?.uploaderCode || "",
        source: ctx.source || "video_info",
      },
    });
  }

  function summarizeUsageEvents(entries = []) {
    const events = entries.map(normalizeUsageLogEntry).filter(e => e.feature && e.count > 0);
    const byFeature = {};
    const byCourse = {};

    for (const event of events) {
      byFeature[event.feature] ||= { feature: event.feature, count: 0, actions: {} };
      byFeature[event.feature].count += event.count;
      byFeature[event.feature].actions[event.action] = (byFeature[event.feature].actions[event.action] || 0) + event.count;

      const courseKey = event.courseId || "sem-curso";
      byCourse[courseKey] ||= { courseId: event.courseId, courseName: event.courseName, count: 0, features: {} };
      byCourse[courseKey].count += event.count;
      byCourse[courseKey].features[event.feature] = (byCourse[courseKey].features[event.feature] || 0) + event.count;
    }

    return {
      totalEvents: events.length,
      totalCount: events.reduce((sum, event) => sum + event.count, 0),
      byFeature: Object.values(byFeature),
      byCourse: Object.values(byCourse),
    };
  }

  function buildProductivityReport(entries = []) {
    const events = entries.map(normalizeUsageLogEntry).filter(e => e.feature && e.count > 0);
    return {
      generatedAt: new Date().toISOString(),
      summary: summarizeUsageEvents(events),
      events,
    };
  }

  self.UsageReport = {
    FEATURES,
    normalizeUsageLogEntry,
    normalizeCaptionLogEntry,
    queueUsageLogEntry,
    recordUsageLogEntry,
    flushQueuedUsageLogs,
    buildFeatureUsageLogEntry,
    queueFeatureUsageLog,
    buildCaptionUsageLogEntry,
    summarizeUsageEvents,
    buildProductivityReport,
  };
})();
