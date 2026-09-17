import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDuSbs9Gp0SKGLMJLSYpnaRFy9bZyaTY08",
  authDomain: "nonogram-9d316.firebaseapp.com",
  projectId: "nonogram-9d316",
  storageBucket: "nonogram-9d316.firebasestorage.app",
  messagingSenderId: "340361200593",
  appId: "1:340361200593:web:3a6df9cb8007cf7d6a56f0",
  measurementId: "G-2S6XJKCXSF"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function publicUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || ""
  };
}

function notifyAuth(user) {
  window.dispatchEvent(new CustomEvent("nonogram-auth-changed", { detail: publicUser(user) }));
}

const api = {
  getCurrentUser() {
    return publicUser(auth.currentUser);
  },

  async register({ email, password, nickname }) {
    const cleanNickname = nickname.trim();
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(credential.user, { displayName: cleanNickname });
    await credential.user.reload();
    await credential.user.getIdToken(true);
    notifyAuth(auth.currentUser);
    return publicUser(auth.currentUser);
  },

  async login({ email, password }) {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return publicUser(credential.user);
  },

  async logout() {
    await signOut(auth);
  },

  async submitScore(score) {
    const user = auth.currentUser;
    if (!user) throw Object.assign(new Error("需要先登录"), { code: "auth-required" });

    const scoreId = `${user.uid}_${score.size}_${score.difficulty}_${score.puzzleSeed}`;
    const scoreRef = doc(db, "scores", scoreId);
    const existing = await getDoc(scoreRef);
    if (existing.exists()) return { duplicate: true };

    const nickname = (user.displayName || `玩家${user.uid.slice(0, 6)}`).slice(0, 20);
    await setDoc(scoreRef, {
      uid: user.uid,
      nickname,
      size: score.size,
      difficulty: score.difficulty,
      elapsedSeconds: score.elapsedSeconds,
      puzzleId: score.puzzleId,
      puzzleSeed: score.puzzleSeed,
      createdAt: serverTimestamp()
    });
    return { duplicate: false };
  },

  async loadLeaderboard({ size, difficulty }) {
    if (!auth.currentUser) throw Object.assign(new Error("需要先登录"), { code: "auth-required" });
    const scoresQuery = query(
      collection(db, "scores"),
      where("size", "==", size),
      where("difficulty", "==", difficulty),
      orderBy("elapsedSeconds", "asc"),
      orderBy("createdAt", "asc"),
      limit(20)
    );
    const snapshot = await getDocs(scoresQuery);
    return snapshot.docs.map((scoreDoc) => {
      const data = scoreDoc.data();
      return {
        nickname: data.nickname,
        elapsedSeconds: data.elapsedSeconds,
        puzzleId: data.puzzleId
      };
    });
  }
};

window.nonogramFirebase = api;
window.dispatchEvent(new CustomEvent("nonogram-firebase-ready"));
onAuthStateChanged(auth, notifyAuth);
