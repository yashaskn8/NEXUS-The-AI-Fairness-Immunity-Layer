import { initializeApp, getApps } from "firebase/app";
import { getFirestore, connectFirestoreEmulator,
         collection, query, where, orderBy, limit,
         onSnapshot, getDocs, doc, getDoc, addDoc,
         serverTimestamp, Timestamp } from "firebase/firestore";
import { getAuth, connectAuthEmulator,
         signInWithPopup, GoogleAuthProvider,
         onAuthStateChanged, signOut } from "firebase/auth";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "demo-api-key",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "nexus-platform.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "nexus-platform",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "nexus-platform.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "1:000000000:web:000000000",
};

const app  = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);

if (import.meta.env.VITE_USE_EMULATORS === "true") {
  try {
    connectFirestoreEmulator(db, "localhost", 9090);
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectStorageEmulator(storage, "localhost", 9199);
  } catch { /* already connected */ }
}

export const googleProvider = new GoogleAuthProvider();
export { collection, query, where, orderBy, limit,
         onSnapshot, getDocs, doc, getDoc, addDoc,
         serverTimestamp, Timestamp, signInWithPopup, signOut,
         onAuthStateChanged };
