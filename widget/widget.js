/**
 * ChatCraft AI — Embeddable Widget
 * Drop-in, zero-dependency chat widget for any website.
 *
 * Usage:
 *   <script src="https://cdn.chatcraft.ai/widget.js"
 *     data-chatbot-id="<uuid>"
 *     data-widget-token="<embed_token>"
 *     data-position="bottom-right">   <!-- optional: bottom-left | top-right | top-left -->
 *   </script>
 */
(function () {
  "use strict";

  // ── Config from script tag ────────────────────────────────────────────────
  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var CHATBOT_ID = currentScript.getAttribute("data-chatbot-id");
  var WIDGET_TOKEN = currentScript.getAttribute("data-widget-token");
  var POSITION = currentScript.getAttribute("data-position") || "bottom-right";
  var API_BASE = currentScript.getAttribute("data-api-base") || "https://api.chatcraft.ai";

  if (!CHATBOT_ID || !WIDGET_TOKEN) {
    console.warn("[ChatCraft] Missing data-chatbot-id or data-widget-token.");
    return;
  }

  // ── Constants ─────────────────────────────────────────────────────────────
  var GUEST_KEY = "chatcraft_guest_id_" + CHATBOT_ID;
  var CONV_KEY = "chatcraft_conv_id_" + CHATBOT_ID;

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

  // ── Position helpers ──────────────────────────────────────────────────────
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

  // ── Load config from API ──────────────────────────────────────────────────
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

  // ── Build Shadow DOM ──────────────────────────────────────────────────────
  function buildWidget(cfg) {
    var host = document.createElement("div");
    host.id = "chatcraft-widget-host";
    host.style.cssText = "position:fixed;" + positionCSS(POSITION) + "z-index:2147483647;font-family:inherit;";
    document.body.appendChild(host);

    var shadow = host.attachShadow({ mode: "open" });

    var bubbleRadius = cfg.bubble_style === "pill" ? "9999px" : cfg.bubble_style === "square" ? "4px" : "12px";
    var isDark = cfg.dark_mode;
    var bg = isDark ? "#18181b" : cfg.background_colour;
    var textColor = isDark ? "#f4f4f5" : "#09090b";
    var mutedColor = isDark ? "#a1a1aa" : "#71717a";
    var inputBg = isDark ? "#27272a" : "#f4f4f5";
    var borderColor = isDark ? "#3f3f46" : "#e4e4e7";

    var css = [
      ":host { all: initial; font-family: '" + cfg.font_family + "', system-ui, sans-serif; }",
      "*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }",

      // Bubble button
      "#bubble { width:56px; height:56px; border-radius:50%; border:none; cursor:pointer;",
      "  background:" + cfg.primary_colour + "; color:#fff; font-size:24px; display:flex;",
      "  align-items:center; justify-content:center; box-shadow:0 4px 16px rgba(0,0,0,.2);",
      "  transition:transform .15s ease, box-shadow .15s ease; }",
      "#bubble:hover { transform:scale(1.07); box-shadow:0 6px 20px rgba(0,0,0,.25); }",
      "#bubble svg { pointer-events:none; }",

      // Panel
      "#panel { position:fixed; " + panelPositionCSS(POSITION),
      "  width:360px; height:540px; background:" + bg + "; border:1px solid " + borderColor + ";",
      "  border-radius:16px; box-shadow:0 8px 32px rgba(0,0,0,.15); display:flex; flex-direction:column;",
      "  overflow:hidden; transform-origin:bottom right; transition:opacity .2s ease, transform .2s ease;",
      "  opacity:0; transform:scale(.95) translateY(8px); pointer-events:none; }",
      "#panel.open { opacity:1; transform:scale(1) translateY(0); pointer-events:all; }",

      // Header
      "#header { background:" + cfg.primary_colour + "; padding:12px 14px; display:flex; align-items:center; gap:10px; }",
      "#header-name { color:#fff; font-weight:600; font-size:14px; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
      "#close-btn { background:none; border:none; cursor:pointer; color:rgba(255,255,255,.8); font-size:18px; line-height:1; padding:2px 4px; }",
      "#close-btn:hover { color:#fff; }",
      "#logo-img { width:28px; height:28px; border-radius:50%; object-fit:cover; }",
      "#logo-placeholder { width:28px; height:28px; border-radius:50%; background:rgba(255,255,255,.2); }",
      "#online-dot { width:8px; height:8px; border-radius:50%; background:#4ade80; flex-shrink:0; }",

      // Messages
      "#messages { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }",
      "#messages::-webkit-scrollbar { width:4px; }",
      "#messages::-webkit-scrollbar-thumb { background:" + borderColor + "; border-radius:2px; }",

      // Bubbles
      ".msg { max-width:78%; padding:8px 12px; font-size:13px; line-height:1.5; word-break:break-word; }",
      ".msg.user { align-self:flex-end; background:" + cfg.primary_colour + "; color:#fff; border-radius:" + bubbleRadius + "; }",
      ".msg.bot  { align-self:flex-start; background:" + inputBg + "; color:" + textColor + "; border-radius:" + bubbleRadius + "; }",
      ".msg.typing { color:" + mutedColor + "; font-style:italic; }",

      // Welcome
      "#welcome { color:" + mutedColor + "; font-size:12px; text-align:center; padding:8px 0 4px; }",

      // Sign-up prompt
      "#cap-notice { margin:8px 12px; background:" + (isDark ? "#3f3f46" : "#fef9c3") + ";",
      "  color:" + textColor + "; border-radius:8px; padding:10px 12px; font-size:12px; text-align:center; }",
      "#cap-notice a { color:" + cfg.primary_colour + "; font-weight:600; text-decoration:none; }",

      // Input area
      "#input-area { display:flex; align-items:center; gap:8px; padding:10px 12px; border-top:1px solid " + borderColor + "; }",
      "#input-field { flex:1; border:1px solid " + borderColor + "; border-radius:9999px; padding:8px 14px;",
      "  font-size:13px; background:" + inputBg + "; color:" + textColor + "; outline:none; font-family:inherit; }",
      "#input-field::placeholder { color:" + mutedColor + "; }",
      "#input-field:focus { border-color:" + cfg.primary_colour + "; }",
      "#send-btn { width:36px; height:36px; border-radius:50%; border:none; cursor:pointer;",
      "  background:" + cfg.primary_colour + "; color:#fff; font-size:16px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }",
      "#send-btn:disabled { opacity:.5; cursor:not-allowed; }",

      // Branding footer
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

    shadow.innerHTML = [
      '<style>' + css + '</style>',

      // Floating bubble
      '<button id="bubble" aria-label="Open chat">',
      '  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
      '    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      '  </svg>',
      '</button>',

      // Chat panel
      '<div id="panel" role="dialog" aria-label="Chat with ' + _escape(cfg.name) + '">',
      '  <div id="header">',
      '    ' + logoHTML,
      '    <span id="header-name">' + _escape(cfg.name) + '</span>',
      '    <span id="online-dot"></span>',
      '    <button id="close-btn" aria-label="Close chat">&#x2715;</button>',
      '  </div>',
      '  <div id="messages">' + welcomeHTML + '</div>',
      '  <div id="input-area">',
      '    <input id="input-field" type="text" placeholder="' + _escape(cfg.placeholder_text) + '" autocomplete="off" />',
      '    <button id="send-btn" aria-label="Send">&#x2191;</button>',
      '  </div>',
      '  ' + brandingHTML,
      '</div>',
    ].join("\n");

    // ── Wire up events ──────────────────────────────────────────────────────
    var bubble = shadow.getElementById("bubble");
    var panel = shadow.getElementById("panel");
    var closeBtn = shadow.getElementById("close-btn");
    var inputField = shadow.getElementById("input-field");
    var sendBtn = shadow.getElementById("send-btn");
    var messagesEl = shadow.getElementById("messages");

    var isOpen = false;
    var isStreaming = false;
    var capReached = false;

    function toggle() {
      isOpen = !isOpen;
      if (isOpen) {
        panel.classList.add("open");
        setTimeout(function () { inputField.focus(); }, 200);
        bubble.innerHTML = [
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">',
          '  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
          '</svg>',
        ].join("");
      } else {
        panel.classList.remove("open");
        bubble.innerHTML = [
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
          '  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
          '</svg>',
        ].join("");
      }
    }

    bubble.addEventListener("click", toggle);
    closeBtn.addEventListener("click", toggle);

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

      var body = JSON.stringify({
        message: text,
        conversation_id: convId(),
      });

      var xhr = new XMLHttpRequest();
      xhr.open("POST", API_BASE + "/api/widget/" + CHATBOT_ID + "/chat");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("X-Widget-Token", WIDGET_TOKEN);
      xhr.setRequestHeader("X-Guest-ID", guestId());

      var buffer = "";
      var botContent = "";
      var botEl = null;

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
          typingEl.textContent = "Something went wrong. Please try again.";
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
              if (!botEl) {
                typingEl.className = "msg bot";
                typingEl.textContent = "";
                botEl = typingEl;
              }
              botContent += ev.content;
              botEl.textContent = botContent;
              scrollToBottom();
            } else if (ev.type === "done") {
              if (ev.conversation_id) convId(ev.conversation_id);
            } else if (ev.type === "error") {
              if (botEl) { botEl.textContent = "Error: " + ev.error; }
            }
          } catch (_) {}
        }

        if (xhr.readyState === 4) {
          isStreaming = false;
          sendBtn.disabled = false;
          scrollToBottom();
        }
      };

      xhr.send(body);
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

  function _escape(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    fetchConfig(function (err, cfg) {
      if (err) { console.warn("[ChatCraft] Failed to load config:", err); return; }
      buildWidget(cfg);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
