// Launches Chromium whose pages are already signed in (the app asks for a user name and password).
export async function launchUnlocked(chromium) {
  const browser = await chromium.launch({ channel: 'chromium' });
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (opts) => {
    const ctx = await newContext(opts);
    await ctx.addInitScript(() => { try { localStorage.setItem('spj.signedin.v1', JSON.stringify('SPJ')); } catch {} });
    return ctx;
  };
  browser.newPage = async (opts) => (await browser.newContext(opts)).newPage();
  return browser;
}
