import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBz8lqr4lNMPw3h7K7co1ngB1ON1G3KVK4",
  authDomain: "nocen-attendtrack.firebaseapp.com",
  projectId: "nocen-attendtrack",
  storageBucket: "nocen-attendtrack.firebasestorage.app",
  messagingSenderId: "281211369154",
  appId: "1:281211369154:web:368f076007da458a6ded5b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
