(function () {
  "use strict";

  const SETTINGS_KEY = "cyberBuddySettings";
  const CACHE_KEY = "videoCache";

  const DEFAULT_SETTINGS = {
    enabled: true,
    api: {
      baseUrl: "",
      apiKey: "",
      model: ""
    },
    timeouts: {
      api: 15,
      comment: 3
    },
    tone: "像一个温柔但清醒的朋友一样劝我",
    categories: [
      {
        id: "default-harmful",
        name: "有害",
        description: "政治类、社会负面新闻、性别对立、引发焦虑或情绪内耗的内容",
        blocked: true
      },
      {
        id: "default-useless",
        name: "无用",
        description: "纯娱乐、低信息密度、容易让人无意识沉迷的内容",
        blocked: true
      },
      {
        id: "default-tech",
        name: "技术",
        description: "编程、开发、AI、工程技术、产品设计",
        blocked: false
      },
      {
        id: "default-learning",
        name: "学习",
        description: "知识学习、课程、技能提升、深度科普",
        blocked: false
      },
      {
        id: "default-entertainment",
        name: "娱乐",
        description: "轻松娱乐、音乐、影视、游戏、生活休闲",
        blocked: false
      }
    ]
  };

  const elements = {};
  let state = {
    settings: DEFAULT_SETTINGS
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindElements();
    bindEvents();
    await loadSettings();
    await refreshCacheCount();
  }

  function bindElements() {
    elements.enabledInput = document.getElementById("enabledInput");
    elements.baseUrlInput = document.getElementById("baseUrlInput");
    elements.apiKeyInput = document.getElementById("apiKeyInput");
    elements.modelInput = document.getElementById("modelInput");
    elements.apiTimeoutInput = document.getElementById("apiTimeoutInput");
    elements.commentTimeoutInput = document.getElementById("commentTimeoutInput");
    elements.toneInput = document.getElementById("toneInput");
    elements.categoryList = document.getElementById("categoryList");
    elements.addCategoryButton = document.getElementById("addCategoryButton");
    elements.saveButton = document.getElementById("saveButton");
    elements.clearCacheButton = document.getElementById("clearCacheButton");
    elements.cacheCount = document.getElementById("cacheCount");
    elements.statusMessage = document.getElementById("statusMessage");
    elements.emptyCategoryWarning = document.getElementById("emptyCategoryWarning");
  }

  function bindEvents() {
    elements.addCategoryButton.addEventListener("click", function () {
      state.settings.categories.push({
        id: createId(),
        name: "",
        description: "",
        blocked: false
      });
      renderCategories();
    });

    elements.saveButton.addEventListener("click", function () {
      saveSettings().catch(function (error) {
        setStatus("保存失败：" + error.message, true);
      });
    });

    elements.clearCacheButton.addEventListener("click", function () {
      clearCache().catch(function (error) {
        setStatus("清空失败：" + error.message, true);
      });
    });
  }

  async function loadSettings() {
    const stored = await storageGet([SETTINGS_KEY]);
    state.settings = mergeSettings(stored[SETTINGS_KEY]);
    fillForm();
    renderCategories();
  }

  function fillForm() {
    const settings = state.settings;
    elements.enabledInput.checked = settings.enabled;
    elements.baseUrlInput.value = settings.api.baseUrl;
    elements.apiKeyInput.value = settings.api.apiKey;
    elements.modelInput.value = settings.api.model;
    elements.apiTimeoutInput.value = settings.timeouts.api;
    elements.commentTimeoutInput.value = settings.timeouts.comment;
    elements.toneInput.value = settings.tone;
  }

  function renderCategories() {
    elements.categoryList.textContent = "";
    elements.emptyCategoryWarning.hidden = state.settings.categories.length > 0;

    state.settings.categories.forEach(function (category, index) {
      const row = document.createElement("div");
      row.className = "category-row";
      row.dataset.id = category.id;

      const nameLabel = document.createElement("label");
      const nameText = document.createElement("span");
      nameText.textContent = "分类名称";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = category.name;
      nameInput.addEventListener("input", function () {
        category.name = nameInput.value;
      });
      nameLabel.appendChild(nameText);
      nameLabel.appendChild(nameInput);

      const descLabel = document.createElement("label");
      const descText = document.createElement("span");
      descText.textContent = "分类描述";
      const descInput = document.createElement("textarea");
      descInput.rows = 2;
      descInput.value = category.description;
      descInput.addEventListener("input", function () {
        category.description = descInput.value;
      });
      descLabel.appendChild(descText);
      descLabel.appendChild(descInput);

      const blockedLabel = document.createElement("label");
      blockedLabel.className = "checkbox-label";
      const blockedInput = document.createElement("input");
      blockedInput.type = "checkbox";
      blockedInput.checked = category.blocked;
      blockedInput.addEventListener("change", function () {
        category.blocked = blockedInput.checked;
      });
      const blockedText = document.createElement("span");
      blockedText.textContent = "拦截";
      blockedLabel.appendChild(blockedInput);
      blockedLabel.appendChild(blockedText);

      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.appendChild(makeRowButton("上移", function () {
        moveCategory(index, -1);
      }, index === 0));
      actions.appendChild(makeRowButton("下移", function () {
        moveCategory(index, 1);
      }, index === state.settings.categories.length - 1));
      actions.appendChild(makeRowButton("删除", function () {
        state.settings.categories.splice(index, 1);
        renderCategories();
      }, false));

      row.appendChild(nameLabel);
      row.appendChild(descLabel);
      row.appendChild(blockedLabel);
      row.appendChild(actions);
      elements.categoryList.appendChild(row);
    });
  }

  function makeRowButton(text, onClick, disabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  function moveCategory(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= state.settings.categories.length) {
      return;
    }
    const categories = state.settings.categories;
    const item = categories[index];
    categories.splice(index, 1);
    categories.splice(nextIndex, 0, item);
    renderCategories();
  }

  async function saveSettings() {
    const settings = collectFormSettings();
    const permissionResult = await requestApiPermission(settings.api.baseUrl);
    await storageSet({ [SETTINGS_KEY]: settings });
    state.settings = settings;
    renderCategories();

    if (settings.categories.length === 0) {
      setStatus("已保存。当前无任何分类规则，扩展已暂停工作。", false);
      return;
    }

    if (permissionResult === false) {
      setStatus("已保存，但未授予 API 域名权限，请重新保存并允许权限后再使用。", true);
      return;
    }

    setStatus("设置已保存。", false);
  }

  function collectFormSettings() {
    return {
      enabled: elements.enabledInput.checked,
      api: {
        baseUrl: normalizeText(elements.baseUrlInput.value, 500),
        apiKey: normalizeText(elements.apiKeyInput.value, 500),
        model: normalizeText(elements.modelInput.value, 160)
      },
      timeouts: {
        api: clampNumber(elements.apiTimeoutInput.value, 1, 120, DEFAULT_SETTINGS.timeouts.api),
        comment: clampNumber(elements.commentTimeoutInput.value, 0, 30, DEFAULT_SETTINGS.timeouts.comment)
      },
      tone: normalizeText(elements.toneInput.value, 300),
      categories: state.settings.categories.map(function (category) {
        return {
          id: category.id || createId(),
          name: normalizeText(category.name, 80),
          description: normalizeText(category.description, 300),
          blocked: Boolean(category.blocked)
        };
      }).filter(function (category) {
        return category.name;
      })
    };
  }

  async function requestApiPermission(baseUrl) {
    const pattern = getPermissionPattern(baseUrl);
    if (!pattern || !chrome.permissions || !chrome.permissions.request) {
      return null;
    }

    const alreadyGranted = await containsPermission(pattern);
    if (alreadyGranted) {
      return true;
    }

    return new Promise(function (resolve) {
      chrome.permissions.request({ origins: [pattern] }, function (granted) {
        resolve(Boolean(granted));
      });
    });
  }

  function containsPermission(pattern) {
    return new Promise(function (resolve) {
      chrome.permissions.contains({ origins: [pattern] }, function (granted) {
        resolve(Boolean(granted));
      });
    });
  }

  function getPermissionPattern(baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return "";
      }
      return url.protocol + "//" + url.hostname + "/*";
    } catch (error) {
      return "";
    }
  }

  async function refreshCacheCount() {
    const stored = await storageGet([CACHE_KEY]);
    const cache = stored[CACHE_KEY] && typeof stored[CACHE_KEY] === "object" ? stored[CACHE_KEY] : {};
    elements.cacheCount.textContent = String(Object.keys(cache).length);
  }

  async function clearCache() {
    await storageSet({ [CACHE_KEY]: {} });
    await refreshCacheCount();
    setStatus("历史记录已清空。", false);
  }

  function mergeSettings(stored) {
    const source = stored && typeof stored === "object" ? stored : {};
    return {
      enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_SETTINGS.enabled,
      api: {
        baseUrl: normalizeText(source.api && source.api.baseUrl, 500),
        apiKey: normalizeText(source.api && source.api.apiKey, 500),
        model: normalizeText(source.api && source.api.model, 160)
      },
      timeouts: {
        api: clampNumber(source.timeouts && source.timeouts.api, 1, 120, DEFAULT_SETTINGS.timeouts.api),
        comment: clampNumber(source.timeouts && source.timeouts.comment, 0, 30, DEFAULT_SETTINGS.timeouts.comment)
      },
      tone: normalizeText(source.tone, 300) || DEFAULT_SETTINGS.tone,
      categories: Array.isArray(source.categories) ? source.categories.map(function (category) {
        return {
          id: normalizeText(category.id, 80) || createId(),
          name: normalizeText(category.name, 80),
          description: normalizeText(category.description, 300),
          blocked: Boolean(category.blocked)
        };
      }).filter(function (category) {
        return category.name;
      }) : DEFAULT_SETTINGS.categories.map(function (category) {
        return Object.assign({}, category);
      })
    };
  }

  let statusTimeout = null;
  function setStatus(message, isError) {
    if (statusTimeout) {
      clearTimeout(statusTimeout);
      statusTimeout = null;
    }
    elements.statusMessage.textContent = message;
    elements.statusMessage.style.color = isError ? "var(--danger)" : "var(--accent-strong)";
    elements.statusMessage.style.opacity = "1";
    elements.statusMessage.style.transition = "";

    if (!isError && message) {
      statusTimeout = setTimeout(function () {
        elements.statusMessage.style.transition = "opacity 0.8s ease";
        elements.statusMessage.style.opacity = "0";
        statusTimeout = setTimeout(function () {
          elements.statusMessage.textContent = "";
          elements.statusMessage.style.transition = "";
        }, 800);
      }, 3000);
    }
  }

  function normalizeText(value, maxLength) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, number));
  }

  function createId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
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
