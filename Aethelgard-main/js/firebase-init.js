import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import {
    getAuth,
    signInWithEmailAndPassword,
    signInAnonymously,
    signOut,
    onAuthStateChanged,
    browserLocalPersistence,
    setPersistence
  } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
  import {
    getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, getDocs
  } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyD0S4gVD5OHiztOaL6JRMmWA0grH8NkOxU",
    authDomain: "auroraenvoy.firebaseapp.com",
    projectId: "auroraenvoy",
    storageBucket: "auroraenvoy.firebasestorage.app",
    messagingSenderId: "456319814884",
    appId: "1:456319814884:web:06b046a8a1667d25ceb0f1"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // ── 把 Firebase 工具掛到 window，讓非 module 的 JS 也能用 ──
  window._fbDb = db;
  window._fbAuth = auth;
  window._fbDoc = doc;
  window._fbGetDoc = getDoc;
  window._fbSetDoc = setDoc;
  window._fbDeleteDoc = deleteDoc;
  window._fbOnSnapshot = onSnapshot;
  window._fbCollection = collection;
  window._fbGetDocs = getDocs;

  // ── Owner 登入（信箱 + 密碼）：帶持久化，下次開頁自動免登入 ──
  window._fbOwnerLogin = async function(email, password) {
    await setPersistence(auth, browserLocalPersistence);
    return signInWithEmailAndPassword(auth, email, password);
  };

  // ── 訪客匿名登入（token 驗證成功後呼叫，保持匿名身份）──
  window._fbGuestSignInAnon = async function() {
    // 若已是匿名登入，直接回傳目前 user
    if (auth.currentUser && auth.currentUser.isAnonymous) return auth.currentUser;
    const cred = await signInAnonymously(auth);
    return cred.user;
  };

  // ── Owner 強制登出所有訪客（刪除所有 /guest_access 文件）──
  window._fbRevokeAllGuests = async function() {
    try {
      const snap = await getDocs(collection(db, 'guest_access'));
      const dels = snap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(dels);
      return true;
    } catch(e) {
      console.error('[revokeAllGuests] 失敗', e);
      return false;
    }
  };

  // ── Owner 登出 ──
  window._fbOwnerSignOut = async function() {
    return signOut(auth);
  };

  // ── Auth 狀態監聽 ──
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      window._fbAuthUid = user.uid;
      let _shouldNotifyReady = true;

      if (!user.isAnonymous) {
        // ── Email 登入 → Owner ──
        if (!window._fbGuestSessionActive) {
          window._fbIsOwner = true;
          window._fbUid = user.uid;
          try { localStorage.setItem('aethelgard_fb_uid', user.uid); } catch(e) {}
          try { localStorage.setItem('aethelgard_fb_owner_uid', user.uid); } catch(e) {}
        }
      } else {
        // ── 匿名登入：只有在已有 _fbGuestSessionActive 時才視為有效訪客 ──
        // 無痕模式下 Firebase 可能自動匿名登入，但沒有通過 OTP 驗證，不應放行
        if (!window._fbGuestSessionActive) {
          window._fbIsOwner = false;
          window._fbUid = '';
          // 觸發鎖屏（未通過驗證的匿名登入）
          // 注意：不呼叫 _onFirebaseReadyCallback，避免 init() 提前 resolve 跳過驗證
          if (typeof window._onFirebaseReady === 'function') window._onFirebaseReady();
          return;
        }
        // 若 _fbGuestSessionActive，window._fbUid 已被 submitGuestToken 切換為 ownerUid，不覆寫
        // ★ guest_access/{uid} 文件還沒寫入完成前，不能放行 ready callback，
        //   否則 loadFromCloud() 會在安全規則還看不到 guest_access 的情況下被擋下來讀空。
        //   submitGuestToken() 寫完 guest_access 後會自己呼叫 ready callback，這裡先跳過即可。
        if (window._fbGuestAccessPending) {
          _shouldNotifyReady = false;
        }
      }

      if (_shouldNotifyReady) {
        if (typeof window._onFirebaseReady === 'function') window._onFirebaseReady();
        if (typeof window._onFirebaseReadyCallback === 'function') {
          window._onFirebaseReadyCallback();
        }
      }
    } else {
      // ── 未登入：顯示鎖屏 ──
      window._fbIsOwner = false;
      window._fbUid = '';
      // 注意：不呼叫 _onFirebaseReadyCallback，避免 init() 提前 resolve 跳過驗證
      if (typeof window._onFirebaseReady === 'function') window._onFirebaseReady();
    }
  });
