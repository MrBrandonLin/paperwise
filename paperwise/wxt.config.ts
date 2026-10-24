import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Tailwind v4 for the teammate's UI (side panel + in-page shadow root).
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Paperwise',
    description: 'Fill any web form by voice, in your language.',
    // scripting: inject the content script into tabs that were open before the extension loaded.
    permissions: ['sidePanel', 'tabs', 'scripting'],
    // <all_urls>: chrome.scripting needs host access (the content script's matches don't count,
    // tested in test:reach). Same install warning as the <all_urls> content script already has.
    // localhost:8787 = the backend (runs locally during the hackathon; add the deployed URL if hosted).
    host_permissions: ['<all_urls>', 'http://localhost:8787/*'],
    // Toolbar icon opens the side panel (set in background via setPanelBehavior).
    action: {},
    // Fonts for the in-page UI (loaded by the content script as bytes).
    web_accessible_resources: [{ resources: ['fonts/*.woff2'], matches: ['<all_urls>'] }],
  },
});
