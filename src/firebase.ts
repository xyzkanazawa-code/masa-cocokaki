import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// Firebase のWeb設定は公開して問題ない値（アクセス制御は firestore.rules で行う）
const firebaseConfig = {
  apiKey: 'AIzaSyCiy9wKz2lwkpyE1Twv2drDgNXXmRx2vrA',
  authDomain: 'masa-cocokaki.firebaseapp.com',
  projectId: 'masa-cocokaki',
  storageBucket: 'masa-cocokaki.firebasestorage.app',
  messagingSenderId: '113160735963',
  appId: '1:113160735963:web:1fa83b2e1d641c33ecd0fe',
};

export const TEAM_ID = 'main';

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
