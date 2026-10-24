chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
let scannedTab = null;
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !['scan', 'fill'].includes(message.type)) return;
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Open an ordinary website, then click the Paperwise browser icon. Browser settings and store pages cannot be read.');
    if (message.type === 'fill' && (scannedTab?.id !== tab.id || scannedTab?.url !== tab.url)) throw new Error('The active page changed. Scan this page again before filling.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const result = await chrome.tabs.sendMessage(tab.id, message);
    if (message.type === 'scan') scannedTab = { id: tab.id, url: tab.url };
    return result;
  })().then(respond).catch(error => respond({ error: error.message }));
  return true;
});
