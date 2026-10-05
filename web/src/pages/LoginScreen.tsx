import { useEffect, useState } from 'react';
import { checkLogin, savedUser, setUnlocked } from '../lib/auth';
import { ShopLogo } from '../components/ShopLogo';
import { keyFor, shopOfUser } from '../lib/shop';
import { load } from '../lib/storage';

export function LoginScreen({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState(savedUser); // the user name is remembered on this device
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  // Before signing in nothing says which shop this is (not on the page, not in the tab title).
  useEffect(() => { const t = document.title; document.title = 'Sign in'; return () => { document.title = t; }; }, []);

  const shop = shopOfUser(user);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkLogin(user, pass)) {
      setUnlocked(true, user);
      onDone();
    } else setError('User name or password is not correct.');
  };

  return (
    <div className="login" data-testid="login-screen">
      <form className="login-card" onSubmit={submit}>
        {/* Nothing says which shop this is until the whole user name is typed: the letters show in gold, and the
            shop's logo appears only when they match a registered shop. */}
        <div className="login-mark" data-testid="login-mark" aria-live="polite">
          {shop
            ? <ShopLogo size={84} shop={shop} logoData={load<{ logoData?: string }>(keyFor(shop, 'settings.v1'), {}).logoData} name={shop === 'KJ' ? 'Kashi Jewellers' : 'S.P. Jewellers'} />
            : <span className="login-letters" data-testid="login-letters">{user.trim().toUpperCase()}</span>}
        </div>
        <h1>Sign in</h1>
        <label className="field">
          <span className="field-label">User name</span>
          <span className="field-box"><input value={user} onChange={(e) => { setUser(e.target.value); setError(''); }} autoComplete="username" autoCapitalize="characters" data-testid="login-user" /></span>
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <span className="field-box"><input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setError(''); }} autoComplete="current-password" autoFocus={!!user} data-testid="login-pass" /></span>
        </label>
        {error && <p className="err small" role="alert" data-testid="login-error">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" data-testid="login-submit">Sign in</button>
      </form>
    </div>
  );
}
