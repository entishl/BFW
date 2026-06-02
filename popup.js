(function () {
  "use strict";

  const SETTINGS_KEY = "cyberBuddySettings";
  const CACHE_KEY = "videoCache";

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindElements();
    bindEvents();
    await loadState();
  }

  function bindElements() {
    elements.enabledToggle = document.getElementById("enabledToggle");
    elements.statusText = document.getElementById("statusText");
    elements.apiStatus = document.getElementById("apiStatus");
    elements.cacheCount = document.getElementById("cacheCount");
    elements.apiWarning = document.getElementById("apiWarning");
    elements.optionsIconBtn = document.getElementById("optionsIconBtn");
    elements.openOptionsBtn = document.getElementById("openOptionsBtn");
    elements.clearCacheBtn = document.getElementById("clearCacheBtn");
  }

  function bindEvents() {
    // Toggle switch handler
    elements.enabledToggle.addEventListener("change", handleToggle);

    // Open options page handlers
    const openOptionsHandler = function () {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL("options.html"));
      }
    };
    elements.optionsIconBtn.addEventListener("click", openOptionsHandler);
    elements.openOptionsBtn.addEventListener("click", openOptionsHandler);

    // Clear cache handler
    elements.clearCacheBtn.addEventListener("click", handleClearCache);
  }

  async function loadState() {
    try {
      const stored = await storageGet([SETTINGS_KEY, CACHE_KEY]);
      const settings = stored[SETTINGS_KEY] || {};
      const cache = stored[CACHE_KEY] || {};

      // 1. Sync Toggle state
      const isEnabled = settings.enabled !== false;
      elements.enabledToggle.checked = isEnabled;
      updateStatusText(isEnabled);

      // 2. Sync API configuration state
      const apiConfigured = hasApiConfig(settings);
      if (apiConfigured) {
        elements.apiStatus.textContent = "已配置";
        elements.apiStatus.className = "stat-value ok";
        elements.apiWarning.hidden = true;
      } else {
        elements.apiStatus.textContent = "未配置";
        elements.apiStatus.className = "stat-value warn";
        elements.apiWarning.hidden = false;
      }

      // 3. Sync Cache count
      const count = Object.keys(cache).length;
      elements.cacheCount.textContent = count + " 条";
    } catch (error) {
      console.error("[BFW Popup] 加载状态失败:", error);
    }
  }

  async function handleToggle() {
    const isChecked = elements.enabledToggle.checked;
    updateStatusText(isChecked);

    try {
      const stored = await storageGet([SETTINGS_KEY]);
      const settings = stored[SETTINGS_KEY] || {};
      settings.enabled = isChecked;
      await storageSet({ [SETTINGS_KEY]: settings });
    } catch (error) {
      console.error("[BFW Popup] 保存状态失败:", error);
    }
  }

  async function handleClearCache() {
    if (elements.clearCacheBtn.disabled) return;
    
    const originalText = elements.clearCacheBtn.textContent;
    elements.clearCacheBtn.disabled = true;
    elements.clearCacheBtn.textContent = "正在清空...";

    try {
      await storageSet({ [CACHE_KEY]: {} });
      elements.cacheCount.textContent = "0 条";
      elements.clearCacheBtn.textContent = "已清空";
      
      setTimeout(function () {
        elements.clearCacheBtn.textContent = originalText;
        elements.clearCacheBtn.disabled = false;
      }, 1200);
    } catch (error) {
      console.error("[BFW Popup] 清空缓存失败:", error);
      elements.clearCacheBtn.textContent = "清空失败";
      
      setTimeout(function () {
        elements.clearCacheBtn.textContent = originalText;
        elements.clearCacheBtn.disabled = false;
      }, 1500);
    }
  }

  function updateStatusText(enabled) {
    if (enabled) {
      elements.statusText.textContent = "运行中";
      elements.statusText.className = "status-indicator enabled";
    } else {
      elements.statusText.textContent = "已暂停";
      elements.statusText.className = "status-indicator disabled";
    }
  }

  function hasApiConfig(settings) {
    return Boolean(
      settings &&
      settings.api &&
      settings.api.baseUrl &&
      settings.api.apiKey &&
      settings.api.model
    );
  }

  function storageGet(keys) {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.get(keys, function (result) {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(result || {});
      });
    });
  }

  function storageSet(values) {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.set(values, function () {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve();
      });
    });
  }
})();
