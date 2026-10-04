import { useState } from 'react';
import { checkPassword } from '../lib/auth';
import { useBackLayer } from '../lib/backStack';

/** Blurred cover that asks for the app password again (shown after leaving the Gallery). */
export function AppLock({ onUnlock, onGallery }: { onUnlock: () => void; onGallery: () => void }) {
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  useBackLayer(true, () => undefined); // Back cannot dodge the lock
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkPassword(pass)) onUnlock();
    else setError('Password is not correct.');
  };
  return (
    <div className="app-lock" role="dialog" aria-modal="true" aria-label="App lock" data-testid="app-lock">
      <form className="login-card" onSubmit={submit}>
        <h1>App locked</h1>
        <label className="field">
          <span className="field-label">Password</span>
          <span className="field-box"><input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setError(''); }} autoComplete="current-password" autoFocus data-testid="lock-pass" /></span>
        </label>
        {error && <p className="err small" role="alert" data-testid="lock-error">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" data-testid="lock-submit">Unlock</button>
        <button className="btn btn-plain btn-block" type="button" onClick={onGallery} data-testid="lock-gallery">Back to Gallery</button>
      </form>
    </div>
  );
}
