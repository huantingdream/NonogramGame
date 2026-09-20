// Firebase 接入层：动态加载官方 SDK，失败时游戏本体不受影响（静默降级）。
// 成绩结构：{ game, size, difficulty, elapsedSeconds, puzzleId, puzzleSeed }

const firebaseConfig = {
  apiKey: "AIzaSyDuSbs9Gp0SKGLMJLSYpnaRFy9bZyaTY08",
  authDomain: "nonogram-9d316.firebaseapp.com",
  projectId: "nonogram-9d316",
  storageBucket: "nonogram-9d316.firebasestorage.app",
  messagingSenderId: "340361200593",
  appId: "1:340361200593:web:3a6df9cb8007cf7d6a56f0",
  measurementId: "G-2S6XJKCXSF"
};

const SDK_VERSION = "12.19.0";
const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

let api = null;
let currentUser = null;
const authListeners = new Set();

function publicUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || ""
  };
}

function notifyAuth(user) {
  currentUser = publicUser(user);
  authListeners.forEach((listener) => listener(currentUser));
}

export async function initFirebase() {
  try {
    const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
      import(`${SDK_BASE}/firebase-app.js`),
      import(`${SDK_BASE}/firebase-auth.js`),
      import(`${SDK_BASE}/firebase-firestore.js`)
    ]);

    const app = initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);
    const db = firestoreModule.getFirestore(app);

    api = {
      async register({ email, password, nickname }) {
        const cleanNickname = nickname.trim();
        const credential = await authModule.createUserWithEmailAndPassword(auth, email.trim(), password);
        await authModule.updateProfile(credential.user, { displayName: cleanNickname });
        await credential.user.reload();
        await credential.user.getIdToken(true);
        notifyAuth(auth.currentUser);
        return publicUser(auth.currentUser);
      },

      async login({ email, password }) {
        const credential = await authModule.signInWithEmailAndPassword(auth, email.trim(), password);
        return publicUser(credential.user);
      },

      async logout() {
        await authModule.signOut(auth);
      },

      async submitScore(score) {
        const user = auth.currentUser;
        if (!user) throw Object.assign(new Error("需要先登录"), { code: "auth-required" });

        const scoreId = `${user.uid}_${score.game}_${score.size}_${score.difficulty}_${score.puzzleSeed}`;
        const scoreRef = firestoreModule.doc(db, "scores", scoreId);
        const existing = await firestoreModule.getDoc(scoreRef);
        if (existing.exists()) return { duplicate: true };

        const nickname = (user.displayName || `玩家${user.uid.slice(0, 6)}`).slice(0, 20);
        await firestoreModule.setDoc(scoreRef, {
          uid: user.uid,
          nickname,
          game: score.game,
          size: score.size,
          difficulty: score.difficulty,
          elapsedSeconds: score.elapsedSeconds,
          puzzleId: score.puzzleId,
          puzzleSeed: score.puzzleSeed,
          createdAt: firestoreModule.serverTimestamp()
        });
        return { duplicate: false };
      },

      async loadLeaderboard({ game, size, difficulty }) {
        if (!auth.currentUser) throw Object.assign(new Error("需要先登录"), { code: "auth-required" });
        // 不按 game 字段过滤查询：三个游戏的 size 编码互不重叠
        // （数织 5/10/15、数独 9、扫雷 81/256/480），且改造前的旧成绩
        // 没有 game 字段，客户端把它们归到数织，保证旧成绩不丢失。
        const scoresQuery = firestoreModule.query(
          firestoreModule.collection(db, "scores"),
          firestoreModule.where("size", "==", size),
          firestoreModule.where("difficulty", "==", difficulty),
          firestoreModule.orderBy("elapsedSeconds", "asc"),
          firestoreModule.orderBy("createdAt", "asc"),
          firestoreModule.limit(20)
        );
        const snapshot = await firestoreModule.getDocs(scoresQuery);
        return snapshot.docs
          .map((scoreDoc) => {
            const data = scoreDoc.data();
            return {
              game: data.game || "nonogram", // 旧成绩没有 game 字段，属于数织
              nickname: data.nickname,
              elapsedSeconds: data.elapsedSeconds,
              puzzleId: data.puzzleId
            };
          })
          .filter((score) => score.game === game);
      }
    };

    currentUser = publicUser(auth.currentUser);
    authModule.onAuthStateChanged(auth, notifyAuth);
  } catch (error) {
    console.warn("Firebase 初始化失败，登录与排行榜已停用：", error);
    api = null;
  }
  return api;
}

export function getFirebase() {
  return api;
}

export function getCurrentUser() {
  return currentUser;
}

export function onAuthChange(listener) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

export function displayNameForUser(user) {
  if (!user) return "";
  return user.displayName || `玩家${user.uid.slice(0, 6)}`;
}
