import { useState } from 'react';
import { checkLogin, setUnlocked } from '../lib/auth';

export function LoginScreen({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkLogin(user, pass)) {
      setUnlocked(true);
      onDone();
    } else setError('User name or password is not correct.');
  };

  return (
    <div className="login" data-testid="login-screen">
      <form className="login-card" onSubmit={submit}>
        <img className="home-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" width="84" height="84" />
        <h1>S.P. JEWELLERS</h1>
        <label className="field">
          <span className="field-label">User name</span>
          <span className="field-box"><input value={user} onChange={(e) => { setUser(e.target.value); setError(''); }} autoComplete="username" autoCapitalize="characters" data-testid="login-user" /></span>
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <span className="field-box"><input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setError(''); }} autoComplete="current-password" data-testid="login-pass" /></span>
        </label>
        {error && <p className="err small" role="alert" data-testid="login-error">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" data-testid="login-submit">Sign in</button>
      </form>
    </div>
  );
}
