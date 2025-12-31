// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Din konfiguration från Firebase-konsolen
const firebaseConfig = {
  apiKey: "AIzaSyDiwgFkBxjnmHBwAaYNvwYIxbAjw5vll3c",
  authDomain: "prastbyrankassa.firebaseapp.com",
  projectId: "prastbyrankassa",
  storageBucket: "prastbyrankassa.firebasestorage.app",
  messagingSenderId: "88797072592",
  appId: "1:88797072592:web:10cbf5162f2b3d0ee1a2d5",
  measurementId: "G-9ZYT1KQ5LL"
};

// Initiera Firebase
const app = initializeApp(firebaseConfig);

// Exportera databas-kopplingen så vi kan använda den i andra filer
export const db = getFirestore(app);