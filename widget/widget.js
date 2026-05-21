/**
 * ChatCraft AI — Embeddable Widget
 * Drop-in, zero-dependency chat widget for any website.
 *
 * Attributes:
 *   data-chatbot-id      (required) chatbot UUID
 *   data-widget-token    (required) embed token
 *   data-type            launcher | iframe | voice   (default: launcher)
 *   data-position        bottom-right | bottom-left | top-right | top-left
 *   data-api-base        API base URL (default: https://api.chatcraft.ai)
 *   data-app-base        App base URL (default: https://app.chatcraft.ai)
 *   data-hide-header     true — hide chat header in launcher
 *   data-theme           light | dark — override bot's theme
 *   data-primary-color   hex colour override, e.g. #e63946
 *
 * iframe mode: looks for <div data-chatcraft-iframe="<chatbot-id>"></div> and
 * replaces it with a responsive iframe pointing to /widgets/<id>.
 */
(function () {
  "use strict";

  // ── Read script tag attributes ─────────────────────────────────────────────
  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var CHATBOT_ID   = currentScript.getAttribute("data-chatbot-id");
  var WIDGET_TOKEN = currentScript.getAttribute("data-widget-token");
  var TYPE         = currentScript.getAttribute("data-type") || "launcher";
  var POSITION     = currentScript.getAttribute("data-position") || "bottom-right";
  var API_BASE     = currentScript.getAttribute("data-api-base") || "https://api.chatcraft.ai";
  var APP_BASE     = currentScript.getAttribute("data-app-base") || "https://app.chatcraft.ai";
  var HIDE_HEADER  = currentScript.getAttribute("data-hide-header") === "true";
  var THEME_OVERRIDE    = currentScript.getAttribute("data-theme") || "";
  var COLOR_OVERRIDE    = currentScript.getAttribute("data-primary-color") || "";

  if (!CHATBOT_ID || !WIDGET_TOKEN) {
    console.warn("[ChatCraft] Missing data-chatbot-id or data-widget-token.");
    return;
  }

  // ── iframe mode ────────────────────────────────────────────────────────────
  if (TYPE === "iframe") {
    function injectIframe() {
      var placeholders = document.querySelectorAll(
        '[data-chatcraft-iframe="' + CHATBOT_ID + '"]'
      );
      if (!placeholders.length) {
        // Fallback: create a full-page-ish iframe appended to body
        placeholders = [document.body];
      }
      var params = buildParams();
      for (var i = 0; i < placeholders.length; i++) {
        var el = placeholders[i];
        var iframe = document.createElement("iframe");
        iframe.src = APP_BASE + "/widgets/" + CHATBOT_ID + (params ? "?" + params : "");
        iframe.style.cssText = "border:none;width:100%;height:100%;min-height:600px;display:block;border-radius:inherit;";
        iframe.setAttribute("allow", "microphone");
        iframe.setAttribute("title", "Chat");
        el.innerHTML = "";
        el.appendChild(iframe);
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectIframe);
    } else {
      injectIframe();
    }
    return;
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────
  var GUEST_KEY = "chatcraft_guest_id_" + CHATBOT_ID;
  var CONV_KEY  = "chatcraft_conv_id_" + CHATBOT_ID;

  function guestId() {
    var id = localStorage.getItem(GUEST_KEY);
    if (!id) {
      id = "g-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(GUEST_KEY, id);
    }
    return id;
  }

  function convId(set) {
    if (set !== undefined) { localStorage.setItem(CONV_KEY, set); return set; }
    return localStorage.getItem(CONV_KEY) || null;
  }

  function buildParams() {
    var parts = [];
    if (HIDE_HEADER) parts.push("hideHeader=true");
    if (THEME_OVERRIDE) parts.push("theme=" + encodeURIComponent(THEME_OVERRIDE));
    if (COLOR_OVERRIDE) parts.push("primaryColor=" + encodeURIComponent(COLOR_OVERRIDE));
    return parts.join("&");
  }

  function positionCSS(pos) {
    var map = {
      "bottom-right": "bottom:20px;right:20px;",
      "bottom-left":  "bottom:20px;left:20px;",
      "top-right":    "top:20px;right:20px;",
      "top-left":     "top:20px;left:20px;",
    };
    return map[pos] || map["bottom-right"];
  }

  function panelPositionCSS(pos) {
    var map = {
      "bottom-right": "bottom:80px;right:20px;",
      "bottom-left":  "bottom:80px;left:20px;",
      "top-right":    "top:80px;right:20px;",
      "top-left":     "top:80px;left:20px;",
    };
    return map[pos] || map["bottom-right"];
  }

  function _escape(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Load config from API ───────────────────────────────────────────────────
  function fetchConfig(cb) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", API_BASE + "/api/widget/" + CHATBOT_ID + "/config");
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { cb(null, JSON.parse(xhr.responseText).data); } catch (e) { cb(e); }
      } else {
        cb(new Error("HTTP " + xhr.status));
      }
    };
    xhr.onerror = function () { cb(new Error("Network error")); };
    xhr.send();
  }

  // ── voice launcher mode ────────────────────────────────────────────────────
  function buildVoiceLauncher(cfg) {
    var primaryColor = COLOR_OVERRIDE || cfg.primary_colour;
    var host = document.createElement("div");
    host.id = "chatcraft-widget-host";
    host.style.cssText = "position:fixed;" + positionCSS(POSITION) + "z-index:2147483647;";
    document.body.appendChild(host);

    var shadow = host.attachShadow({ mode: "open" });
    var params = buildParams() + (buildParams() ? "&" : "") + "voice=1";

    shadow.innerHTML = [
      "<style>",
      ":host { all: initial; }",
      "#vbubble { width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;",
      "  background:" + primaryColor + ";color:#fff;font-size:22px;display:flex;",
      "  align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.2);",
      "  transition:transform .15s ease; }",
      "#vbubble:hover { transform:scale(1.08); }",
      "#vframe { position:fixed;" + panelPositionCSS(POSITION),
      "  width:360px;height:580px;border:none;border-radius:16px;",
      "  box-shadow:0 8px 32px rgba(0,0,0,.15);display:none;z-index:2147483646; }",
      "</style>",
      "<button id='vbubble' aria-label='Open voice chat'>",
      "  <svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>",
      "    <path d='M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z'/>",
      "    <path d='M19 10v2a7 7 0 0 1-14 0v-2'/>",
      "    <line x1='12' y1='19' x2='12' y2='23'/><line x1='8' y1='23' x2='16' y2='23'/>",
      "  </svg>",
      "</button>",
      "<iframe id='vframe' allow='microphone' title='Voice chat'></iframe>",
    ].join("\n");

    var vbubble = shadow.getElementById("vbubble");
    var vframe  = shadow.getElementById("vframe");
    var open = false;

    vbubble.addEventListener("click", function () {
      open = !open;
      if (open) {
        vframe.src = APP_BASE + "/widgets/" + CHATBOT_ID + "?" + params;
        vframe.style.display = "block";
      } else {
        vframe.style.display = "none";
        vframe.src = "";
      }
    });
  }

  // ── launcher mode (default) ────────────────────────────────────────────────
  function buildWidget(cfg) {
    var primaryColor = COLOR_OVERRIDE || cfg.primary_colour;
    var isDark = THEME_OVERRIDE === "dark" || (!THEME_OVERRIDE && cfg.dark_mode);
    var bg         = isDark ? "#18181b" : (cfg.background_colour || "#ffffff");
    var textColor  = isDark ? "#f4f4f5" : "#09090b";
    var mutedColor = isDark ? "#a1a1aa" : "#71717a";
    var inputBg    = isDark ? "#27272a" : "#f4f4f5";
    var borderColor= isDark ? "#3f3f46" : "#e4e4e7";
    var bubbleRadius = cfg.bubble_style === "pill" ? "9999px" : cfg.bubble_style === "square" ? "4px" : "12px";

    var host = document.createElement("div");
    host.id = "chatcraft-widget-host";
    host.style.cssText = "position:fixed;" + positionCSS(POSITION) + "z-index:2147483647;font-family:inherit;";
    document.body.appendChild(host);

    var shadow = host.attachShadow({ mode: "open" });

    var css = [
      ":host { all: initial; font-family: '" + _escape(cfg.font_family) + "', system-ui, sans-serif; }",
      "*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }",

      "#bubble { width:56px; height:56px; border-radius:50%; border:none; cursor:pointer;",
      "  background:" + primaryColor + "; color:#fff; font-size:24px; display:flex;",
      "  align-items:center; justify-content:center; box-shadow:0 4px 16px rgba(0,0,0,.2);",
      "  transition:transform .15s ease, box-shadow .15s ease; }",
      "#bubble:hover { transform:scale(1.07); box-shadow:0 6px 20px rgba(0,0,0,.25); }",

      "#panel { position:fixed; " + panelPositionCSS(POSITION),
      "  width:360px; height:540px; background:" + bg + "; border:1px solid " + borderColor + ";",
      "  border-radius:16px; box-shadow:0 8px 32px rgba(0,0,0,.15); display:flex; flex-direction:column;",
      "  overflow:hidden; transform-origin:bottom right; transition:opacity .2s ease, transform .2s ease;",
      "  opacity:0; transform:scale(.95) translateY(8px); pointer-events:none; }",
      "#panel.open { opacity:1; transform:scale(1) translateY(0); pointer-events:all; }",

      (HIDE_HEADER ? "#header { display:none; }" :
        "#header { background:" + primaryColor + "; padding:12px 14px; display:flex; align-items:center; gap:10px; }"),
      "#header-name { color:#fff; font-weight:600; font-size:14px; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
      "#close-btn { background:none; border:none; cursor:pointer; color:rgba(255,255,255,.8); font-size:18px; line-height:1; padding:2px 4px; }",
      "#close-btn:hover { color:#fff; }",
      "#logo-img { width:28px; height:28px; border-radius:50%; object-fit:cover; }",
      "#logo-placeholder { width:28px; height:28px; border-radius:50%; background:rgba(255,255,255,.2); }",
      "#online-dot { width:8px; height:8px; border-radius:50%; background:#4ade80; flex-shrink:0; }",

      "#messages { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }",
      "#messages::-webkit-scrollbar { width:4px; }",
      "#messages::-webkit-scrollbar-thumb { background:" + borderColor + "; border-radius:2px; }",

      ".msg { max-width:78%; padding:8px 12px; font-size:13px; line-height:1.5; word-break:break-word; }",
      ".msg.user { align-self:flex-end; background:" + primaryColor + "; color:#fff; border-radius:" + bubbleRadius + "; }",
      ".msg.bot  { align-self:flex-start; background:" + inputBg + "; color:" + textColor + "; border-radius:" + bubbleRadius + "; }",
      ".msg.typing { color:" + mutedColor + "; font-style:italic; }",

      "#welcome { color:" + mutedColor + "; font-size:12px; text-align:center; padding:8px 0 4px; }",

      "#cap-notice { margin:8px 12px; background:" + (isDark ? "#3f3f46" : "#fef9c3") + ";",
      "  color:" + textColor + "; border-radius:8px; padding:10px 12px; font-size:12px; text-align:center; }",
      "#cap-notice a { color:" + primaryColor + "; font-weight:600; text-decoration:none; }",

      "#input-area { display:flex; align-items:center; gap:8px; padding:10px 12px; border-top:1px solid " + borderColor + "; }",
      "#input-field { flex:1; border:1px solid " + borderColor + "; border-radius:9999px; padding:8px 14px;",
      "  font-size:13px; background:" + inputBg + "; color:" + textColor + "; outline:none; font-family:inherit; }",
      "#input-field::placeholder { color:" + mutedColor + "; }",
      "#input-field:focus { border-color:" + primaryColor + "; }",
      "#send-btn { width:36px; height:36px; border-radius:50%; border:none; cursor:pointer;",
      "  background:" + primaryColor + "; color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; }",
      "#send-btn:disabled { opacity:.5; cursor:not-allowed; }",

      "#branding { padding:4px 12px 8px; text-align:center; font-size:10px; color:" + mutedColor + "; }",
      "#branding a { color:" + mutedColor + "; text-decoration:none; }",
      "#branding a:hover { text-decoration:underline; }",
    ].join("\n");

    var logoHTML = cfg.logo_url
      ? '<img id="logo-img" src="' + cfg.logo_url + '" alt="" />'
      : '<div id="logo-placeholder"></div>';

    var welcomeHTML = cfg.welcome_message
      ? '<div id="welcome">' + _escape(cfg.welcome_message) + '</div>'
      : "";

    var brandingHTML = cfg.show_branding
      ? '<div id="branding">Powered by <a href="https://chatcraft.ai" target="_blank">ChatCraft AI</a></div>'
      : "";

    var headerHTML = HIDE_HEADER ? "" : [
      '<div id="header">',
      '  ' + logoHTML,
      '  <span id="header-name">' + _escape(cfg.name) + '</span>',
      '  <span id="online-dot"></span>',
      '  <button id="close-btn" aria-label="Close chat">&#x2715;</button>',
      '</div>',
    ].join("\n");

    shadow.innerHTML = [
      '<style>' + css + '</style>',
      '<button id="bubble" aria-label="Open chat">',
      '  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
      '    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      '  </svg>',
      '</button>',
      '<div id="panel" role="dialog" aria-label="Chat with ' + _escape(cfg.name) + '">',
      '  ' + headerHTML,
      '  <div id="messages">' + welcomeHTML + '</div>',
      '  <div id="input-area">',
      '    <input id="input-field" type="text" placeholder="' + _escape(cfg.placeholder_text || "Type a message…") + '" autocomplete="off" />',
      '    <button id="send-btn" aria-label="Send">',
      '      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">',
      '        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
      '      </svg>',
      '    </button>',
      '  </div>',
      '  ' + brandingHTML,
      '</div>',
    ].join("\n");

    // ── Wire up events ────────────────────────────────────────────────────────
    var bubble     = shadow.getElementById("bubble");
    var panel      = shadow.getElementById("panel");
    var closeBtn   = shadow.getElementById("close-btn");
    var inputField = shadow.getElementById("input-field");
    var sendBtn    = shadow.getElementById("send-btn");
    var messagesEl = shadow.getElementById("messages");

    var isOpen = false;
    var isStreaming = false;
    var capReached = false;

    function chatIcon() {
      return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }
    function closeIcon() {
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    }

    function toggle() {
      isOpen = !isOpen;
      panel.classList.toggle("open", isOpen);
      bubble.innerHTML = isOpen ? closeIcon() : chatIcon();
      if (isOpen) setTimeout(function () { inputField && inputField.focus(); }, 200);
    }

    bubble.addEventListener("click", toggle);
    if (closeBtn) closeBtn.addEventListener("click", toggle);

    inputField.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    sendBtn.addEventListener("click", sendMessage);

    function sendMessage() {
      if (isStreaming || capReached) return;
      var text = inputField.value.trim();
      if (!text) return;
      inputField.value = "";
      appendMessage("user", text);
      var typingEl = appendMessage("bot typing", "…");
      isStreaming = true;
      sendBtn.disabled = true;

      var xhr = new XMLHttpRequest();
      xhr.open("POST", API_BASE + "/api/widget/" + CHATBOT_ID + "/chat");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("X-Widget-Token", WIDGET_TOKEN);
      xhr.setRequestHeader("X-Guest-ID", guestId());

      var buffer = "", botContent = "", botEl = null;

      xhr.onreadystatechange = function () {
        if (xhr.readyState < 3) return;

        if (xhr.status === 429) {
          typingEl.parentNode && typingEl.parentNode.removeChild(typingEl);
          showCapNotice();
          isStreaming = false;
          sendBtn.disabled = false;
          return;
        }

        if (xhr.status >= 400) {
          typingEl.className = "msg bot";
          try {
            var errBody = JSON.parse(xhr.responseText);
            typingEl.textContent = "⚠️ " + (errBody.detail && errBody.detail.error ? errBody.detail.error : "Something went wrong.");
          } catch (_) {
            typingEl.textContent = "⚠️ Something went wrong. Please try again.";
          }
          isStreaming = false;
          sendBtn.disabled = false;
          return;
        }

        var newChunk = xhr.responseText.slice(buffer.length);
        buffer = xhr.responseText;

        var parts = newChunk.split("\n\n");
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i].trim();
          if (!part) continue;
          var line = part.startsWith("data: ") ? part.slice(6) : part;
          try {
            var ev = JSON.parse(line);
            if (ev.type === "delta") {
              if (!botEl) { typingEl.className = "msg bot"; typingEl.textContent = ""; botEl = typingEl; }
              botContent += ev.content;
              botEl.textContent = botContent;
              scrollToBottom();
            } else if (ev.type === "done") {
              if (ev.conversation_id) convId(ev.conversation_id);
            } else if (ev.type === "error") {
              if (botEl) botEl.textContent = "⚠️ " + ev.error;
            }
          } catch (_) {}
        }

        if (xhr.readyState === 4) {
          isStreaming = false;
          sendBtn.disabled = false;
          scrollToBottom();
        }
      };

      xhr.send(JSON.stringify({ message: text, conversation_id: convId() }));
    }

    function appendMessage(cls, text) {
      var el = document.createElement("div");
      el.className = "msg " + cls;
      el.textContent = text;
      messagesEl.appendChild(el);
      scrollToBottom();
      return el;
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function showCapNotice() {
      capReached = true;
      inputField.disabled = true;
      sendBtn.disabled = true;
      var notice = document.createElement("div");
      notice.id = "cap-notice";
      notice.innerHTML = "You've reached the free message limit. " +
        '<a href="https://app.chatcraft.ai/register" target="_blank">Sign up free</a> to continue.';
      var inputArea = shadow.getElementById("input-area");
      panel.insertBefore(notice, inputArea);
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    if (TYPE === "voice") {
      fetchConfig(function (err, cfg) {
        if (err) { console.warn("[ChatCraft] Failed to load config:", err); return; }
        buildVoiceLauncher(cfg);
      });
    } else {
      fetchConfig(function (err, cfg) {
        if (err) { console.warn("[ChatCraft] Failed to load config:", err); return; }
        buildWidget(cfg);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
