(function () {
  "use strict";

  const BV_PATTERN = /BV[0-9A-Za-z]+/;

  function matchesVideoPage(url) {
    return /\/\/[^/]*bilibili\.com\/video\/BV[0-9A-Za-z]+/i.test(String(url || ""));
  }

  function extractVideoId(url) {
    const match = String(url || "").match(BV_PATTERN);
    return match ? match[0] : "";
  }

  async function collectPageData(commentWaitSeconds, videoId) {
    if (videoId) {
      await waitForNewPageReady(videoId, 2000);
    } else {
      await waitForElement([
        "h1.video-title",
        "h1[title]",
        ".video-title",
        ".video-info-title",
        "meta[property='og:title']"
      ], 2000);
    }

    return {
      title: readTitle(),
      uploader: readFirstText([
        ".up-name",
        ".up-info-container .username",
        ".up-info .name",
        "a[href*='/space.bilibili.com'] .name",
        "#v_upinfo .name"
      ], 120),
      zone: readFirstText([
        ".firstchannel-tag",
        ".secondchannel-tag",
        ".video-data .channel",
        ".breadcrumb a:last-child",
        "a[href*='/v/']"
      ], 120),
      tags: readTags(),
      description: readDescription(),
      comments: await readComments(commentWaitSeconds)
    };
  }

  function readTitle() {
    const fromMeta = readMeta("og:title") || readMeta("title");
    const text = readFirstText([
      "h1.video-title",
      "h1[title]",
      ".video-title",
      ".video-info-title",
      "h1"
    ], 200);

    return cleanText(text || fromMeta, 200);
  }

  function readDescription() {
    const text = readFirstText([
      ".desc-info-text",
      ".basic-desc-info",
      ".video-desc .desc-info-text",
      ".video-desc",
      "#v_desc .desc-info-text"
    ], 500);
    return cleanText(text || readMeta("description"), 500);
  }

  function readTags() {
    const selectors = [
      ".tag-link",
      ".video-tag .tag",
      ".tag-area a",
      ".tag-panel a",
      ".tag .tag-link"
    ];
    const tags = [];

    selectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (node) {
        const value = cleanText(node.textContent, 80);
        if (value && !tags.includes(value)) {
          tags.push(value);
        }
      });
    });

    return tags.slice(0, 30);
  }

  async function readComments(commentWaitSeconds) {
    const timeoutMs = Math.max(0, Number(commentWaitSeconds) || 0) * 1000;
    if (!timeoutMs) {
      return [];
    }

    const start = Date.now();
    const selectors = [
      ".reply-item .reply-content",
      ".reply-item .content",
      ".bili-comment .reply-content",
      ".comment-list .text",
      ".comment-list .content"
    ];

    while (Date.now() - start < timeoutMs) {
      const comments = [];
      selectors.forEach(function (selector) {
        document.querySelectorAll(selector).forEach(function (node) {
          const value = cleanText(node.textContent, 280);
          if (value && !comments.includes(value)) {
            comments.push(value);
          }
        });
      });

      if (comments.length >= 3) {
        return comments.slice(0, 3);
      }

      await delay(250);
    }

    return [];
  }

  function readFirstText(selectors, maxLength) {
    for (let index = 0; index < selectors.length; index += 1) {
      const node = document.querySelector(selectors[index]);
      const text = node && (node.getAttribute("title") || node.textContent);
      const cleaned = cleanText(text, maxLength);
      if (cleaned) {
        return cleaned;
      }
    }
    return "";
  }

  function readMeta(name) {
    const selector = "meta[name='" + name + "'], meta[property='" + name + "']";
    const node = document.querySelector(selector);
    return node ? cleanText(node.getAttribute("content"), 500) : "";
  }

  function waitForNewPageReady(targetVideoId, timeoutMs) {
    return new Promise(function (resolve) {
      const start = Date.now();
      const timer = setInterval(function () {
        const canonicalLink = document.querySelector('link[rel="canonical"]');
        const ogUrlMeta = document.querySelector('meta[property="og:url"]');
        const currentUrl = (canonicalLink && canonicalLink.href) || 
                           (ogUrlMeta && ogUrlMeta.getAttribute("content")) || "";
                           
        if (currentUrl.includes(targetVideoId)) {
          clearInterval(timer);
          resolve(true);
          return;
        }

        if (Date.now() - start >= timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  function waitForElement(selectors, timeoutMs) {
    const selectorList = selectors.join(",");
    if (document.querySelector(selectorList)) {
      return Promise.resolve(true);
    }

    return new Promise(function (resolve) {
      const start = Date.now();
      const timer = setInterval(function () {
        if (document.querySelector(selectorList)) {
          clearInterval(timer);
          resolve(true);
          return;
        }

        if (Date.now() - start >= timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, 150);
    });
  }

  function cleanText(value, maxLength) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  window.CyberBuddyBilibili = {
    matchesVideoPage,
    extractVideoId,
    collectPageData
  };
})();
