const targets = await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json());
const target = targets.find((item) => item.type === "page" && item.url.startsWith("https://web.whatsapp.com"));
if (!target) throw new Error("WhatsApp CDP target not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const requests = new Map();
let commandId = 0;
let lastUiState = "";

function send(method, params = {}) {
  socket.send(JSON.stringify({ id: ++commandId, method, params }));
}

function stamp() {
  return new Date().toLocaleTimeString("ru-RU", { hour12: false });
}

function log(kind, value) {
  process.stdout.write(`${stamp()} ${kind} ${value}\n`);
}

socket.addEventListener("open", () => {
  send("Runtime.enable");
  send("Log.enable");
  send("Network.enable");
  send("Runtime.evaluate", {
    expression: `(() => {
      if (window.__gpbCdpClickMonitor) return;
      window.__gpbCdpClickMonitor = true;
      document.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target.closest("button, [role=button], input, select, [data-testid]") : null;
        if (!target) return;
        console.debug("[CDP CLICK]", JSON.stringify({
          text: (target.textContent || target.getAttribute("aria-label") || target.getAttribute("title") || "").trim().replace(/\\s+/g, " ").slice(0, 180),
          className: String(target.className || "").slice(0, 180),
          disabled: Boolean(target.disabled)
        }));
      }, true);
    })()`
  });
  log("[READY]", "WhatsApp click/network/UI monitor attached");
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const params = message.params ?? {};

  if (message.method === "Network.requestWillBeSent") {
    const request = params.request;
    if (!request?.url?.includes("bokingww.onrender.com")) return;
    requests.set(params.requestId, { method: request.method, startedAt: Date.now(), url: request.url });
    log("[API→]", `${request.method} ${request.url.replace("https://bokingww.onrender.com", "")}`);
    return;
  }

  if (message.method === "Network.responseReceived") {
    const request = requests.get(params.requestId);
    if (!request) return;
    const duration = Date.now() - request.startedAt;
    log("[API←]", `${params.response.status} ${duration}ms ${request.method} ${request.url.replace("https://bokingww.onrender.com", "")}`);
    return;
  }

  if (message.method === "Network.loadingFailed") {
    const request = requests.get(params.requestId);
    if (!request) return;
    log("[API×]", `${Date.now() - request.startedAt}ms ${request.method} ${request.url} ${params.errorText || ""}`);
    return;
  }

  if (message.method === "Runtime.exceptionThrown") {
    log("[JS×]", params.exceptionDetails?.text || "Unhandled exception");
    return;
  }

  if (message.method === "Log.entryAdded" && params.entry?.level === "error") {
    log("[LOG×]", `${params.entry.text} ${params.entry.url || ""}`.trim());
    return;
  }

  if (message.method === "Runtime.consoleAPICalled") {
    const values = (params.args ?? []).map((item) => item.value ?? item.description ?? "").filter(Boolean);
    if (values.some((value) => String(value).includes("[GPB") || String(value).includes("[CDP CLICK]"))) {
      log("[UI]", values.join(" "));
    }
  }
});

const stateTimer = setInterval(() => {
  send("Runtime.evaluate", {
    expression: `JSON.stringify({
      activeChat: document.querySelector("#main header")?.innerText?.trim().replace(/\\s+/g, " ").slice(0, 160) || "",
      overlays: [...document.querySelectorAll('[class*="gpb-"]')].filter((element) => {
        const name = String(element.className || "");
        return /overlay|modal|backdrop/.test(name) && getComputedStyle(element).display !== "none";
      }).map((element) => ({
        className: String(element.className || "").slice(0, 120),
        text: (element.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 220)
      })).slice(0, 8),
      statuses: [...document.querySelectorAll(".gpb-wa-chat-status-badge")].map((element) => (element.textContent || "").trim()).filter(Boolean).slice(0, 20)
    })`,
    returnByValue: true
  });
}, 1000);

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const value = message.id && message.result?.result?.value;
  if (typeof value !== "string" || !value.startsWith("{")) return;
  if (value === lastUiState) return;
  lastUiState = value;
  log("[STATE]", value);
});

function stop() {
  clearInterval(stateTimer);
  socket.close();
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
