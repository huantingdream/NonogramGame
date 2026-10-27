import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getApi, getCurrentUser, onAuthChange, displayNameForUser } from '../core/api.js';
import { bindAuthModal, openAuthModal } from '../core/account.js';
import { showToast } from '../core/utils.js';
import { Modal } from './Modal.jsx';
export function useUser() { return useSyncExternalStore(onAuthChange, getCurrentUser); }
export function AccountButton() {
  const user = useUser();
  return <button className={`topbar-button account-button ${user ? 'is-signed-in' : ''}`} id="accountButton" onClick={() => openAuthModal()}><span className="account-dot" aria-hidden="true"/><span id="accountButtonLabel">{user ? displayNameForUser(user) : '登录'}</span></button>;
}
export function Account() {
  const user = useUser();
  const [open, setOpen] = useState(false), [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const afterLogin = useRef(null);
  useEffect(() => bindAuthModal(callback => { afterLogin.current = callback; setMessage(''); setOpen(true); }), []);
  const registering = mode === 'register';
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true); setMessage(registering ? '正在创建账号…' : '正在登录…');
    try {
      await getApi()[registering ? 'register' : 'login'](data);
      form.reset(); setOpen(false); setMessage(''); showToast(registering ? '账号创建成功' : '登录成功');
      const callback = afterLogin.current; afterLogin.current = null; callback?.();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setMessage('');
    try { await getApi().logout(); setOpen(false); showToast('已退出登录'); } catch(error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <Modal open={open} onClose={() => setOpen(false)} id="authModal" className="auth-modal">
    <button className="modal-close" data-close-auth aria-label="关闭" onClick={() => setOpen(false)}>×</button>
    {!user ? <div id="signedOutPanel"><span className="modal-kicker">PLAYER ACCOUNT</span><h2 id="authTitle">{registering ? '创建玩家账号' : '登录'}</h2>
      <div className="auth-mode-switch" role="tablist" aria-label="登录或注册">{['login','register'].map(value => <button type="button" role="tab" aria-selected={mode === value} data-auth-mode={value} key={value} disabled={busy} onClick={() => { setMode(value); setMessage(''); }}>{value === 'login' ? '登录' : '注册'}</button>)}</div>
      <form id="authForm" onSubmit={submit}>
        <label className="form-field" id="nicknameField" hidden={!registering}><span>排行榜昵称</span><input id="nicknameInput" name="nickname" minLength={1} maxLength={20} autoComplete="nickname" required={registering} placeholder="1–20 个字符" disabled={busy}/></label>
        <label className="form-field"><span>邮箱</span><input id="emailInput" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="name@example.com" disabled={busy}/></label>
        <label className="form-field"><span>密码</span><input id="passwordInput" name="password" type="password" minLength={registering ? 8 : 6} maxLength={128} autoComplete={registering ? 'new-password' : 'current-password'} required placeholder={registering ? '至少 8 位' : '请输入原有密码'} disabled={busy}/></label>
        <p className="form-message" id="authMessage" role="status" aria-live="polite">{message}</p>
        <button className="primary-button" id="authSubmitButton" type="submit" disabled={busy}>{busy ? '请稍候…' : registering ? '创建账号' : '登录'}</button>
        <p className="network-hint">已有账号可继续使用原邮箱和密码登录。</p>
      </form>
    </div> : <div className="signed-in-panel" id="signedInPanel"><span className="modal-kicker">PLAYER ACCOUNT</span><div className="account-avatar" id="accountAvatar">{displayNameForUser(user).slice(0,1)}</div><h2 id="accountName">{displayNameForUser(user)}</h2><p id="accountEmail">{user.email}</p><p role="status">{message}</p><button id="signOutButton" className="secondary-button danger-button" disabled={busy} onClick={logout}>退出登录</button></div>}
  </Modal>;
}
