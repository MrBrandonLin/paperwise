async function openPanel(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

chrome.action.onClicked.addListener(tab => { if (tab.id) openPanel(tab.id); });

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'paperwise-open' && sender.tab?.id) openPanel(sender.tab.id);
});
