// Print Preview: shows the PDF that the main process renders from the same HTML and page
// settings used for the printer job, so what you see is the A4 page that will come out.

import { useEffect, useState } from 'react';
import { fmtEstimateNo, renderEstimateHtml, type Estimate, type ShopSettings } from '@shared';
import { api, errorText } from '../lib/api';
import { Icon, Modal } from './ui';

export function PreviewModal({
  estimate,
  settings,
  onClose,
  onPrint,
  onToast,
}: {
  estimate: Estimate;
  settings: ShopSettings;
  onClose: () => void;
  onPrint?: () => void;
  onToast: (kind: 'ok' | 'err', text: string) => void;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    api.preview
      .pdf(estimate)
      .then((bytes) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
        setPdfUrl(url);
      })
      .catch((err) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [estimate]);

  return (
    <Modal
      wide
      title={`Print Preview — ${fmtEstimateNo(estimate.number)}`}
      onClose={onClose}
      footer={
        <>
          <span className="muted foot-note">A4 portrait · 10 mm margins · same layout as the printed page</span>
          <button
            className="btn"
            onClick={async () => {
              try {
                const r = await api.preview.savePdf(estimate);
                if (r.saved) onToast('ok', `PDF saved: ${r.path}`);
              } catch (err) {
                onToast('err', errorText(err));
              }
            }}
          >
            <Icon name="file" /> Save PDF
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {onPrint && (
            <button className="btn btn-primary" onClick={onPrint}>
              <Icon name="print" /> Print
            </button>
          )}
        </>
      }
    >
      <div className="preview-frame">
        {pdfUrl ? (
          <iframe title="Estimate preview" src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`} />
        ) : error ? (
          <>
            <div className="banner banner-warn">Could not build the PDF preview ({error}). Showing the page layout instead.</div>
            <iframe title="Estimate preview" sandbox="" srcDoc={renderEstimateHtml(estimate, { shopName: settings.shopName, shopCode: settings.shopCode })} />
          </>
        ) : (
          <div className="preview-loading">
            <div className="spinner" /> Preparing preview…
          </div>
        )}
      </div>
    </Modal>
  );
}
