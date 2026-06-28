chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GPB_CAPTURE_VISIBLE_TAB") return false;

  chrome.tabs.captureVisibleTab(undefined, { format: "jpeg", quality: 86 }, (dataUrl) => {
    const error = chrome.runtime.lastError;
    if (error || !dataUrl) {
      sendResponse({ ok: false, error: error?.message || "Не удалось сделать скриншот вкладки" });
      return;
    }
    sendResponse({ ok: true, dataUrl });
  });

  return true;
});
