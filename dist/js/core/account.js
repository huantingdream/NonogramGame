// 账号弹窗与登录状态 UI（所有游戏共享）。

import { showToast } from "./utils.js";
import { getFirebase, getCurrentUser, onAuthChange, displayNameForUser } from "./firebase.js";

let authMode = "login";
let afterLogin = null;

function els() {
  return {
    modal: document.querySelector("#authModal"),
    accountButton: document.querySelector("#accountButton"),
    accountButtonLabel: document.querySelector("#accountButtonLabel"),
    signedOutPanel: document.querySelector("#signedOutPanel"),
    signedInPanel: document.querySelector("#signedInPanel"),
    authTitle: document.querySelector("#authTitle"),
    authForm: document.querySelector("#authForm"),
    authMessage: document.querySelector("#authMessage"),
    authSubmitButton: document.querySelector("#authSubmitButton"),
    nicknameField: document.querySelector("#nicknameField"),
    nicknameInput: document.querySelector("#nicknameInput"),
    emailInput: document.querySelector("#emailInput"),
    passwordInput: document.querySelector("#passwordInput"),
    accountName: document.querySelector("#accountName"),
    accountEmail: document.querySelector("#accountEmail"),
    accountAvatar: document.querySelector("#accountAvatar")
  };
}

function updateAccountUi() {
  const dom = els();
  const user = getCurrentUser();
  dom.accountButton.classList.toggle("is-signed-in", Boolean(user));
  dom.accountButtonLabel.textContent = user ? displayNameForUser(user) : "登录";
  dom.signedOutPanel.hidden = Boolean(user);
  dom.signedInPanel.hidden = !user;

  if (user) {
    const displayName = displayNameForUser(user);
    dom.accountName.textContent = displayName;
    dom.accountEmail.textContent = user.email;
    dom.accountAvatar.textContent = displayName.slice(0, 1).toUpperCase();
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const dom = els();
  const registering = mode === "register";
  dom.authTitle.textContent = registering ? "创建玩家账号" : "登录";
  dom.nicknameField.hidden = !registering;
  dom.nicknameInput.required = registering;
  dom.passwordInput.autocomplete = registering ? "new-password" : "current-password";
  dom.authSubmitButton.textContent = registering ? "创建账号" : "登录";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.setAttribute("aria-selected", button.dataset.authMode === mode ? "true" : "false");
  });
  dom.authMessage.textContent = "";
}

function authErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "这个邮箱已经注册，可以直接登录。",
    "auth/invalid-credential": "邮箱或密码不正确。",
    "auth/invalid-email": "邮箱格式不正确。",
    "auth/weak-password": "密码至少需要 6 位。",
    "auth/too-many-requests": "尝试次数过多，请稍后再试。",
    "auth/network-request-failed": "网络连接失败，请检查网络后重试。"
  };
  return messages[error?.code] || "操作失败，请稍后再试。";
}

export function openAuthModal(onSuccess = null) {
  if (!getFirebase()) {
    showToast("登录服务正在连接，请稍后再试");
    return false;
  }
  afterLogin = onSuccess;
  updateAccountUi();
  els().modal.showModal();
  return true;
}

export function initAccount() {
  const dom = els();

  dom.accountButton.addEventListener("click", () => openAuthModal());
  document.querySelectorAll("[data-close-auth]").forEach((button) => {
    button.addEventListener("click", () => dom.modal.close());
  });
  dom.modal.addEventListener("click", (event) => {
    if (event.target === dom.modal) dom.modal.close();
  });

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  });

  dom.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const firebase = getFirebase();
    if (!firebase) {
      dom.authMessage.textContent = "登录服务暂时不可用，请稍后再试。";
      return;
    }
    const email = dom.emailInput.value;
    const password = dom.passwordInput.value;
    const nickname = dom.nicknameInput.value.trim();
    if (authMode === "register" && (nickname.length < 1 || nickname.length > 20)) {
      dom.authMessage.textContent = "昵称需要 1–20 个字符。";
      return;
    }
    dom.authSubmitButton.disabled = true;
    dom.authMessage.textContent = authMode === "register" ? "正在创建账号…" : "正在登录…";
    try {
      if (authMode === "register") await firebase.register({ email, password, nickname });
      else await firebase.login({ email, password });
      dom.authMessage.textContent = "";
      dom.modal.close();
      showToast(authMode === "register" ? "账号创建成功" : "登录成功");
      if (typeof afterLogin === "function") {
        const callback = afterLogin;
        afterLogin = null;
        window.setTimeout(callback, 120);
      }
    } catch (error) {
      dom.authMessage.textContent = authErrorMessage(error);
    } finally {
      dom.authSubmitButton.disabled = false;
    }
  });

  document.querySelector("#signOutButton").addEventListener("click", async () => {
    try {
      await getFirebase()?.logout();
      dom.modal.close();
      showToast("已退出登录");
    } catch (_) {
      showToast("退出失败，请稍后重试");
    }
  });

  onAuthChange(updateAccountUi);
  updateAccountUi();
}
