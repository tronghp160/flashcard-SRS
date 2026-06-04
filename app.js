import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, writeBatch } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ==========================================
// CẤU HÌNH FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDoFZnLUGgRnAU52nqiMK2mVthcTJs6DS0",
  authDomain: "quizlet-srs.firebaseapp.com",
  projectId: "quizlet-srs",
  storageBucket: "quizlet-srs.firebasestorage.app",
  messagingSenderId: "698675276100",
  appId: "1:698675276100:web:fda06debca0135515e8f11",
  measurementId: "G-4MD5Z93QTR"
};

// ==========================================
// HYBRID STORAGE (Demo Mode Fallback)
// ==========================================
let db;
let isDemoMode = true;

const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY_HERE";

if (isConfigured) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    isDemoMode = false;
    document.getElementById('firebase-warning').classList.add('hidden');
    console.log("🔥 Đã kết nối với Firebase Firestore thành công!");
  } catch (error) {
    console.error("⚠️ Lỗi khởi tạo Firebase, chuyển về chế độ Demo:", error);
    isDemoMode = true;
    document.getElementById('firebase-warning').classList.remove('hidden');
  }
} else {
  isDemoMode = true;
  document.getElementById('firebase-warning').classList.remove('hidden');
}

// LocalStorage Keys
const FOLDERS_KEY = 'quizlet_srs_folders';
const SETS_KEY = 'quizlet_srs_sets';
const CARDS_KEY = 'quizlet_srs_cards';

// Local storage helper functions
function getLocalStorage(key) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function saveLocalStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// Chuyển đổi timestamp
function getReviewDate(next_review) {
  if (!next_review) return new Date();
  if (typeof next_review.toDate === 'function') return next_review.toDate();
  if (next_review.seconds) return new Date(next_review.seconds * 1000);
  return new Date(next_review);
}

// ==========================================
// DỊCH VỤ DỮ LIỆU (DATABASE SERVICE API)
// ==========================================

function handleDbError(error, contextName = "") {
  console.error(`Firebase Error during ${contextName}:`, error);
  alert(`Lỗi thao tác Database (${contextName}):\n${error.message}\n\nNguyên nhân phổ biến:\n1. Bạn chưa kích hoạt 'Firestore Database' trong Firebase Console.\n2. Quy tắc bảo mật (Rules) chưa được đặt ở chế độ công khai (Test Mode).\n3. Lỗi kết nối mạng.`);
}

// --- THƯ MỤC LỚN (FOLDERS) ---
async function getFolders() {
  if (isDemoMode) {
    return getLocalStorage(FOLDERS_KEY);
  } else {
    try {
      const q = query(collection(db, "folders"), orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (e) {
      console.error(e);
      return [];
    }
  }
}

async function createFolder(name) {
  const newFolder = { name: name.trim() };
  if (isDemoMode) {
    const list = getLocalStorage(FOLDERS_KEY);
    newFolder.id = 'folder_' + Date.now();
    list.push(newFolder);
    saveLocalStorage(FOLDERS_KEY, list);
    return newFolder;
  } else {
    try {
      const docRef = await addDoc(collection(db, "folders"), newFolder);
      newFolder.id = docRef.id;
      return newFolder;
    } catch (e) {
      handleDbError(e, "Tạo Thư mục");
      throw e;
    }
  }
}

async function deleteFolder(folderId) {
  if (isDemoMode) {
    // Xóa thư mục
    let folders = getLocalStorage(FOLDERS_KEY);
    folders = folders.filter(f => f.id !== folderId);
    saveLocalStorage(FOLDERS_KEY, folders);

    // Xóa các học phần con và từ vựng
    let sets = getLocalStorage(SETS_KEY);
    const setsToDelete = sets.filter(s => s.folder_id === folderId);
    sets = sets.filter(s => s.folder_id !== folderId);
    saveLocalStorage(SETS_KEY, sets);

    let cards = getLocalStorage(CARDS_KEY);
    const setToDeleteIds = setsToDelete.map(s => s.id);
    cards = cards.filter(c => !setToDeleteIds.includes(c.set_id));
    saveLocalStorage(CARDS_KEY, cards);
  } else {
    try {
      // Xóa thư mục trên Firestore
      await deleteDoc(doc(db, "folders", folderId));
      
      // Tìm các học phần để xóa
      const setsQuery = query(collection(db, "study_sets"), where("folder_id", "==", folderId));
      const setsSnapshot = await getDocs(setsQuery);
      
      for (const setDoc of setsSnapshot.docs) {
        const setId = setDoc.id;
        // Xóa thẻ của học phần đó
        const cardsQuery = query(collection(db, "cards"), where("set_id", "==", setId));
        const cardsSnapshot = await getDocs(cardsQuery);
        for (const cardDoc of cardsSnapshot.docs) {
          await deleteDoc(doc(db, "cards", cardDoc.id));
        }
        // Xóa học phần
        await deleteDoc(doc(db, "study_sets", setId));
      }
    } catch (e) {
      handleDbError(e, "Xóa Thư mục");
      throw e;
    }
  }
}

// --- HỌC PHẦN (STUDY SETS) ---
async function getStudySets(folderId = null) {
  if (isDemoMode) {
    const list = getLocalStorage(SETS_KEY);
    if (folderId) return list.filter(s => s.folder_id === folderId);
    return list;
  } else {
    try {
      let q = collection(db, "study_sets");
      if (folderId) {
        q = query(q, where("folder_id", "==", folderId));
      }
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (e) {
      console.error(e);
      return [];
    }
  }
}

async function getStudySetById(setId) {
  if (isDemoMode) {
    const list = getLocalStorage(SETS_KEY);
    return list.find(s => s.id === setId) || null;
  } else {
    const sets = await getStudySets();
    return sets.find(s => s.id === setId) || null;
  }
}

async function createOrUpdateStudySet(setId, folderId, title, description) {
  const setObj = {
    folder_id: folderId,
    title: title.trim(),
    description: description.trim()
  };

  if (isDemoMode) {
    const list = getLocalStorage(SETS_KEY);
    if (setId) {
      const idx = list.findIndex(s => s.id === setId);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...setObj };
      }
      setObj.id = setId;
    } else {
      setObj.id = 'set_' + Date.now();
      list.push(setObj);
    }
    saveLocalStorage(SETS_KEY, list);
    return setObj;
  } else {
    try {
      if (setId) {
        const docRef = doc(db, "study_sets", setId);
        await updateDoc(docRef, setObj);
        setObj.id = setId;
        return setObj;
      } else {
        const docRef = await addDoc(collection(db, "study_sets"), setObj);
        setObj.id = docRef.id;
        return setObj;
      }
    } catch (e) {
      handleDbError(e, "Lưu Học phần");
      throw e;
    }
  }
}

async function deleteStudySet(setId) {
  if (isDemoMode) {
    let list = getLocalStorage(SETS_KEY);
    list = list.filter(s => s.id !== setId);
    saveLocalStorage(SETS_KEY, list);

    let cards = getLocalStorage(CARDS_KEY);
    cards = cards.filter(c => c.set_id !== setId);
    saveLocalStorage(CARDS_KEY, cards);
  } else {
    try {
      await deleteDoc(doc(db, "study_sets", setId));
      // Xóa tất cả các thẻ trong học phần này
      const q = query(collection(db, "cards"), where("set_id", "==", setId));
      const snapshot = await getDocs(q);
      for (const cardDoc of snapshot.docs) {
        await deleteDoc(doc(db, "cards", cardDoc.id));
      }
    } catch (e) {
      handleDbError(e, "Xóa Học phần");
      throw e;
    }
  }
}

// --- THẺ TỪ VỰNG (CARDS) ---
async function getCardsOfSet(setId) {
  if (isDemoMode) {
    const list = getLocalStorage(CARDS_KEY);
    return list.filter(c => c.set_id === setId);
  } else {
    try {
      const q = query(collection(db, "cards"), where("set_id", "==", setId));
      const querySnapshot = await getDocs(q);
      const list = [];
      querySnapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      return list;
    } catch (e) {
      console.error(e);
      return [];
    }
  }
}

async function saveSetCards(setId, cardsList) {
  // cardsList chứa các thẻ dạng { id, front_word, back_meaning, hint }
  if (isDemoMode) {
    let allCards = getLocalStorage(CARDS_KEY);
    // Xóa hết card cũ của Set này
    allCards = allCards.filter(c => c.set_id !== setId);
    
    // Thêm các card mới
    cardsList.forEach(card => {
      const newCard = {
        id: card.id || 'card_' + Date.now() + Math.random().toString(36).substr(2, 5),
        set_id: setId,
        front_word: card.front_word.trim(),
        back_meaning: card.back_meaning.trim(),
        hint: card.hint.trim(),
        interval: card.interval || 0,
        repetition: card.repetition || 0,
        ease_factor: card.ease_factor || 2.5,
        next_review: card.next_review || new Date().toISOString()
      };
      allCards.push(newCard);
    });
    
    saveLocalStorage(CARDS_KEY, allCards);
  } else {
    try {
      // Lấy các card hiện có trên Firestore để đồng bộ hóa (giữ thông số SRS)
      const existingCards = await getCardsOfSet(setId);
      
      for (const card of cardsList) {
        const cardObj = {
          set_id: setId,
          front_word: card.front_word.trim(),
          back_meaning: card.back_meaning.trim(),
          hint: card.hint.trim(),
          interval: card.interval || 0,
          repetition: card.repetition || 0,
          ease_factor: card.ease_factor || 2.5,
          next_review: card.next_review ? new Date(card.next_review) : new Date()
        };

        if (card.id && existingCards.some(ec => ec.id === card.id)) {
          // Cập nhật card hiện tại
          const docRef = doc(db, "cards", card.id);
          await updateDoc(docRef, cardObj);
        } else {
          // Thêm card mới tinh
          await addDoc(collection(db, "cards"), cardObj);
        }
      }

      // Xóa các card đã bị người dùng xóa khỏi UI
      const keptIds = cardsList.map(c => c.id).filter(id => id);
      const toDelete = existingCards.filter(ec => !keptIds.includes(ec.id));
      for (const ec of toDelete) {
        await deleteDoc(doc(db, "cards", ec.id));
      }
    } catch (e) {
      handleDbError(e, "Lưu danh sách thẻ");
      throw e;
    }
  }
}

async function updateCardSRS(cardId, updatedFields) {
  if (isDemoMode) {
    const cards = getLocalStorage(CARDS_KEY);
    const idx = cards.findIndex(c => c.id === cardId);
    if (idx !== -1) {
      cards[idx] = { ...cards[idx], ...updatedFields };
      saveLocalStorage(CARDS_KEY, cards);
    }
  } else {
    try {
      const docRef = doc(db, "cards", cardId);
      // Chuẩn hóa next_review thành Date cho Firestore
      const fieldsToSave = { ...updatedFields };
      if (updatedFields.next_review) {
        fieldsToSave.next_review = new Date(updatedFields.next_review);
      }
      await updateDoc(docRef, fieldsToSave);
    } catch (e) {
      handleDbError(e, "Cập nhật chỉ số SRS thẻ");
      throw e;
    }
  }
}

// --- SEEDER DỮ LIỆU BÓNG ĐÁ MẪU ---
async function seedDemoData() {
  // Tạo Thư mục lớn: human-con người
  const folder = await createFolder("human-con người");
  const folderId = folder.id;

  // Tạo Học phần 1: Leg - Chân
  const setLeg = await createOrUpdateStudySet(null, folderId, "Leg - Chân", "Từ vựng về bộ phận ở Chân");
  const setLegCards = [
    { front_word: "Leg", back_meaning: "n /leg/ Chân", hint: "Cơ quan di chuyển chính", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Knee", back_meaning: "n /niː/ Đầu gối", hint: "Khớp nối đùi và cẳng chân", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Ankle", back_meaning: "n /ˈæŋ.kəl/ Cổ chân", hint: "Nơi nối bàn chân và chân", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Foot", back_meaning: "n /fʊt/ Bàn chân", hint: "Phần dưới cùng tiếp xúc đất", interval: 0, repetition: 0, ease_factor: 2.5 }
  ];
  await saveSetCards(setLeg.id, setLegCards);

  // Tạo Học phần 2: Arm - cánh tay
  const setArm = await createOrUpdateStudySet(null, folderId, "Arm - cánh tay", "Từ vựng về bộ phận ở Tay");
  const setArmCards = [
    { front_word: "Arm", back_meaning: "n /ɑːm/ Cánh tay", hint: "Bộ phận từ vai đến bàn tay", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Elbow", back_meaning: "n /ˈel.bəʊ/ Khuỷu tay", hint: "Khớp nối giữa cánh tay", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Wrist", back_meaning: "n /rɪst/ Cổ tay", hint: "Nơi đeo đồng hồ", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Hand", back_meaning: "n /hænd/ Bàn tay", hint: "Dùng để cầm nắm, viết", interval: 0, repetition: 0, ease_factor: 2.5 }
  ];
  await saveSetCards(setArm.id, setArmCards);
}

// ==========================================
// PHÁT ÂM AI (TEXT TO SPEECH)
// ==========================================
function speakText(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }
}

// ==========================================
// STREAK & DASHBOARD MANAGER
// ==========================================
function recordStudyActivity() {
  let streak = parseInt(localStorage.getItem('study_streak') || '0');
  const lastStudyStr = localStorage.getItem('last_study_date');
  const today = new Date();
  const todayStr = today.toDateString();

  if (!lastStudyStr) {
    streak = 1;
  } else {
    const lastStudyDate = new Date(lastStudyStr);
    if (lastStudyDate.toDateString() !== todayStr) {
      lastStudyDate.setHours(0,0,0,0);
      const tempToday = new Date(today);
      tempToday.setHours(0,0,0,0);
      const diffDays = Math.ceil((tempToday - lastStudyDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) streak += 1;
      else if (diffDays > 1) streak = 1;
    }
  }
  localStorage.setItem('study_streak', streak.toString());
  localStorage.setItem('last_study_date', today.toISOString());
  document.getElementById('sidebar-streak').innerText = streak;
  document.getElementById('streak-count').innerText = streak;
}

// Cập nhật thống kê học lực ở Dashboard
async function refreshGlobalStats() {
  const folders = await getFolders();
  const sets = await getStudySets();
  
  let allCards = [];
  if (isDemoMode) {
    allCards = getLocalStorage(CARDS_KEY);
  } else {
    // Load all cards from Firestore
    try {
      const querySnapshot = await getDocs(collection(db, "cards"));
      querySnapshot.forEach(doc => allCards.push({ id: doc.id, ...doc.data() }));
    } catch(e){}
  }

  // Cập nhật số liệu trên Home
  document.getElementById('stat-folders').innerText = folders.length;
  document.getElementById('stat-sets').innerText = sets.length;
  document.getElementById('stat-cards').innerText = allCards.length;

  // Cập nhật Progress Bar ở Dashboard
  const total = allCards.length;
  document.getElementById('total-cards-label').innerText = `${total} từ vựng`;

  if (total === 0) {
    document.getElementById('progress-mastered').style.width = '0%';
    document.getElementById('progress-learning').style.width = '0%';
    document.getElementById('progress-new').style.width = '100%';
    document.getElementById('count-mastered').innerText = '0';
    document.getElementById('count-learning').innerText = '0';
    document.getElementById('count-new').innerText = '0';
    return;
  }

  const mastered = allCards.filter(c => (c.repetition || 0) >= 3).length;
  const learning = allCards.filter(c => (c.repetition || 0) > 0 && (c.repetition || 0) < 3).length;
  const fresh = allCards.filter(c => !(c.repetition || 0)).length;

  document.getElementById('count-mastered').innerText = mastered;
  document.getElementById('count-learning').innerText = learning;
  document.getElementById('count-new').innerText = fresh;

  document.getElementById('progress-mastered').style.width = `${(mastered / total) * 100}%`;
  document.getElementById('progress-learning').style.width = `${(learning / total) * 100}%`;
  document.getElementById('progress-new').style.width = `${(fresh / total) * 100}%`;
}

// ==========================================
// ROUTING (VIEW SWITCHER)
// ==========================================
let activeView = 'home';
let activeFolderId = null;
let activeSetId = null;

const views = {
  'home': document.getElementById('view-home'),
  'folder': document.getElementById('view-folder'),
  'set-detail': document.getElementById('view-set-detail'),
  'edit-set': document.getElementById('view-edit-set')
};

function showView(viewName) {
  activeView = viewName;
  Object.keys(views).forEach(k => {
    if (k === viewName) views[k].classList.remove('hidden');
    else views[k].classList.add('hidden');
  });

  // Hủy active menu sidebar cũ
  document.getElementById('menu-home-btn').className = "w-full text-left px-3 py-2 rounded-xl text-sm font-bold text-[#939bb4] hover:text-white flex items-center gap-3 transition-all";
  document.getElementById('menu-library-btn').className = "w-full text-left px-3 py-2 rounded-xl text-sm font-bold text-[#939bb4] hover:text-white flex items-center gap-3 transition-all";
  
  if (viewName === 'home') {
    document.getElementById('menu-home-btn').className = "w-full text-left px-3 py-2 rounded-xl text-sm font-bold bg-[#2e3856] text-white flex items-center gap-3 transition-all";
    initHomeView();
  } else if (viewName === 'folder') {
    document.getElementById('menu-library-btn').className = "w-full text-left px-3 py-2 rounded-xl text-sm font-bold bg-[#2e3856] text-white flex items-center gap-3 transition-all";
  }

  // Bật/tắt nút học nhanh trên sidebar dựa trên học phần hiện tại
  const shortcuts = document.querySelectorAll('.study-shortcut');
  if (activeSetId) {
    shortcuts.forEach(btn => {
      btn.disabled = false;
      btn.className = "w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-[#939bb4] hover:text-white flex items-center gap-3 transition-all";
    });
  } else {
    shortcuts.forEach(btn => {
      btn.disabled = true;
      btn.className = "w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-[#5c6479] cursor-not-allowed flex items-center gap-3 transition-all";
    });
  }
}

// ==========================================
// RENDER THANH BÊN (SIDEBAR)
// ==========================================
async function renderSidebar() {
  const folders = await getFolders();
  const listEl = document.getElementById('folders-sidebar-list');
  listEl.innerHTML = '';

  if (folders.length === 0) {
    listEl.innerHTML = `<div class="px-3 py-2 text-xs italic text-[#5c6479]">Chưa có thư mục...</div>`;
    return;
  }

  folders.forEach(f => {
    const btn = document.createElement('button');
    // Active styling if selected
    const isActive = activeFolderId === f.id && activeView === 'folder';
    btn.className = `w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 truncate ${
      isActive ? 'bg-[#2e3856] text-white' : 'text-[#939bb4] hover:text-white'
    }`;
    btn.innerHTML = `<span>📁</span> <span class="truncate">${f.name}</span>`;
    
    btn.addEventListener('click', () => {
      activeFolderId = f.id;
      showFolderView(f.id);
    });
    listEl.appendChild(btn);
  });
}

// ==========================================
// 1. TRANG CHỦ (HOME VIEW)
// ==========================================
async function initHomeView() {
  activeFolderId = null;
  activeSetId = null;
  await renderSidebar();
  await refreshGlobalStats();
}

// Tạo Folder mới
document.getElementById('add-folder-btn').addEventListener('click', async () => {
  const name = prompt("Nhập tên thư mục lớn mới (Ví dụ: human-con người):");
  if (name && name.trim()) {
    const folder = await createFolder(name);
    activeFolderId = folder.id;
    await renderSidebar();
    showFolderView(folder.id);
  }
});

// Nạp dữ liệu mẫu
document.getElementById('quick-seed-btn').addEventListener('click', async () => {
  const btn = document.getElementById('quick-seed-btn');
  btn.disabled = true;
  btn.innerText = "Đang nạp...";
  
  await seedDemoData();
  
  alert("Nạp thành công thư mục 'human-con người' cùng 2 học phần mẫu (Leg, Arm)!");
  btn.disabled = false;
  btn.innerText = "⚡ Nạp dữ liệu mẫu bóng đá";
  
  initHomeView();
});

// ==========================================
// 2. CHI TIẾT THƯ MỤC (FOLDER VIEW)
// ==========================================
let currentFolderSets = [];

async function showFolderView(folderId) {
  activeFolderId = folderId;
  activeSetId = null;
  showView('folder');
  await renderSidebar();

  const folders = await getFolders();
  const folderObj = folders.find(f => f.id === folderId);
  if (!folderObj) return;

  document.getElementById('folder-title').innerText = folderObj.name;
  
  // Tải học phần con
  currentFolderSets = await getStudySets(folderId);
  document.getElementById('folder-set-count').innerText = currentFolderSets.length;

  renderFolderSets();
}

async function renderFolderSets() {
  const listEl = document.getElementById('folder-sets-list');
  listEl.innerHTML = '';
  
  const searchVal = document.getElementById('search-sets-input').value.toLowerCase().trim();
  const filteredSets = currentFolderSets.filter(s => s.title.toLowerCase().includes(searchVal));

  if (filteredSets.length === 0) {
    listEl.innerHTML = `<div class="col-span-full py-8 text-center text-[#939bb4] italic text-xs">Chưa có học phần nào trong thư mục này.</div>`;
    return;
  }

  for (const set of filteredSets) {
    const cards = await getCardsOfSet(set.id);
    
    const itemEl = document.createElement('div');
    itemEl.className = 'quizlet-card p-5 rounded-2xl flex flex-col justify-between hover:border-white transition-all cursor-pointer shadow-md';
    itemEl.innerHTML = `
      <div>
        <h4 class="text-base font-bold text-white font-display">${set.title}</h4>
        <p class="text-xs text-[#939bb4] mt-1 line-clamp-2">${set.description || 'Không có mô tả.'}</p>
      </div>
      <div class="mt-4 flex justify-between items-center text-[10px] font-bold text-[#939bb4] uppercase tracking-wider">
        <span>${cards.length} thuật ngữ</span>
        <span class="px-2.5 py-1 rounded-lg bg-[#1a1b2f] border border-[#3c4257] hover:text-white">Xem chi tiết ➔</span>
      </div>
    `;
    itemEl.addEventListener('click', () => {
      showSetDetailView(set.id);
    });
    listEl.appendChild(itemEl);
  }
}

// Tìm kiếm học phần
document.getElementById('search-sets-input').addEventListener('input', renderFolderSets);

// Xóa thư mục
document.getElementById('folder-delete-btn').addEventListener('click', async () => {
  if (confirm("LƯU Ý: Xóa thư mục lớn sẽ xóa toàn bộ các học phần con và từ vựng bên trong. Bạn có chắc chắn?")) {
    await deleteFolder(activeFolderId);
    initHomeView();
    showView('home');
  }
});

// Học toàn bộ từ vựng trong Folder (SRS ôn tập gộp)
document.getElementById('folder-study-all-btn').addEventListener('click', async () => {
  alert("Tính năng ôn tập gộp: Chúng ta sẽ mở học phần con đầu tiên để học.");
  if (currentFolderSets.length > 0) {
    showSetDetailView(currentFolderSets[0].id);
  } else {
    alert("Vui lòng tạo học phần trước!");
  }
});

// Nút Thêm học phần con
document.getElementById('add-set-to-folder-btn').addEventListener('click', () => {
  showEditSetView(null);
});

// ==========================================
// 3. CHI TIẾT HỌC PHẦN (STUDY SET DETAIL VIEW)
// ==========================================
let currentSetCards = [];
let fcActiveIndex = 0;
let fcAutoplayInterval = null;

async function showSetDetailView(setId) {
  activeSetId = setId;
  showView('set-detail');

  const setObj = await getStudySetById(setId);
  if (!setObj) return;

  document.getElementById('set-detail-title').innerText = setObj.title;
  document.getElementById('set-detail-desc').innerText = setObj.description || 'Không có mô tả.';

  currentSetCards = await getCardsOfSet(setId);
  
  // Render danh sách từ vựng bên dưới
  renderSetTermsList();

  // Khởi động chế độ Flashcards mặc định
  selectStudyMode('flashcards');
}

function renderSetTermsList() {
  const listEl = document.getElementById('set-terms-list');
  listEl.innerHTML = '';

  if (currentSetCards.length === 0) {
    listEl.innerHTML = `<div class="py-4 text-center text-[#939bb4] italic text-xs">Chưa có thuật ngữ nào. Bấm "Sửa học phần" để thêm.</div>`;
    return;
  }

  currentSetCards.forEach(card => {
    const item = document.createElement('div');
    item.className = 'grid grid-cols-1 md:grid-cols-3 gap-4 py-4 text-sm font-semibold';
    item.innerHTML = `
      <div class="text-white md:col-span-1 border-r border-[#3c4257] pr-2">${card.front_word}</div>
      <div class="text-slate-300 md:col-span-1">${card.back_meaning.replace(/\n/g, '<br>')}</div>
      <div class="text-yellow-400 text-xs italic md:col-span-1">${card.hint || ''}</div>
    `;
    listEl.appendChild(item);
  });
}

// Đổi chế độ học
const modePanels = {
  'flashcards': { btn: document.getElementById('mode-flashcards-btn'), view: document.getElementById('subview-flashcards'), init: initFCSubMode },
  'match': { btn: document.getElementById('mode-match-btn'), view: document.getElementById('subview-match'), init: initMatchSubMode },
  'test': { btn: document.getElementById('mode-test-btn'), view: document.getElementById('subview-test'), init: initTestSubMode }
};

function selectStudyMode(modeName) {
  Object.keys(modePanels).forEach(k => {
    const p = modePanels[k];
    if (k === modeName) {
      p.btn.className = "quizlet-card p-4 rounded-xl flex flex-col items-center justify-center text-center border-white transition-all font-bold text-xs uppercase tracking-wider ring-2 ring-[#4257b2]";
      p.view.classList.remove('hidden');
      p.init();
    } else {
      p.btn.className = "quizlet-card p-4 rounded-xl flex flex-col items-center justify-center text-center hover:border-white transition-all font-bold text-xs uppercase tracking-wider";
      p.view.classList.add('hidden');
    }
  });
}

// Bind tabs click
Object.keys(modePanels).forEach(k => {
  modePanels[k].btn.addEventListener('click', () => selectStudyMode(k));
});

// Sidebar shortcuts links click
document.getElementById('shortcut-flashcards-btn').addEventListener('click', () => selectStudyMode('flashcards'));
document.getElementById('shortcut-match-btn').addEventListener('click', () => selectStudyMode('match'));
document.getElementById('shortcut-test-btn').addEventListener('click', () => selectStudyMode('test'));

// --- SUBMODE 3.1: FLASHCARDS ---
let fcIsFlipped = false;
let fcAutoplayRunning = false;
let dueCardsList = [];

function initFCSubMode() {
  // Hủy autoplay cũ
  stopFCAutoplay();
  
  // Chỉ học các thẻ đến hạn ôn tập (SRS)
  const now = new Date();
  dueCardsList = currentSetCards.filter(card => {
    const dueTime = getReviewDate(card.next_review);
    return dueTime <= now;
  });

  fcActiveIndex = 0;
  fcIsFlipped = false;
  renderFCCard();
}

function renderFCCard() {
  document.getElementById('fc-inner-box').classList.remove('card-flipped');
  fcIsFlipped = false;
  document.getElementById('fc-hint-text').classList.add('hidden');
  document.getElementById('fc-hint-text').innerText = '';

  const labelCount = document.getElementById('fc-count-label');
  const cardBox = document.getElementById('fc-perspective-box');
  const rateBox = document.getElementById('fc-rate-box');
  const emptyState = document.getElementById('fc-empty-state');

  if (dueCardsList.length === 0) {
    labelCount.innerText = "🏆 Hoàn thành!";
    cardBox.classList.add('hidden');
    rateBox.classList.add('hidden');
    
    // Nếu cả học phần không có từ nào
    if (currentSetCards.length === 0) {
      emptyState.querySelector('p').innerText = 'Học phần này chưa có từ vựng. Hãy bấm nút "Sửa học phần" để thêm thẻ học!';
      emptyState.querySelector('button').classList.add('hidden');
    } else {
      emptyState.querySelector('p').innerText = 'Bạn đã ôn tập xong các thẻ đến hạn của học phần này. Thử làm trắc nghiệm hoặc game ghép thẻ nhé!';
      emptyState.querySelector('button').classList.remove('hidden');
    }
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  cardBox.classList.remove('hidden');
  rateBox.classList.add('hidden'); // Ẩn nút đánh giá đến khi lật thẻ

  labelCount.innerText = `Thẻ ôn tập: ${fcActiveIndex + 1} / ${dueCardsList.length}`;

  const card = dueCardsList[fcActiveIndex];
  document.getElementById('fc-word-text').innerText = card.front_word;
  document.getElementById('fc-meaning-text').innerHTML = card.back_meaning.replace(/\n/g, '<br>');
  document.getElementById('fc-ef-val').innerText = Number(card.ease_factor || 2.5).toFixed(2);
  document.getElementById('fc-rep-val').innerText = card.repetition || 0;
  document.getElementById('fc-interval-val').innerText = card.interval || 0;

  if (document.getElementById('autoplay-speak').checked) {
    speakText(card.front_word);
  }
}

function flipFCCard() {
  if (dueCardsList.length === 0) return;
  fcIsFlipped = !fcIsFlipped;
  const inner = document.getElementById('fc-inner-box');
  const rateBox = document.getElementById('fc-rate-box');
  
  if (fcIsFlipped) {
    inner.classList.add('card-flipped');
    rateBox.classList.remove('hidden');
    if (document.getElementById('autoplay-speak').checked) {
      speakText(dueCardsList[fcActiveIndex].front_word);
    }
  } else {
    inner.classList.remove('card-flipped');
    rateBox.classList.add('hidden');
  }
}

// Lật thẻ bằng click
document.getElementById('fc-inner-box').addEventListener('click', (e) => {
  if (e.target.closest('#fc-speak-front') || e.target.closest('#fc-speak-back') || e.target.closest('#fc-hint')) return;
  flipFCCard();
});

// Phát âm
document.getElementById('fc-speak-front').addEventListener('click', (e) => {
  e.stopPropagation();
  speakText(dueCardsList[fcActiveIndex].front_word);
});
document.getElementById('fc-speak-back').addEventListener('click', (e) => {
  e.stopPropagation();
  speakText(dueCardsList[fcActiveIndex].front_word);
});

// Gợi ý thông minh
document.getElementById('fc-hint').addEventListener('click', (e) => {
  e.stopPropagation();
  const card = dueCardsList[fcActiveIndex];
  const hintEl = document.getElementById('fc-hint-text');
  if (hintEl.classList.contains('hidden')) {
    hintEl.innerText = card.hint || `💡 Từ bắt đầu bằng "${card.front_word[0].toUpperCase()}" và gồm ${card.front_word.length} ký tự.`;
    hintEl.classList.remove('hidden');
  } else {
    hintEl.classList.add('hidden');
  }
});

// Next / Prev
document.getElementById('fc-next-btn').addEventListener('click', () => {
  if (dueCardsList.length === 0) return;
  fcActiveIndex = (fcActiveIndex + 1) % dueCardsList.length;
  renderFCCard();
});

document.getElementById('fc-prev-btn').addEventListener('click', () => {
  if (dueCardsList.length === 0) return;
  fcActiveIndex = (fcActiveIndex - 1 + dueCardsList.length) % dueCardsList.length;
  renderFCCard();
});

// Trộn thẻ
document.getElementById('fc-shuffle-btn').addEventListener('click', () => {
  if (dueCardsList.length <= 1) return;
  for (let i = dueCardsList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dueCardsList[i], dueCardsList[j]] = [dueCardsList[j], dueCardsList[i]];
  }
  fcActiveIndex = 0;
  renderFCCard();
});

// Autoplay
function stopFCAutoplay() {
  if (fcAutoplayInterval) {
    clearInterval(fcAutoplayInterval);
    fcAutoplayInterval = null;
    fcAutoplayRunning = false;
    document.getElementById('fc-autoplay-btn').innerHTML = `<span>▶️</span> Chạy`;
  }
}

document.getElementById('fc-autoplay-btn').addEventListener('click', () => {
  if (fcAutoplayRunning) {
    stopFCAutoplay();
  } else {
    if (dueCardsList.length === 0) return;
    fcAutoplayRunning = true;
    document.getElementById('fc-autoplay-btn').innerHTML = `<span>⏸️</span> Dừng`;
    
    fcAutoplayInterval = setInterval(() => {
      if (!fcIsFlipped) {
        flipFCCard();
      } else {
        fcActiveIndex = (fcActiveIndex + 1) % dueCardsList.length;
        renderFCCard();
      }
    }, 3000);
  }
});

// Bấm phím tắt lật thẻ
document.addEventListener('keydown', (e) => {
  if (activeView === 'set-detail' && document.getElementById('subview-flashcards').classList.contains('hidden') === false) {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      if (e.code === 'Space') {
        e.preventDefault();
        flipFCCard();
      } else if (e.code === 'ArrowRight') {
        document.getElementById('fc-next-btn').click();
      } else if (e.code === 'ArrowLeft') {
        document.getElementById('fc-prev-btn').click();
      } else if (fcIsFlipped) {
        if (e.key === '1') {
          document.querySelector('button[data-q="0"]')?.click();
        } else if (e.key === '2') {
          document.querySelector('button[data-q="3"]')?.click();
        } else if (e.key === '3') {
          document.querySelector('button[data-q="4"]')?.click();
        } else if (e.key === '4') {
          document.querySelector('button[data-q="5"]')?.click();
        }
      }
    }
  }
});

// Đánh giá SM-2 click
const rateButtons = document.querySelectorAll('.rate-btn');
rateButtons.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const q = parseInt(btn.getAttribute('data-q'));
    const currentCard = dueCardsList[fcActiveIndex];

    const updated = calculateSM2(currentCard, q);
    await updateCardSRS(currentCard.id, updated);
    recordStudyActivity();

    // Xóa thẻ khỏi hàng đợi hiện tại
    dueCardsList.splice(fcActiveIndex, 1);
    if (fcActiveIndex >= dueCardsList.length) {
      fcActiveIndex = 0;
    }

    // Refresh dữ liệu
    currentSetCards = await getCardsOfSet(activeSetId);
    await refreshGlobalStats();
    
    renderFCCard();
  });
});

// Reset học lại từ đầu
document.getElementById('fc-reset-study-btn').addEventListener('click', async () => {
  for (const card of currentSetCards) {
    await updateCardSRS(card.id, {
      interval: 0,
      repetition: 0,
      ease_factor: 2.5,
      next_review: isDemoMode ? new Date().toISOString() : new Date()
    });
  }
  alert("Đặt lại tiến trình học phần thành công!");
  showSetDetailView(activeSetId);
});

// --- SUBMODE 3.2: MATCH GAME (GHÉP THẺ) ---
let matchTimer = null;
let matchStartTimeVal = 0;
let matchHigh = parseFloat(localStorage.getItem('match_highscore') || '999.9');

function initMatchSubMode() {
  stopMatchTimer();
  document.getElementById('m-start-screen').classList.remove('hidden');
  document.getElementById('m-arena').classList.add('hidden');
  document.getElementById('m-finish-screen').classList.add('hidden');
  document.getElementById('m-timer').innerText = '0.0';
  document.getElementById('m-highscore').innerText = matchHigh === 999.9 ? 'N/A' : matchHigh.toFixed(1);
}

document.getElementById('m-start-btn').addEventListener('click', startMatchSubGame);
document.getElementById('m-replay-btn').addEventListener('click', startMatchSubGame);

async function startMatchSubGame() {
  if (currentSetCards.length < 3) {
    alert("Học phần cần có tối thiểu 3 thuật ngữ để chơi game Ghép Thẻ!");
    return;
  }

  document.getElementById('m-start-screen').classList.add('hidden');
  document.getElementById('m-finish-screen').classList.add('hidden');
  document.getElementById('m-arena').classList.remove('hidden');
  document.getElementById('m-arena').innerHTML = '';
  selectedMatchElement = null;

  // Lấy ngẫu nhiên tối đa 4 từ
  const select = [...currentSetCards].sort(() => 0.5 - Math.random()).slice(0, Math.min(4, currentSetCards.length));
  const items = [];
  select.forEach(c => {
    items.push({ id: c.id, text: c.front_word, type: 'eng' });
    const cleanMeaning = c.back_meaning.split('\n')[0].replace(/\(.*?\)/g, '').trim();
    items.push({ id: c.id, text: cleanMeaning, type: 'vie' });
  });

  items.sort(() => 0.5 - Math.random());

  items.forEach(item => {
    const cardEl = document.createElement('div');
    cardEl.className = 'quizlet-card p-4 rounded-xl shadow-md flex items-center justify-center text-center font-bold text-xs cursor-pointer select-none min-h-[85px] transition-all hover:scale-[1.03] active:scale-[0.98] duration-150 text-white border border-[#3c4257]';
    cardEl.innerText = item.text;
    cardEl.setAttribute('data-id', item.id);
    cardEl.setAttribute('data-type', item.type);
    
    cardEl.addEventListener('click', () => handleSubMatchClick(cardEl));
    document.getElementById('m-arena').appendChild(cardEl);
  });

  // Chạy giờ
  matchStartTimeVal = Date.now();
  matchTimer = setInterval(() => {
    const elapsed = (Date.now() - matchStartTimeVal) / 1000;
    document.getElementById('m-timer').innerText = elapsed.toFixed(1);
  }, 100);
}

function handleSubMatchClick(el) {
  if (el.classList.contains('opacity-0')) return;

  if (selectedMatchElement === el) {
    el.classList.remove('ring-4', 'ring-[#4257b2]', 'bg-[#1f263f]');
    selectedMatchElement = null;
    return;
  }

  if (!selectedMatchElement) {
    selectedMatchElement = el;
    el.classList.add('ring-4', 'ring-[#4257b2]', 'bg-[#1f263f]');
    return;
  }

  const el1 = selectedMatchElement;
  const el2 = el;

  const id1 = el1.getAttribute('data-id');
  const id2 = el2.getAttribute('data-id');
  const type1 = el1.getAttribute('data-type');
  const type2 = el2.getAttribute('data-type');

  if (id1 === id2 && type1 !== type2) {
    el1.classList.remove('ring-4', 'ring-[#4257b2]', 'bg-[#1f263f]');
    el2.classList.remove('ring-4', 'ring-[#4257b2]', 'bg-[#1f263f]');
    
    el1.classList.add('bg-emerald-600', 'scale-95');
    el2.classList.add('bg-emerald-600', 'scale-95');

    setTimeout(() => {
      el1.style.visibility = 'hidden';
      el2.style.visibility = 'hidden';
      el1.classList.add('opacity-0');
      el2.classList.add('opacity-0');
      checkSubGameFinished();
    }, 300);
  } else {
    el1.classList.remove('ring-4', 'ring-[#4257b2]', 'bg-[#1f263f]');
    el1.classList.add('bg-red-600', 'animate-shake');
    el2.classList.add('bg-red-600', 'animate-shake');

    setTimeout(() => {
      el1.classList.remove('bg-red-600', 'animate-shake');
      el2.classList.remove('bg-red-600', 'animate-shake');
    }, 400);
  }
  selectedMatchElement = null;
}

function stopMatchTimer() {
  if (matchTimer) {
    clearInterval(matchTimer);
    matchTimer = null;
  }
}

function checkSubGameFinished() {
  const active = Array.from(document.getElementById('m-arena').children).filter(el => !el.classList.contains('opacity-0'));
  if (active.length === 0) {
    stopMatchTimer();
    const time = parseFloat(document.getElementById('m-timer').innerText);
    
    if (time < matchHigh) {
      matchHigh = time;
      localStorage.setItem('match_highscore', time.toString());
      document.getElementById('m-highscore').innerText = time.toFixed(1);
    }
    
    document.getElementById('m-result-time').innerText = time.toFixed(1);
    document.getElementById('m-arena').classList.add('hidden');
    document.getElementById('m-finish-screen').classList.remove('hidden');
    recordStudyActivity();
  }
}

// --- SUBMODE 3.3: TEST MODE (KIỂM TRA) ---
let testPaperQuestions = [];

function initTestSubMode() {
  document.getElementById('t-start-panel').classList.remove('hidden');
  document.getElementById('t-paper').classList.add('hidden');
  document.getElementById('t-result-panel').classList.add('hidden');
}

document.getElementById('t-generate-btn').addEventListener('click', generateSubTest);
document.getElementById('t-restart-btn').addEventListener('click', generateSubTest);
document.getElementById('t-submit-btn').addEventListener('click', gradeSubTest);

async function generateSubTest() {
  if (currentSetCards.length < 4) {
    alert("Cần tối thiểu 4 từ vựng trong học phần này để tự động soạn bài thi trắc nghiệm!");
    return;
  }

  document.getElementById('t-start-panel').classList.add('hidden');
  document.getElementById('t-result-panel').classList.add('hidden');
  document.getElementById('t-paper').classList.remove('hidden');
  
  const formEl = document.getElementById('t-form');
  formEl.innerHTML = '';
  testPaperQuestions = [];

  const quiz = [...currentSetCards].sort(() => 0.5 - Math.random()).slice(0, Math.min(5, currentSetCards.length));

  quiz.forEach((card, index) => {
    const correct = card.back_meaning.split('\n')[0].replace(/\(.*?\)/g, '').trim();
    const wrongs = currentSetCards
      .filter(c => c.id !== card.id)
      .map(c => c.back_meaning.split('\n')[0].replace(/\(.*?\)/g, '').trim())
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);

    const choices = [correct, ...wrongs].sort(() => 0.5 - Math.random());

    testPaperQuestions.push({
      id: card.id,
      word: card.front_word,
      correct: correct
    });

    const box = document.createElement('div');
    box.className = 'quizlet-card p-5 rounded-xl border border-[#3c4257] space-y-3';
    box.innerHTML = `
      <div class="text-[10px] font-bold text-[#939bb4] uppercase tracking-wider">Câu ${index + 1}:</div>
      <div class="text-sm font-bold text-white">"${card.front_word}" nghĩa là gì?</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
        ${choices.map(choice => `
          <label class="flex items-center gap-3 p-3 bg-[#1a1b2f] border border-[#3c4257] hover:border-white rounded-xl cursor-pointer text-xs transition-all">
            <input type="radio" required name="t-q-${index}" value="${choice}" class="accent-[#4257b2]">
            <span class="text-slate-200">${choice}</span>
          </label>
        `).join('')}
      </div>
      <div class="t-feedback hidden text-xs font-semibold mt-2"></div>
    `;
    formEl.appendChild(box);
  });
}

function gradeSubTest() {
  let answered = 0;
  testPaperQuestions.forEach((q, index) => {
    if (document.querySelector(`input[name="t-q-${index}"]:checked`)) answered++;
  });

  if (answered < testPaperQuestions.length) {
    alert("Vui lòng hoàn thành tất cả câu hỏi trước khi nộp đề!");
    return;
  }

  let correctCount = 0;
  testPaperQuestions.forEach((q, index) => {
    const radio = document.querySelector(`input[name="t-q-${index}"]:checked`);
    const val = radio ? radio.value : '';
    const label = radio ? radio.closest('label') : null;
    const box = document.getElementById('t-form').children[index];
    const feedback = box.querySelector('.t-feedback');

    box.querySelectorAll('label').forEach(lbl => {
      lbl.className = 'flex items-center gap-3 p-3 bg-[#1a1b2f]/40 border border-[#3c4257] rounded-xl cursor-not-allowed text-xs';
      lbl.querySelector('input').disabled = true;
    });

    if (val === q.correct) {
      correctCount++;
      if (label) label.className = 'flex items-center gap-3 p-3 bg-emerald-950/30 border-2 border-emerald-500 rounded-xl text-emerald-300 font-semibold text-xs';
      feedback.className = 't-feedback text-xs font-semibold mt-2 text-emerald-400';
      feedback.innerText = `✓ Chính xác!`;
    } else {
      if (label) label.className = 'flex items-center gap-3 p-3 bg-red-950/30 border-2 border-red-500 rounded-xl text-red-300 font-semibold text-xs';
      const correctRadio = box.querySelector(`input[value="${q.correct}"]`);
      if (correctRadio) {
        correctRadio.closest('label').className = 'flex items-center gap-3 p-3 bg-emerald-950/30 border-2 border-emerald-500 rounded-xl text-emerald-300 font-semibold text-xs';
      }
      feedback.className = 't-feedback text-xs font-semibold mt-2 text-red-400';
      feedback.innerText = `✗ Sai. Đáp án đúng: ${q.correct}`;
    }
    feedback.classList.remove('hidden');
  });

  // Hiển thị điểm số
  document.getElementById('t-paper').classList.add('hidden');
  document.getElementById('t-result-panel').classList.remove('hidden');
  document.getElementById('t-score-correct').innerText = correctCount;
  document.getElementById('t-score-total').innerText = testPaperQuestions.length;

  const emojiEl = document.getElementById('t-emoji');
  const feedEl = document.getElementById('t-feedback');

  if (correctCount === testPaperQuestions.length) {
    emojiEl.innerText = "🥳";
    feedEl.innerText = "Điểm tuyệt đối! Bạn đã thuộc hoàn toàn từ vựng của học phần này.";
  } else if (correctCount >= testPaperQuestions.length / 2) {
    emojiEl.innerText = "👏";
    feedEl.innerText = "Khá tốt! Bạn đã nhớ được tương đối. Hãy ôn luyện thêm.";
  } else {
    emojiEl.innerText = "😢";
    feedEl.innerText = "Cần cố gắng! Đọc kỹ lại các từ vựng trước khi kiểm tra lại nhé.";
  }

  recordStudyActivity();
}

// Back to folder detail button click
document.getElementById('back-to-folder-btn').addEventListener('click', () => {
  showFolderView(activeFolderId);
});

// Xóa học phần
document.getElementById('set-delete-btn').addEventListener('click', async () => {
  if (confirm("Bạn có chắc chắn muốn xóa học phần này và toàn bộ từ vựng bên trong?")) {
    await deleteStudySet(activeSetId);
    showFolderView(activeFolderId);
  }
});

// Chuyển sang chỉnh sửa học phần
document.getElementById('set-edit-btn').addEventListener('click', () => {
  showEditSetView(activeSetId);
});

// ==========================================
// 4. MÀN HÌNH TẠO/SỬA HỌC PHẦN (EDIT SET VIEW)
// ==========================================
let editingSetId = null;

async function showEditSetView(setId) {
  editingSetId = setId;
  showView('edit-set');
  
  const titleInput = document.getElementById('set-title-input');
  const descInput = document.getElementById('set-desc-input');
  const rowsContainer = document.getElementById('edit-cards-rows-list');
  
  rowsContainer.innerHTML = '';

  if (setId) {
    // Chế độ EDIT
    document.getElementById('edit-view-title').innerText = "Chỉnh sửa học phần";
    const setObj = await getStudySetById(setId);
    titleInput.value = setObj.title;
    descInput.value = setObj.description || '';
    
    const cards = await getCardsOfSet(setId);
    if (cards.length === 0) {
      // Bắt đầu với 3 hàng trống nếu rỗng
      for (let i = 0; i < 3; i++) addNewRow(null);
    } else {
      cards.forEach(card => addNewRow(card));
    }
  } else {
    // Chế độ CREATE mới
    document.getElementById('edit-view-title').innerText = "Tạo học phần mới";
    titleInput.value = '';
    descInput.value = '';
    
    // Bắt đầu với 3 hàng trống mặc định
    for (let i = 0; i < 3; i++) addNewRow(null);
  }
}

// Thêm một hàng nhập card mới
function addNewRow(card = null) {
  const container = document.getElementById('edit-cards-rows-list');
  const index = container.children.length + 1;

  const rowEl = document.createElement('div');
  rowEl.className = 'quizlet-card p-5 rounded-xl border border-[#3c4257] space-y-4 relative card-row-item';
  
  // Lưu giữ id và thông số SRS nếu là card cũ
  rowEl.setAttribute('data-id', card ? card.id : '');
  rowEl.setAttribute('data-interval', card ? card.interval : 0);
  rowEl.setAttribute('data-repetition', card ? card.repetition : 0);
  rowEl.setAttribute('data-ease', card ? card.ease_factor : 2.5);
  rowEl.setAttribute('data-next', card ? getReviewDate(card.next_review).toISOString() : '');

  rowEl.innerHTML = `
    <div class="flex justify-between items-center border-b border-[#3c4257]/50 pb-2">
      <span class="text-sm font-bold text-white font-display">${index}</span>
      <button type="button" class="delete-row-btn text-xs text-red-400 hover:text-red-500 font-bold transition-all">🗑️ Xóa hàng</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label class="block text-[9px] font-bold text-[#939bb4] uppercase tracking-wider mb-1">Thuật ngữ (Tiếng Anh)</label>
        <input type="text" placeholder="Ví dụ: Leg" class="term-front w-full px-3 py-2 rounded-xl outline-none text-xs quizlet-input font-bold" value="${card ? card.front_word : ''}">
      </div>
      <div>
        <label class="block text-[9px] font-bold text-[#939bb4] uppercase tracking-wider mb-1">Định nghĩa (Tiếng Việt)</label>
        <input type="text" placeholder="Ví dụ: n /leg/ Chân" class="term-back w-full px-3 py-2 rounded-xl outline-none text-xs quizlet-input" value="${card ? card.back_meaning : ''}">
      </div>
      <div>
        <label class="block text-[9px] font-bold text-[#939bb4] uppercase tracking-wider mb-1">Gợi ý gợi nhớ (Ví dụ: Chữ cái đầu...)</label>
        <input type="text" placeholder="Ví dụ: Cơ quan đi lại" class="term-hint w-full px-3 py-2 rounded-xl outline-none text-xs quizlet-input" value="${card ? (card.hint || '') : ''}">
      </div>
    </div>
  `;

  // Nút xóa hàng
  rowEl.querySelector('.delete-row-btn').addEventListener('click', () => {
    rowEl.remove();
    // Đánh số lại các hàng còn lại
    Array.from(container.children).forEach((el, idx) => {
      el.querySelector('.font-display').innerText = idx + 1;
    });
  });

  container.appendChild(rowEl);
}

// Bấm nút thêm thẻ mới
document.getElementById('edit-add-row-btn').addEventListener('click', () => {
  addNewRow(null);
});

// Hoàn tất lưu học phần
document.getElementById('edit-set-done-btn').addEventListener('click', async () => {
  const title = document.getElementById('set-title-input').value.trim();
  const desc = document.getElementById('set-desc-input').value.trim();

  if (!title) {
    alert("Vui lòng điền tiêu đề học phần trước!");
    return;
  }

  // Thu thập các hàng
  const rows = document.querySelectorAll('.card-row-item');
  const cardsList = [];
  
  let isValid = true;
  rows.forEach(row => {
    const front = row.querySelector('.term-front').value.trim();
    const back = row.querySelector('.term-back').value.trim();
    const hint = row.querySelector('.term-hint').value.trim();

    if (front || back) {
      if (!front || !back) {
        isValid = false;
      } else {
        cardsList.push({
          id: row.getAttribute('data-id') || null,
          front_word: front,
          back_meaning: back,
          hint: hint,
          interval: parseInt(row.getAttribute('data-interval')) || 0,
          repetition: parseInt(row.getAttribute('data-repetition')) || 0,
          ease_factor: parseFloat(row.getAttribute('data-ease')) || 2.5,
          next_review: row.getAttribute('data-next') || null
        });
      }
    }
  });

  if (!isValid) {
    alert("Tất cả các dòng có dữ liệu phải điền đầy đủ cả Thuật ngữ tiếng Anh và Định nghĩa tiếng Việt!");
    return;
  }

  if (cardsList.length === 0) {
    alert("Học phần phải có tối thiểu 1 thuật ngữ!");
    return;
  }

  // 1. Lưu học phần con
  const studySet = await createOrUpdateStudySet(editingSetId, activeFolderId, title, desc);
  
  // 2. Lưu danh sách thẻ từ vựng tương ứng
  await saveSetCards(studySet.id, cardsList);

  alert("Lưu học phần thành công!");
  
  // Trở lại Folder Detail
  showFolderView(activeFolderId);
});

// ==========================================
// TỔNG HỢP NAVIGATION BÊN SƯỜN (SIDEBAR MENU)
// ==========================================
document.getElementById('menu-home-btn').addEventListener('click', () => {
  showView('home');
});

document.getElementById('menu-library-btn').addEventListener('click', async () => {
  const folders = await getFolders();
  if (folders.length > 0) {
    showFolderView(folders[0].id);
  } else {
    alert("Thư viện trống! Vui lòng tạo thư mục lớn ở sidebar trước.");
    showView('home');
  }
});

// Khởi chạy
document.addEventListener('DOMContentLoaded', async () => {
  // Lấy Streak từ máy
  const streak = localStorage.getItem('study_streak') || '0';
  document.getElementById('sidebar-streak').innerText = streak;

  // Khởi chạy chế độ trang chủ
  showView('home');
});
