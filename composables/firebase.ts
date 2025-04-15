import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyBIdT1rcRgxGuPbIE8o3iHellO306YXWvU",
  authDomain: "markit-e2b0e.firebaseapp.com",
  projectId: "markit-e2b0e",
  storageBucket: "markit-e2b0e.appspot.com",
  messagingSenderId: "1024139443483",
  appId: "1:1024139443483:web:df6200650e2c956c54e7be"
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
const auth = getAuth(app)

export { app, auth }
