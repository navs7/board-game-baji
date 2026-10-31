/* Data layer: real Firebase by default, in-memory mock with ?mock (never touches the live database). */
const useMock = new URLSearchParams(location.search).has('mock');
const m = await import(useMock ? './mock.js' : './firebase-config.js');

export const IS_MOCK = useMock;
export const {
  db, ref, set, onValue, get, push, remove,
  auth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} = m;
