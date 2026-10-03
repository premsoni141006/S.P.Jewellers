// Website printing: the generated A4 document is loaded into a hidden iframe and handed to the
// browser's print dialog. That dialog is where the phone/PC lists its printers, including ones
// paired over Bluetooth or Wi-Fi. A web page cannot print silently or pick the printer itself.

export function printHtmlViaDialog(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    // Off-screen but laid out at A4 width; some browsers skip printing frames with no size.
    Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '210mm', height: '297mm', border: '0' });

    let done = false;
    const cleanup = () => setTimeout(() => frame.remove(), 1000);
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        frame.remove();
        reject(new Error('The print page could not be prepared in this browser.'));
        return;
      }
      win.addEventListener('afterprint', cleanup, { once: true });
      // Give fonts a moment to settle so the dialog's preview is final.
      setTimeout(() => {
        try {
          win.focus();
          win.print(); // blocks on desktop browsers until the dialog closes
          done = true;
          resolve();
        } catch (e) {
          frame.remove();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
        if (done) setTimeout(() => frame.remove(), 60_000);
      }, 150);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
