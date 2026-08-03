import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { APP_NAME } from "@/lib/constants";

const PLATFORM_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const hdrs = await headers();
  const agencyThemeRaw = hdrs.get("x-agency-theme");
  const agencyTheme = agencyThemeRaw ? JSON.parse(agencyThemeRaw) : null;

  const primaryColour = agencyTheme?.primaryColour ?? "#4F46E5";
  const agencyName = agencyTheme?.name ?? APP_NAME;

  // Determine the base URL for widget iframes — use current host so agency
  // custom domains serve their own themed iframes.
  const host = hdrs.get("host") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : PLATFORM_URL;

  const js = `
(function() {
  "use strict";

  var CHATCRAFT_BASE = ${JSON.stringify(baseUrl)};
  var AGENCY_NAME = ${JSON.stringify(agencyName)};
  var BRAND_COLOUR = ${JSON.stringify(primaryColour)};

  function initWidget(token, opts) {
    opts = opts || {};
    var position = opts.position || "bottom-right";
    var isRight  = position.indexOf("right") > -1;
    var isBottom = position.indexOf("bottom") > -1;

    // ── Bubble button ──────────────────────────────────────────────────────
    var btn = document.createElement("button");
    btn.id = "chatcraft-bubble";
    btn.setAttribute("aria-label", "Open " + AGENCY_NAME + " chat");
    btn.setAttribute("title",      "Open " + AGENCY_NAME + " chat");
    btn.style.cssText = [
      "position:fixed",
      isBottom ? "bottom:24px" : "top:24px",
      isRight  ? "right:24px"  : "left:24px",
      "z-index:2147483646",
      "width:56px",
      "height:56px",
      "border-radius:50%",
      "background:" + BRAND_COLOUR,
      "border:none",
      "cursor:pointer",
      "box-shadow:0 4px 16px rgba(0,0,0,0.2)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "transition:transform 0.15s ease",
    ].join(";");
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72A7.947 7.947 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>';

    // ── Chat iframe container ──────────────────────────────────────────────
    var container = document.createElement("div");
    container.id = "chatcraft-container";
    container.style.cssText = [
      "position:fixed",
      isBottom ? "bottom:92px" : "top:92px",
      isRight  ? "right:20px"  : "left:20px",
      "z-index:2147483645",
      "width:380px",
      "height:580px",
      "max-width:calc(100vw - 40px)",
      "max-height:calc(100vh - 120px)",
      "border-radius:16px",
      "overflow:hidden",
      "box-shadow:0 8px 40px rgba(0,0,0,0.18)",
      "display:none",
      "flex-direction:column",
    ].join(";");

    var iframe = document.createElement("iframe");
    iframe.src = CHATCRAFT_BASE + "/widgets/" + token;
    iframe.title = AGENCY_NAME + " chat";
    iframe.setAttribute("aria-label", AGENCY_NAME + " chat window");
    iframe.setAttribute("allow", "microphone *");
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;background:transparent";
    container.appendChild(iframe);

    // ── Open/close ────────────────────────────────────────────────────────
    var open = false;
    function toggle() {
      open = !open;
      container.style.display = open ? "flex" : "none";
      btn.style.transform = open ? "rotate(45deg)" : "rotate(0deg)";
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    btn.addEventListener("click", toggle);

    document.body.appendChild(container);
    document.body.appendChild(btn);
  }

  // ── Auto-init from data attributes ────────────────────────────────────────
  var script = document.currentScript || (function() {
    var scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1];
  })();
  var token    = script && script.getAttribute("data-token");
  var position = script && script.getAttribute("data-position");
  if (token) initWidget(token, { position: position });

  // ── Global API ────────────────────────────────────────────────────────────
  window.ChatCraft = { init: initWidget };
})();
`;

  return new NextResponse(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
