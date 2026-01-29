import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC3hAHfZFH6g4SjQbwdFIh-V61wezsoDnY",
  authDomain: "reservation-e033a.firebaseapp.com",
  projectId: "reservation-e033a",
  storageBucket: "reservation-e033a.firebasestorage.app",
  messagingSenderId: "380110711617",
  appId: "1:380110711617:web:2c938ef843c87fc00a4fc0",
  measurementId: "G-CXXB40V1KE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const demoAccounts = {
  admin: { email: "demo-admin@reservation.local", password: "demo1234" },
  supervisor: { email: "demo-supervisor@reservation.local", password: "demo1234" },
  worker: { email: "demo-worker@reservation.local", password: "demo1234" }
};

function normalizeLoginId(value){
  if(!value) return "";
  return value.includes("@") ? value : value + "@reservation.local";
}

async function loginWithCredentials(){
  const rawId=document.getElementById("login-id").value.trim();
  const password=document.getElementById("login-password").value;
  if(!rawId||!password){alert("아이디 또는 비밀번호를 입력해주세요.");return;}
  const email=normalizeLoginId(rawId);
  try{
    await signInWithEmailAndPassword(auth,email,password);
  }catch(e){
    alert("로그인에 실패했습니다.");
  }
}

async function registerWithCredentials(){
  const name=document.getElementById("login-name").value.trim();
  const rawId=document.getElementById("login-id").value.trim();
  const password=document.getElementById("login-password").value;
  if(!name){alert("이름을 입력해주세요.");return;}
  if(!rawId||!password){alert("아이디 또는 비밀번호를 입력해주세요.");return;}
  const email=normalizeLoginId(rawId);
  try{
    const cred = await createUserWithEmailAndPassword(auth,email,password);
    await setDoc(doc(db,"users",cred.user.uid),{
      id: rawId,
      email,
      name,
      role: "worker",
      approved: false,
      createdAt: serverTimestamp()
    });
    alert("가입이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.");
    await signOut(auth);
  }catch(e){
    alert("회원가입에 실패했습니다.");
  }
}

async function loginDemo(role){
  const demo = demoAccounts[role];
  if(!demo){
    alert("데모 계정을 확인해주세요.");
    return;
  }
  try{
    await signInWithEmailAndPassword(auth,demo.email,demo.password);
  }catch(e){
    alert("데모 계정 로그인에 실패했습니다.");
  }
}

function bindEvents(){
  const loginBtn=document.getElementById("btn-login");
  if(loginBtn) loginBtn.addEventListener("click",loginWithCredentials);
  const signupBtn=document.getElementById("btn-signup");
  if(signupBtn) signupBtn.addEventListener("click",registerWithCredentials);
  document.querySelectorAll(".role-btn").forEach(btn=>btn.addEventListener("click",()=>loginDemo(btn.dataset.role)));
}

function initAuthListener(){
  onAuthStateChanged(auth, async (user)=>{
    if(!user) return;
    const snap = await getDoc(doc(db,"users",user.uid));
    if(!snap.exists()){
      await signOut(auth);
      alert("계정 정보를 찾을 수 없습니다.");
      return;
    }
    const data = snap.data();
    if(!data.approved){
      await signOut(auth);
      alert("승인 대기 중입니다.");
      return;
    }
    window.location.href = "app.html";
  });
}

bindEvents();
initAuthListener();
