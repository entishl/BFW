(function () {
  "use strict";

  const TOAST_ID = "bfw-toast";
  const OVERLAY_ID = "bfw-overlay";
  const ROUTE_EVENT = "bfw-route-change";
  const DEBUG = false;

  const platform = window.CyberBuddyBilibili;
  let runId = 0;
  let currentVideoId = "";
  let activeAnalysisVideoId = "";
  let completedVideoId = "";
  let routeTimer = null;
  let lastObservedUrl = location.href;
  const waivedVideoIds = new Set();

  if (!platform) {
    return;
  }

  installRouteWatcher();
  scheduleRouteCheck(0);

  function installRouteWatcher() {
    ["pushState", "replaceState"].forEach(function (methodName) {
      const original = history[methodName];
      history[methodName] = function () {
        const result = original.apply(this, arguments);
        window.dispatchEvent(new Event(ROUTE_EVENT));
        return result;
      };
    });

    window.addEventListener("popstate", function () {
      window.dispatchEvent(new Event(ROUTE_EVENT));
    });

    window.addEventListener(ROUTE_EVENT, function () {
      scheduleRouteCheck(300);
    });

    const titleObserver = new MutationObserver(function () {
      scheduleRouteCheck(400);
    });
    const titleNode = document.querySelector("title");
    if (titleNode) {
      titleObserver.observe(titleNode, { childList: true });
    }

    setInterval(function () {
      if (location.href !== lastObservedUrl) {
        lastObservedUrl = location.href;
        scheduleRouteCheck(300);
      }
    }, 1000);
  }

  function scheduleRouteCheck(delayMs) {
    clearTimeout(routeTimer);
    routeTimer = setTimeout(function () {
      handleRouteChange().catch(logError);
    }, delayMs);
  }

  async function handleRouteChange() {
    if (!platform.matchesVideoPage(location.href)) {
      currentVideoId = "";
      activeAnalysisVideoId = "";
      completedVideoId = "";
      runId += 1;
      cleanupUi();
      return;
    }

    const videoId = platform.extractVideoId(location.href);
    if (!videoId) {
      return;
    }

    if (
      videoId === currentVideoId &&
      (
        activeAnalysisVideoId === videoId ||
        completedVideoId === videoId ||
        document.getElementById(OVERLAY_ID)
      )
    ) {
      return;
    }

    if (videoId !== currentVideoId) {
      completedVideoId = "";
    }

    currentVideoId = videoId;
    runId += 1;
    const thisRun = runId;
    cleanupUi();

    if (waivedVideoIds.has(videoId)) {
      return;
    }

    const settingsResult = await sendMessage({ type: "GET_SETTINGS" });
    if (!isRunCurrent(thisRun, videoId) || !settingsResult || !settingsResult.ok) {
      return;
    }

    const settings = settingsResult.settings || {};

    const isEnabled = settings.enabled !== false;
    const hasBlockedCategory = Array.isArray(settings.categories) && settings.categories.some(function (c) {
      return c.blocked;
    });

    if (!isEnabled || !hasBlockedCategory) {
      showToast("BFW 当前未激活");
      setTimeout(hideToast, 2000);
      return;
    }

    if (!shouldAnalyze(settings)) {
      return;
    }

    showToast("BFW 正在检测该网页大致内容...");
    activeAnalysisVideoId = videoId;

    try {
      const pageData = await platform.collectPageData(settings.timeouts && settings.timeouts.comment);
      if (!isRunCurrent(thisRun, videoId)) {
        return;
      }

      const result = await sendMessage({
        type: "ANALYZE_VIDEO",
        payload: {
          platform: "bilibili",
          videoId,
          pageData
        }
      });

      if (!isRunCurrent(thisRun, videoId)) {
        return;
      }

      completedVideoId = videoId;
      hideToast();
      handleAnalyzeResult(videoId, result || {});
    } finally {
      if (activeAnalysisVideoId === videoId) {
        activeAnalysisVideoId = "";
      }
    }
  }

  function handleAnalyzeResult(videoId, result) {
    if (result.status === "PASS") {
      cleanupUi();
      return;
    }

    if (result.status === "BLOCKED") {
      pauseVideo();
      showOverlay({
        videoId,
        title: "先停一下",
        reason: result.reason || "这个视频可能会消耗你的注意力。",
        categories: result.categories || [],
        isFailSafe: false
      });
      return;
    }

    pauseVideo();
    showOverlay({
      videoId,
      title: "BFW 罢工中",
      reason: result.reason || result.message || "这个视频是不是真的有必要看，请你自己决定。",
      categories: result.categories || [],
      errorCode: result.errorCode || "",
      detail: result.detail || "",
      raw: result.raw || null,
      isFailSafe: true
    });
  }

  function showToast(text) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.documentElement.appendChild(toast);
      requestAnimationFrame(function () {
        toast.classList.add("is-visible");
      });
    }
    toast.textContent = text;
  }

  function hideToast() {
    const toast = document.getElementById(TOAST_ID);
    if (!toast) {
      return;
    }
    toast.classList.remove("is-visible");
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 220);
  }

  function showOverlay(options) {
    removeOverlay();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.tabIndex = -1;

    const panel = document.createElement("section");
    panel.className = "bfw-panel";

    const eyebrow = document.createElement("p");
    eyebrow.className = "bfw-eyebrow";
    eyebrow.textContent = options.isFailSafe ? "Fail-Safe 模式" : "命中拦截规则";

    const heading = document.createElement("h2");
    heading.textContent = options.title;

    const reason = document.createElement("p");
    reason.className = "bfw-reason";
    reason.textContent = options.reason;

    const categories = document.createElement("div");
    categories.className = "bfw-categories";
    if (options.categories && options.categories.length) {
      options.categories.forEach(function (name) {
        const chip = document.createElement("span");
        chip.textContent = name;
        categories.appendChild(chip);
      });
    } else {
      const chip = document.createElement("span");
      chip.textContent = options.errorCode || "AI异常";
      categories.appendChild(chip);
    }

    panel.appendChild(eyebrow);
    panel.appendChild(heading);
    panel.appendChild(reason);
    panel.appendChild(categories);

    if (options.isFailSafe) {
      const diagnostics = document.createElement("details");
      diagnostics.className = "bfw-diagnostics";
      const summary = document.createElement("summary");
      summary.textContent = "查看调试信息";
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify({
        errorCode: options.errorCode,
        detail: options.detail,
        raw: options.raw
      }, null, 2);
      diagnostics.appendChild(summary);
      diagnostics.appendChild(pre);
      panel.appendChild(diagnostics);
    }

    const actions = document.createElement("div");
    actions.className = "bfw-actions";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "bfw-primary";
    closeButton.textContent = "听你的，关闭页面";
    closeButton.addEventListener("click", function () {
      sendMessage({ type: "CLOSE_TAB" }).then(function (response) {
        if (!response || !response.ok) {
          window.close();
        }
      });
    });

    const continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.className = "bfw-secondary";
    continueButton.textContent = "我知道风险，但我今天想放纵一下";
    continueButton.addEventListener("click", function () {
      continueWatching(options.videoId);
    });

    actions.appendChild(closeButton);
    actions.appendChild(continueButton);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);

    overlay.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        continueWatching(options.videoId);
      }
      trapFocus(event, overlay);
    });

    requestAnimationFrame(function () {
      overlay.classList.add("is-visible");
      overlay.focus();
    });
  }

  function trapFocus(event, root) {
    if (event.key !== "Tab") {
      return;
    }

    const focusable = Array.from(root.querySelectorAll("button, summary, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])"))
      .filter(function (node) {
        return !node.disabled && node.offsetParent !== null;
      });

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function continueWatching(videoId) {
    if (videoId) {
      waivedVideoIds.add(videoId);
    }
    removeOverlay();
    hideToast();
    playVideo();
  }

  function cleanupUi() {
    hideToast();
    removeOverlay();
  }

  function removeOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function pauseVideo() {
    const video = document.querySelector("video");
    if (video && typeof video.pause === "function") {
      video.pause();
    }
  }

  function playVideo() {
    const video = document.querySelector("video");
    if (video && typeof video.play === "function") {
      video.play().catch(function () {});
    }
  }

  function shouldAnalyze(settings) {
    return Boolean(
      settings &&
      settings.api &&
      settings.api.baseUrl &&
      settings.api.apiKey &&
      settings.api.model
    );
  }

  function isRunCurrent(expectedRunId, expectedVideoId) {
    return runId === expectedRunId && currentVideoId === expectedVideoId;
  }

  function sendMessage(message) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(message, function (response) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    });
  }

  function logError(error) {
    if (DEBUG) {
      console.error("[BFW]", error);
    }
  }
})();
