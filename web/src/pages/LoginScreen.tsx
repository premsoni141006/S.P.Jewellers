import { useState } from 'react';
import { checkLogin, savedUser, setUnlocked } from '../lib/auth';
import { ShopLogo } from '../components/ShopLogo';
import { shopOfUser } from '../lib/shop';

export function LoginScreen({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState(savedUser); // the user name is remembered on this device
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

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
        <ShopLogo size={84} shop={shopOfUser(user) ?? 'SPJ'} name={shopOfUser(user) === 'KJ' ? 'Kashi Jewellers' : 'S.P. Jewellers'} />
        <h1>{shopOfUser(user) === 'KJ' ? 'KASHI JEWELLERS' : 'S.P. JEWELLERS'}</h1>
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
