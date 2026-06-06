// ==========================================
// CONFIGURATION & INITIALIZATION
// ==========================================
let isDemoMode = true;

// Session & Authentication State
let token = localStorage.getItem('tct_srs_token') || null;
let currentUser = null;
try {
  const userStr = localStorage.getItem('tct_srs_current_user');
  if (userStr) currentUser = JSON.parse(userStr);
} catch (e) {
  console.error("Error parsing current user:", e);
}

// Intercept fetch requests to append Authorization header (only for local API calls to prevent CORS preflight issues with external APIs)
const originalFetch = window.fetch;
window.fetch = async function(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  const urlStr = typeof url === 'string' ? url : (url && url.href ? url.href : String(url));
  const isLocalApi = urlStr.startsWith('/') || urlStr.startsWith(window.location.origin);
  if (isLocalApi && token && !options.headers['Authorization']) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  return originalFetch(url, options);
};

// Switch auth tabs (Login / Register)
window.switchAuthTab = function(tab) {
  const loginForm = document.getElementById('auth-login-form');
  const registerForm = document.getElementById('auth-register-form');
  const loginBtn = document.getElementById('tab-login-btn');
  const registerBtn = document.getElementById('tab-register-btn');
  
  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginBtn.classList.add('active');
    registerBtn.classList.remove('active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    loginBtn.classList.remove('active');
    registerBtn.classList.add('active');
  }
};

// Handle Authentication Forms Submission
window.handleAuthSubmit = async function(event, type) {
  event.preventDefault();
  
  if (type === 'login') {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    try {
      const res = await originalFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Đăng nhập thất bại.');
      }
      
      const data = await res.json();
      token = data.token;
      currentUser = data.user;
      
      localStorage.setItem('tct_srs_token', token);
      localStorage.setItem('tct_srs_current_user', JSON.stringify(currentUser));
      localStorage.removeItem('tct_srs_offline_mode'); // Clear offline flag
      isDemoMode = false;
      
      showToast('Đăng nhập thành công!', 'success');
      
      // Update UI elements
      document.body.classList.remove('not-logged-in');
      updateUserWidgetUI();
      
      // Route to Home View
      showView('home');
      
      // Clear inputs
      usernameInput.value = '';
      passwordInput.value = '';
    } catch (err) {
      showToast(err.message, 'error');
    }
  } else if (type === 'register') {
    const usernameInput = document.getElementById('register-username');
    const passwordInput = document.getElementById('register-password');
    const confirmPasswordInput = document.getElementById('register-confirm-password');
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    
    if (password !== confirmPassword) {
      showToast('Mật khẩu xác nhận không khớp!', 'error');
      return;
    }
    
    try {
      const res = await originalFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Đăng ký thất bại.');
      }
      
      showToast('Đăng ký thành công! Hãy đăng nhập.', 'success');
      
      // Switch to login tab and auto-fill username
      switchAuthTab('login');
      document.getElementById('login-username').value = username;
      document.getElementById('login-password').focus();
      
      // Clear inputs
      usernameInput.value = '';
      passwordInput.value = '';
      confirmPasswordInput.value = '';
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
};

// Update sidebar user profile widget
function updateUserWidgetUI() {
  const widget = document.getElementById('sidebar-user-widget');
  const adminBtn = document.getElementById('menu-admin-btn');
  
  if (currentUser) {
    widget.classList.remove('hidden');
    document.getElementById('sidebar-username').innerText = currentUser.username;
    
    const roleEl = document.getElementById('sidebar-user-role');
    roleEl.innerText = currentUser.role;
    roleEl.className = `user-role-badge ${currentUser.role}`;
    
    if (currentUser.role === 'admin' && !isDemoMode) {
      adminBtn.classList.remove('hidden');
    } else {
      adminBtn.classList.add('hidden');
    }
  } else {
    widget.classList.add('hidden');
    adminBtn.classList.add('hidden');
  }
}

async function initializeAppWithTimeout() {
  try {
    const response = await fetch('/api/status');
    if (response.ok) {
      isDemoMode = false;
      const warningBanner = document.getElementById('firebase-warning');
      if (warningBanner) warningBanner.classList.add('hidden');
      console.log("🔥 Đã kết nối với Database API cục bộ thành công!");
      return;
    }
  } catch (error) {
    console.warn("⚠️ Không kết nối được API cục bộ, chuyển sang chế độ Demo (LocalStorage):", error);
  }
  switchToDemoMode("Không thể kết nối đến Local API Server.");
}

function switchToDemoMode(reason) {
  isDemoMode = true;
  const warningBanner = document.getElementById('firebase-warning');
  if (warningBanner) {
    warningBanner.classList.remove('hidden');
    warningBanner.querySelector('.warning-banner-desc').innerHTML = 
      `Ứng dụng đang chạy ở <strong>Chế độ Demo (Lưu trữ cục bộ LocalStorage)</strong> do: <em>${reason}</em>.<br>` +
      `Hãy chắc chắn rằng bạn đã chạy server bằng file <code>server.ps1</code> để lưu dữ liệu vĩnh viễn trên máy tính.`;
  }
}

// LocalStorage Keys
const FOLDERS_KEY = 'quizlet_srs_folders';
const SETS_KEY = 'quizlet_srs_sets';
const CARDS_KEY = 'quizlet_srs_cards';

// Local storage helpers
function getLocalStorage(key) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function saveLocalStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// Convert Firestore/string date to Date
function getReviewDate(next_review) {
  if (!next_review) return new Date();
  if (typeof next_review.toDate === 'function') return next_review.toDate();
  if (next_review.seconds) return new Date(next_review.seconds * 1000);
  return new Date(next_review);
}

// Database error helper
function handleDbError(error, contextName = "") {
  console.error(`Local API Error during ${contextName}:`, error);
  alert(`Lỗi thao tác Database (${contextName}):\n${error.message}\n\nNguyên nhân phổ biến:\n1. Server server.ps1 đã bị tắt.\n2. Lỗi cấu trúc dữ liệu JSON.\n3. Quyền ghi file bị hạn chế.`);
}

// ==========================================
// DATABASE OPERATIONS
// ==========================================

// --- Folders ---
async function getFolders() {
  if (isDemoMode) {
    return getLocalStorage(FOLDERS_KEY);
  } else {
    try {
      const res = await fetch('/api/folders');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const list = await res.json();
      list.sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));
      return list;
    } catch (e) {
      handleDbError(e, "Tải danh sách thư mục");
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
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFolder)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      handleDbError(e, "Tạo Thư mục");
      throw e;
    }
  }
}

async function updateFolderName(folderId, newName) {
  const cleanName = newName.trim();
  if (isDemoMode) {
    const list = getLocalStorage(FOLDERS_KEY);
    const idx = list.findIndex(f => f.id === folderId);
    if (idx !== -1) {
      list[idx].name = cleanName;
      saveLocalStorage(FOLDERS_KEY, list);
    }
  } else {
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName })
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    } catch (e) {
      handleDbError(e, "Đổi tên Thư mục");
      throw e;
    }
  }
}

async function deleteFolder(folderId) {
  if (isDemoMode) {
    let folders = getLocalStorage(FOLDERS_KEY);
    folders = folders.filter(f => f.id !== folderId);
    saveLocalStorage(FOLDERS_KEY, folders);

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
      const res = await fetch(`/api/folders/${folderId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    } catch (e) {
      handleDbError(e, "Xóa Thư mục");
      throw e;
    }
  }
}

// --- Study Sets ---
async function getStudySets(folderId = null) {
  if (isDemoMode) {
    const list = getLocalStorage(SETS_KEY);
    if (folderId) return list.filter(s => s.folder_id === folderId);
    return list;
  } else {
    try {
      const url = folderId ? `/api/sets?folderId=${folderId}` : '/api/sets';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      handleDbError(e, "Tải danh sách học phần");
      return [];
    }
  }
}

async function getStudySetById(setId) {
  if (isDemoMode) {
    const list = getLocalStorage(SETS_KEY);
    return list.find(s => s.id === setId) || null;
  } else {
    try {
      const res = await fetch(`/api/sets/${setId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      handleDbError(e, "Tải thông tin học phần");
      return null;
    }
  }
}

async function createOrUpdateStudySet(setId, folderId, title, description) {
  const setObj = {
    folder_id: folderId,
    title: title.trim(),
    description: description.trim()
  };
  if (setId) {
    setObj.id = setId;
  }

  if (isDemoMode) {
    const list = getLocalStorage(SETS_KEY);
    if (setId) {
      const idx = list.findIndex(s => s.id === setId);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...setObj };
      }
    } else {
      setObj.id = 'set_' + Date.now();
      list.push(setObj);
    }
    saveLocalStorage(SETS_KEY, list);
    return setObj;
  } else {
    try {
      const res = await fetch('/api/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setObj)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      handleDbError(e, "Lưu Học phần");
      throw e;
    }
  }
}

async function saveSetHighscore(setId, score) {
  if (isDemoMode) {
    const list = getLocalStorage(SETS_KEY);
    const idx = list.findIndex(s => s.id === setId);
    if (idx !== -1) {
      if (list[idx].highscore === undefined || score < list[idx].highscore) {
        list[idx].highscore = score;
        saveLocalStorage(SETS_KEY, list);
        return true;
      }
    }
    return false;
  } else {
    try {
      const res = await fetch(`/api/sets/${setId}/highscore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score })
      });
      if (res.ok) {
        return true;
      }
    } catch (e) {
      console.error("Lỗi lưu highscore:", e);
    }
    return false;
  }
}

async function getSetHighscore(setId) {
  const set = await getStudySetById(setId);
  return set ? (set.highscore || 0) : 0;
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
      const res = await fetch(`/api/sets/${setId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    } catch (e) {
      handleDbError(e, "Xóa Học phần");
      throw e;
    }
  }
}

// --- Cards ---
async function getCardsOfSet(setId) {
  if (isDemoMode) {
    const list = getLocalStorage(CARDS_KEY);
    return list.filter(c => c.set_id === setId);
  } else {
    try {
      const res = await fetch(`/api/cards?setId=${setId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (e) {
      handleDbError(e, "Tải danh sách thẻ từ vựng");
      return [];
    }
  }
}

async function saveSetCards(setId, cardsList) {
  if (isDemoMode) {
    let allCards = getLocalStorage(CARDS_KEY);
    allCards = allCards.filter(c => c.set_id !== setId);
    
    cardsList.forEach(card => {
      const newCard = {
        id: card.id || 'card_' + Date.now() + Math.random().toString(36).substr(2, 5),
        set_id: setId,
        front_word: card.front_word.trim(),
        back_meaning: card.back_meaning.trim(),
        hint: card.hint.trim(),
        word_type: card.word_type ? card.word_type.trim() : "",
        phonetic: card.phonetic ? card.phonetic.trim() : "",
        existing_image_url: card.existing_image_url || "",
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
      const processedCards = cardsList.map(card => ({
        id: card.id || null,
        set_id: setId,
        front_word: card.front_word.trim(),
        back_meaning: card.back_meaning.trim(),
        hint: card.hint.trim(),
        word_type: card.word_type ? card.word_type.trim() : "",
        phonetic: card.phonetic ? card.phonetic.trim() : "",
        existing_image_url: card.existing_image_url || "",
        interval: card.interval || 0,
        repetition: card.repetition || 0,
        ease_factor: card.ease_factor || 2.5,
        next_review: card.next_review || new Date().toISOString()
      }));

      const res = await fetch(`/api/sets/${setId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: processedCards })
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
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
      const res = await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    } catch (e) {
      handleDbError(e, "Cập nhật chỉ số SRS");
      throw e;
    }
  }
}

// --- Seeder ---
async function seedDemoData() {
  const folders = await getFolders();
  const existingFolder = folders.find(f => f.name.toLowerCase() === "human-con người");
  if (existingFolder) {
    alert("Dữ liệu mẫu 'human-con người' đã được nạp trước đó rồi!");
    return;
  }

  const folder = await createFolder("human-con người");
  const folderId = folder.id;

  const setLeg = await createOrUpdateStudySet(null, folderId, "Leg - Chân", "Từ vựng về bộ phận ở cẳng chân");
  const setLegCards = [
    { front_word: "Leg", back_meaning: "n. Chân", hint: "Cơ quan di chuyển chính", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Knee", back_meaning: "n. Đầu gối", hint: "Khớp nối đùi và cẳng chân", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Ankle", back_meaning: "n. Cổ chân", hint: "Khớp nối bàn chân và cẳng chân", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Foot", back_meaning: "n. Bàn chân", hint: "Phần dưới cùng nâng đỡ cơ thể", interval: 0, repetition: 0, ease_factor: 2.5 }
  ];
  await saveSetCards(setLeg.id, setLegCards);

  const setArm = await createOrUpdateStudySet(null, folderId, "Arm - cánh tay", "Từ vựng về bộ phận ở Tay");
  const setArmCards = [
    { front_word: "Arm", back_meaning: "n. Cánh tay", hint: "Bộ phận từ vai đến cổ tay", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Elbow", back_meaning: "n. Khuỷu tay", hint: "Khớp nối giữa cánh tay", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Wrist", back_meaning: "n. Cổ tay", hint: "Nơi đeo đồng hồ", interval: 0, repetition: 0, ease_factor: 2.5 },
    { front_word: "Hand", back_meaning: "n. Bàn tay", hint: "Dùng để cầm nắm đồ vật", interval: 0, repetition: 0, ease_factor: 2.5 }
  ];
  await saveSetCards(setArm.id, setArmCards);
}

// ==========================================
// SPA ROUTER (VIEW SWITCHER)
// ==========================================
let activeView = 'home';
let activeFolderId = null;
let activeSetId = null;
let currentStudyCards = [];
let studyFilterMode = 'all'; // 'all' or 'due'
let quizTimeout = null;
let forecastChartInstance = null;
let retentionChartInstance = null;

const views = {
  'home': document.getElementById('view-home'),
  'folders': document.getElementById('view-folders'),
  'folder': document.getElementById('view-folder'),
  'set-detail': document.getElementById('view-set-detail'),
  'edit-set': document.getElementById('view-edit-set'),
  'analytics': document.getElementById('view-analytics'),
  'auth': document.getElementById('view-auth'),
  'admin': document.getElementById('view-admin')
};

function showView(viewName) {
  activeView = viewName;
  Object.keys(views).forEach(k => {
    if (k === viewName) views[k].classList.remove('hidden');
    else views[k].classList.add('hidden');
  });

  // Reset active state in sidebar nav
  document.getElementById('menu-home-btn').classList.remove('active');
  document.getElementById('menu-library-btn').classList.remove('active');
  document.getElementById('menu-analytics-btn').classList.remove('active');
  document.getElementById('menu-admin-btn').classList.remove('active');
  
  if (viewName === 'home') {
    document.getElementById('menu-home-btn').classList.add('active');
    initHomeView();
    if (typeof checkAndShowResumeBanner === 'function') checkAndShowResumeBanner();
  } else if (viewName === 'folders' || viewName === 'folder') {
    document.getElementById('menu-library-btn').classList.add('active');
  } else if (viewName === 'analytics') {
    document.getElementById('menu-analytics-btn').classList.add('active');
    initAnalyticsView();
  } else if (viewName === 'admin') {
    document.getElementById('menu-admin-btn').classList.add('active');
    loadAdminDashboard();
  }

  // Sidebar shortcut activation
  const shortcuts = [
    document.getElementById('shortcut-flashcards-btn'),
    document.getElementById('shortcut-match-btn'),
    document.getElementById('shortcut-test-btn')
  ];

  if (activeSetId) {
    shortcuts.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    });
  } else {
    shortcuts.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    });
  }
}

// ==========================================
// STREAK & GLOBAL STATS
// ==========================================
function recordActivity() {
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
}

function renderCharts(allCards) {
  const forecastCtx = document.getElementById('forecastChart');
  const retentionCtx = document.getElementById('retentionChart');
  if (!forecastCtx || !retentionCtx) return;

  const mastered = allCards.filter(c => (c.repetition || 0) >= 3).length;
  const learning = allCards.filter(c => (c.repetition || 0) > 0 && (c.repetition || 0) < 3).length;
  const unlearned = allCards.filter(c => !(c.repetition || 0)).length;

  if (retentionChartInstance) {
    retentionChartInstance.destroy();
  }

  const isDark = document.body.classList.contains('dark-mode');
  const textClr = isDark ? '#f6f7fb' : '#1a1d23';
  const gridClr = isDark ? '#3c4257' : '#d9dde8';

  retentionChartInstance = new Chart(retentionCtx, {
    type: 'doughnut',
    data: {
      labels: ['Đã thuộc', 'Đang học', 'Chưa ôn tập'],
      datasets: [{
        data: [mastered, learning, unlearned],
        backgroundColor: ['#23b26d', '#ff6b6b', '#939bb4'],
        borderWidth: isDark ? 2 : 1,
        borderColor: isDark ? '#2e3856' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textClr,
            font: { family: 'Inter', weight: 'bold' }
          }
        }
      }
    }
  });

  const now = new Date();
  now.setHours(0,0,0,0);
  
  const forecastCounts = [0, 0, 0, 0, 0, 0, 0];
  const dayNames = [];
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    if (i === 0) {
      dayNames.push('Hôm nay');
    } else {
      dayNames.push(day.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }));
    }
  }

  allCards.forEach(c => {
    const nextReview = new Date(c.next_review || 0);
    nextReview.setHours(0,0,0,0);
    const diffTime = nextReview - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) {
      forecastCounts[0]++;
    } else if (diffDays < 7) {
      forecastCounts[diffDays]++;
    }
  });

  if (forecastChartInstance) {
    forecastChartInstance.destroy();
  }

  forecastChartInstance = new Chart(forecastCtx, {
    type: 'bar',
    data: {
      labels: dayNames,
      datasets: [{
        label: 'Số thẻ cần ôn',
        data: forecastCounts,
        backgroundColor: 'rgba(66, 85, 255, 0.85)',
        hoverBackgroundColor: 'rgba(47, 63, 224, 1)',
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textClr }
        },
        y: {
          grid: { color: gridClr },
          ticks: { color: textClr, stepSize: 1, precision: 0 }
        }
      }
    }
  });
}

async function refreshGlobalStats() {
  const folders = await getFolders();
  const sets = await getStudySets();
  let allCards = [];

  if (isDemoMode) {
    allCards = getLocalStorage(CARDS_KEY);
  } else {
    try {
      const res = await fetch('/api/cards');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      allCards = await res.json();
    } catch(e){
      handleDbError(e, "Tải thống kê từ vựng");
    }
  }

  document.getElementById('stat-folders').innerText = folders.length;
  document.getElementById('stat-sets').innerText = sets.length;
  document.getElementById('stat-cards').innerText = allCards.length;
  document.getElementById('total-cards-label').innerText = `${allCards.length} từ vựng`;

  // Update Today's Review banner counts
  const now = new Date();
  const dueCards = allCards.filter(c => {
    const revDate = new Date(c.next_review || 0);
    return revDate <= now;
  });

  const dueCount = dueCards.length;
  document.getElementById('today-due-count').innerText = dueCount;
  
  const startReviewBtn = document.getElementById('start-review-btn');
  const reviewText = document.getElementById('today-review-count-text');
  if (dueCount > 0) {
    startReviewBtn.disabled = false;
    reviewText.innerHTML = `Bạn có <strong>${dueCount}</strong> từ vựng đến hạn ôn tập.`;
  } else {
    startReviewBtn.disabled = true;
    reviewText.innerHTML = `Tuyệt vời! Bạn đã hoàn thành hết các thẻ cần ôn hôm nay.`;
  }

  const total = allCards.length;
  if (total === 0) {
    document.getElementById('progress-mastered').style.width = '0%';
    document.getElementById('progress-learning').style.width = '0%';
    document.getElementById('progress-new').style.width = '100%';
    document.getElementById('count-mastered').innerText = '0';
    document.getElementById('count-learning').innerText = '0';
    document.getElementById('count-new').innerText = '0';
    
    if (retentionChartInstance) { retentionChartInstance.destroy(); retentionChartInstance = null; }
    if (forecastChartInstance) { forecastChartInstance.destroy(); forecastChartInstance = null; }
    return;
  }

  const mastered = allCards.filter(c => (c.repetition || 0) >= 3).length;
  const learning = allCards.filter(c => (c.repetition || 0) > 0 && (c.repetition || 0) < 3).length;
  const unlearned = allCards.filter(c => !(c.repetition || 0)).length;

  document.getElementById('count-mastered').innerText = mastered;
  document.getElementById('count-learning').innerText = learning;
  document.getElementById('count-new').innerText = unlearned;

  document.getElementById('progress-mastered').style.width = `${(mastered / total) * 100}%`;
  document.getElementById('progress-learning').style.width = `${(learning / total) * 100}%`;
  document.getElementById('progress-new').style.width = `${(unlearned / total) * 100}%`;

  // Draw charts
  renderCharts(allCards);
}

// ==========================================
// RENDER SIDEBAR
// ==========================================
async function renderSidebar() {
  const folders = await getFolders();
  const listEl = document.getElementById('folders-sidebar-list');
  listEl.innerHTML = '';

  if (folders.length === 0) {
    listEl.innerHTML = `<div class="sidebar-folder-item" style="font-style: italic; opacity: 0.6;">Chưa có thư mục...</div>`;
    return;
  }

  folders.forEach(f => {
    const btn = document.createElement('button');
    const isActive = activeFolderId === f.id && (activeView === 'folder' || activeView === 'set-detail');
    btn.className = `sidebar-folder-item ${isActive ? 'active' : ''}`;
    btn.innerHTML = `<i class="fas fa-folder"></i> <span style="overflow:hidden; text-overflow:ellipsis;">${f.name}</span>`;
    btn.addEventListener('click', () => {
      showFolderView(f.id);
    });
    listEl.appendChild(btn);
  });
}

// ==========================================
// 1. HOME VIEW LOGIC
// ==========================================
async function initHomeView() {
  activeFolderId = null;
  activeSetId = null;
  await renderSidebar();
  await refreshGlobalStats();
}

// Quick seed action
document.getElementById('quick-seed-btn').addEventListener('click', async () => {
  const btn = document.getElementById('quick-seed-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang nạp dữ liệu...';
  try {
    await seedDemoData();
    alert("Nạp thành công thư mục 'human-con người' cùng 2 học phần mẫu (Leg, Arm)!");
    initHomeView();
  } catch(e) {
    alert("Lỗi nạp dữ liệu mẫu");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-bolt"></i> Nạp dữ liệu mẫu Con Người';
  }
});

// ==========================================
// 2. FOLDERS LIST VIEW
// ==========================================
async function initFoldersListView() {
  activeFolderId = null;
  activeSetId = null;
  showView('folders');
  await renderSidebar();

  const folders = await getFolders();
  const gridEl = document.getElementById('folders-grid');
  gridEl.innerHTML = '';

  if (folders.length === 0) {
    gridEl.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-state-icon"><i class="fas fa-folder-plus"></i></div>
        <p class="empty-state-title">Chưa có thư mục nào</p>
        <p class="empty-state-desc">Hãy tạo thư mục đầu tiên để quản lý các học phần con của bạn dễ dàng hơn.</p>
        <button class="btn-empty-action" onclick="openFolderModal()">Tạo thư mục ngay</button>
      </div>
    `;
    return;
  }

  for (const f of folders) {
    const sets = await getStudySets(f.id);
    const card = document.createElement('div');
    card.className = 'folder-card-wrapper';
    card.innerHTML = `
      <button class="btn-delete-folder-card" title="Xóa thư mục lớn">
        <i class="fas fa-trash-alt"></i>
      </button>
      <i class="fas fa-folder folder-card-icon"></i>
      <div class="folder-card-name">${f.name}</div>
      <div class="folder-card-meta">
        <span class="folder-card-meta-pill">${sets.length} học phần</span>
        <span class="folder-card-meta-pill">Tác giả: bạn</span>
      </div>
    `;
    card.addEventListener('click', () => {
      showFolderView(f.id);
    });

    const deleteBtn = card.querySelector('.btn-delete-folder-card');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Ngăn mở folder khi bấm nút xóa
      if (confirm(`Bạn có chắc muốn xóa thư mục "${f.name}" không?\nTất cả học phần và thẻ bên trong thư mục này sẽ bị xóa vĩnh viễn.`)) {
        try {
          await deleteFolder(f.id);
          showToast(`Đã xóa thư mục "${f.name}" thành công!`, 'success');
          initFoldersListView();
        } catch (err) {
          showToast('Có lỗi xảy ra khi xóa thư mục.', 'error');
        }
      }
    });

    gridEl.appendChild(card);
  }
}

// Folder Create Modal actions
window.openFolderModal = function() {
  const modal = document.getElementById('folderModal');
  document.getElementById('folderNameInput').value = '';
  modal.classList.add('active');
  document.getElementById('folderNameInput').focus();
};

window.closeFolderModal = function() {
  document.getElementById('folderModal').classList.remove('active');
};

document.getElementById('confirmFolderBtn').addEventListener('click', async () => {
  const input = document.getElementById('folderNameInput');
  const name = input.value.trim();
  if (!name) {
    alert("Vui lòng nhập tên thư mục!");
    return;
  }
  closeFolderModal();
  const folder = await createFolder(name);
  showFolderView(folder.id);
});

// Sidebar add folder button
document.getElementById('sidebar-add-folder-btn')?.addEventListener('click', openFolderModal);
document.getElementById('new-folder-btn-page')?.addEventListener('click', openFolderModal);

// ==========================================
// 3. FOLDER DETAIL VIEW LOGIC
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
  
  // Load sets under folder
  currentFolderSets = await getStudySets(folderId);
  renderFolderSetsList();
}

async function renderFolderSetsList() {
  const container = document.getElementById('folder-sets-list');
  container.innerHTML = '';

  if (currentFolderSets.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fas fa-folder-open"></i></div>
        <p class="empty-state-title">Thư mục của bạn đang trống</p>
        <p class="empty-state-desc">Hãy thêm học phần con đầu tiên để bắt đầu nhập từ vựng.</p>
        <button class="btn-empty-action" onclick="showEditSetView(null)">Thêm học phần</button>
      </div>
    `;
    return;
  }

  for (const set of currentFolderSets) {
    const cards = await getCardsOfSet(set.id);
    const cardEl = document.createElement('div');
    cardEl.className = 'set-row-card';
    cardEl.innerHTML = `
      <div class="set-row-body">
        <div class="set-card-meta-row">
          <span class="set-card-meta-pill">${cards.length} thuật ngữ</span>
        </div>
        <h4 class="set-card-title">${set.title}</h4>
        <p class="set-card-desc">${set.description || 'Chưa có mô tả.'}</p>
      </div>
      <div class="set-card-actions">
        <div class="dropdown-container">
          <button class="btn-action-more" onclick="toggleSetMenu(event, '${set.id}')">
            <i class="fas fa-ellipsis-v"></i>
          </button>
          <div id="setMenu-${set.id}" class="dropdown-pane">
            <button class="dropdown-item" onclick="editSetFromMenu(event, '${set.id}')">
              <i class="fas fa-pen"></i> Chỉnh sửa học phần
            </button>
            <button class="dropdown-item text-danger" onclick="deleteSetFromMenu(event, '${set.id}')">
              <i class="fas fa-trash-alt"></i> Xóa khỏi thư mục
            </button>
          </div>
        </div>
      </div>
    `;
    // Click body -> Open study view
    cardEl.querySelector('.set-row-body').addEventListener('click', () => {
      showSetDetailView(set.id);
    });
    container.appendChild(cardEl);
  }
}

// Folder dropdown toggle
const btnFolderMore = document.getElementById('btn-folder-more');
const folderDropdown = document.getElementById('folder-dropdown-menu');
btnFolderMore.addEventListener('click', (e) => {
  e.stopPropagation();
  folderDropdown.classList.toggle('show');
});

// Global click listener to close dropdowns
window.addEventListener('click', () => {
  folderDropdown.classList.remove('show');
  document.querySelectorAll('.dropdown-pane').forEach(p => p.classList.remove('show'));
});

// Set menu dropdown helper
window.toggleSetMenu = function(e, setId) {
  e.stopPropagation();
  document.querySelectorAll('.dropdown-pane').forEach(p => {
    if (p.id !== `setMenu-${setId}`) p.classList.remove('show');
  });
  document.getElementById(`setMenu-${setId}`).classList.toggle('show');
};

// Actions inside set menu
window.editSetFromMenu = function(e, setId) {
  e.stopPropagation();
  showEditSetView(setId);
};

window.deleteSetFromMenu = async function(e, setId) {
  e.stopPropagation();
  if (confirm("Bạn có chắc chắn muốn xóa học phần này và toàn bộ từ vựng bên trong?")) {
    await deleteStudySet(setId);
    showFolderView(activeFolderId);
  }
};

// Rename Folder Modal Handlers
window.openRenameFolderModal = function() {
  const modal = document.getElementById('renameModal');
  const input = document.getElementById('renameFolderNameInput');
  input.value = document.getElementById('folder-title').innerText;
  modal.classList.add('active');
  input.focus();
  input.select();
};

window.closeRenameFolderModal = function() {
  document.getElementById('renameModal').classList.remove('active');
};

document.getElementById('folder-rename-action').addEventListener('click', openRenameFolderModal);

document.getElementById('confirmRenameFolderBtn').addEventListener('click', async () => {
  const input = document.getElementById('renameFolderNameInput');
  const newName = input.value.trim();
  if (!newName) {
    alert("Tên thư mục không được để trống!");
    return;
  }
  closeRenameFolderModal();
  await updateFolderName(activeFolderId, newName);
  showFolderView(activeFolderId);
});

// Delete folder action
document.getElementById('folder-delete-action').addEventListener('click', async () => {
  if (confirm("LƯU Ý: Xóa thư mục lớn sẽ xóa toàn bộ các học phần con và từ vựng bên trong. Bạn có chắc chắn?")) {
    await deleteFolder(activeFolderId);
    initFoldersListView();
  }
});

// Back link folder detail -> list
document.getElementById('folder-back-link').addEventListener('click', initFoldersListView);
document.getElementById('add-set-to-folder-btn').addEventListener('click', () => showEditSetView(null));

// ==========================================
// 4. STUDY SET DETAIL VIEW & SUBMODES
// ==========================================
let currentSetCards = [];
let fcActiveIndex = 0;
let fcAutoplayInterval = null;
let fcAutoplayRunning = false;
let fcIsFlipped = false;
let fcCardStates = []; // 1: Mastered, -1: Learning, 0: Remaining

async function showSetDetailView(setId) {
  if (setId === 'all_due') {
    activeSetId = 'all_due';
    showView('set-detail');
    document.getElementById('set-detail-title').innerText = 'Ôn tập tổng hợp hôm nay';
    
    let allCards = [];
    if (isDemoMode) {
      allCards = getLocalStorage(CARDS_KEY);
    } else {
      try {
        const res = await fetch('/api/cards');
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        allCards = await res.json();
      } catch (e) {
        handleDbError(e, "Tải toàn bộ từ vựng để ôn tập");
      }
    }
    
    const now = new Date();
    currentSetCards = allCards.filter(c => {
      const revDate = new Date(c.next_review || 0);
      return revDate <= now;
    });
    
    document.getElementById('total-set-cards').innerText = currentSetCards.length;
    
    // Reset toolbar
    document.getElementById('terms-search-input').value = '';
    document.getElementById('terms-filter-select').value = 'all';
    document.getElementById('terms-sort-select').value = 'index';
    filterAndRenderSetTerms();
    
    document.getElementById('study-select-banner').classList.add('hidden');
    studyFilterMode = 'due';
    
    document.getElementById('studyMode').style.display = 'none';
    document.getElementById('studyMode').value = 'flashcards';
    selectStudyMode('flashcards');
    return;
  }

  activeSetId = setId;
  showView('set-detail');
  document.getElementById('studyMode').style.display = 'block';

  const setObj = await getStudySetById(setId);
  if (!setObj) return;

  document.getElementById('set-detail-title').innerText = setObj.title;

  currentSetCards = await getCardsOfSet(setId);
  document.getElementById('total-set-cards').innerText = currentSetCards.length;

  // Reset toolbar
  document.getElementById('terms-search-input').value = '';
  document.getElementById('terms-filter-select').value = 'all';
  document.getElementById('terms-sort-select').value = 'index';
  filterAndRenderSetTerms();

  // Bind toolbar listeners
  document.getElementById('terms-search-input').oninput = filterAndRenderSetTerms;
  document.getElementById('terms-filter-select').onchange = filterAndRenderSetTerms;
  document.getElementById('terms-sort-select').onchange = filterAndRenderSetTerms;

  const now = new Date();
  const dueCards = currentSetCards.filter(c => {
    const revDate = new Date(c.next_review || 0);
    return revDate <= now;
  });
  
  document.getElementById('set-due-count').innerText = dueCards.length;
  const banner = document.getElementById('study-select-banner');
  const btnDue = document.getElementById('btn-study-due');
  
  if (dueCards.length > 0) {
    btnDue.disabled = false;
    banner.classList.remove('hidden');
    
    document.querySelector('.flashcard-container').classList.add('hidden');
    document.querySelector('.study-card-controls').classList.add('hidden');
    document.querySelector('.study-stats-grid').classList.add('hidden');
  } else {
    btnDue.disabled = true;
    banner.classList.add('hidden');
    
    document.querySelector('.flashcard-container').classList.remove('hidden');
    document.querySelector('.study-card-controls').classList.remove('hidden');
    document.querySelector('.study-stats-grid').classList.remove('hidden');
    
    studyFilterMode = 'all';
    document.getElementById('studyMode').value = 'flashcards';
    selectStudyMode('flashcards');
  }
}

function renderSetTermsList() {
  const container = document.getElementById('set-terms-list');
  container.innerHTML = '';

  if (currentSetCards.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 24px; font-style:italic; opacity:0.6;">Chưa có từ vựng nào. Hãy bấm "Chỉnh sửa" để thêm từ.</div>`;
    return;
  }

  currentSetCards.forEach((c, idx) => {
    const row = document.createElement('div');
    row.className = 'word-row-item';
    row.innerHTML = `
      <div class="word-row-index">${idx + 1}</div>
      <div class="word-row-content" onclick="jumpToCardIndex(${idx})">
        <div class="word-row-term">
          ${escapeHtml(c.front_word)}
          ${c.phonetic ? `<span class="word-row-phonetic">${escapeHtml(c.phonetic)}</span>` : ''}
          ${c.word_type ? `<span class="word-row-type-badge">${escapeHtml(c.word_type)}</span>` : ''}
        </div>
        <div class="word-row-divider"></div>
        <div class="word-row-def">${escapeHtml(c.back_meaning)}</div>
      </div>
      <button class="word-row-speak-btn" onclick="event.stopPropagation(); speakText('${c.front_word.replace(/'/g, "\\'")}', 'en-US')">
        <i class="fas fa-volume-up"></i>
      </button>
    `;
    container.appendChild(row);
  });
}

function selectStudyMode(mode) {
  document.getElementById('subview-flashcards').classList.add('hidden');
  document.getElementById('subview-match').classList.add('hidden');
  document.getElementById('subview-quiz').classList.add('hidden');

  if (mode === 'flashcards') {
    document.getElementById('subview-flashcards').classList.remove('hidden');
    document.getElementById('subview-write').classList.add('hidden');
    initFlashcardsSubMode();
  } else if (mode === 'write') {
    document.getElementById('subview-flashcards').classList.add('hidden');
    document.getElementById('subview-match').classList.add('hidden');
    document.getElementById('subview-quiz').classList.add('hidden');
    document.getElementById('subview-write').classList.remove('hidden');
    initWriteMode();
  } else if (mode === 'match') {
    document.getElementById('subview-flashcards').classList.add('hidden');
    document.getElementById('subview-write').classList.add('hidden');
    document.getElementById('subview-match').classList.remove('hidden');
    initMatchSubMode();
  } else if (mode === 'quiz') {
    document.getElementById('subview-quiz').classList.remove('hidden');
    document.getElementById('subview-write').classList.add('hidden');
    initQuizSubMode();
  }
}

document.getElementById('studyMode').addEventListener('change', (e) => {
  selectStudyMode(e.target.value);
});

// Navigation bindings
document.getElementById('study-exit-btn').addEventListener('click', () => {
  showFolderView(activeFolderId);
});

document.getElementById('btn-edit-set-inline').addEventListener('click', () => {
  showEditSetView(activeSetId);
});

// --- SUBMODE 4.1: FLASHCARDS ---
function initFlashcardsSubMode() {
  stopFCAutoplay();
  fcActiveIndex = 0;
  fcIsFlipped = false;

  const now = new Date();
  if (studyFilterMode === 'due') {
    currentStudyCards = currentSetCards.filter(c => {
      const revDate = new Date(c.next_review || 0);
      return revDate <= now;
    });
  } else {
    currentStudyCards = [...currentSetCards];
  }

  // Initialize states
  fcCardStates = currentStudyCards.map(c => {
    if ((c.repetition || 0) >= 3) return 1;
    if ((c.repetition || 0) > 0) return -1;
    return 0;
  });

  updateFCStatsUI();
  updateFCCard('none');
}

function updateFCStatsUI() {
  const mastered = fcCardStates.filter(s => s === 1).length;
  const learning = fcCardStates.filter(s => s === -1).length;
  const unlearned = fcCardStates.filter(s => s === 0).length;

  document.getElementById('statKnown').innerText = mastered;
  document.getElementById('statLearning').innerText = learning;
  document.getElementById('statUnknown').innerText = unlearned;

  const total = currentStudyCards.length;
  if (total > 0) {
    document.getElementById('pb-known').style.width = (mastered / total * 100) + '%';
    document.getElementById('pb-learning').style.width = (learning / total * 100) + '%';
    document.getElementById('pb-unknown').style.width = (unlearned / total * 100) + '%';
  } else {
    document.getElementById('pb-known').style.width = '0%';
    document.getElementById('pb-learning').style.width = '0%';
    document.getElementById('pb-unknown').style.width = '0%';
  }
}

function updateFCCard(direction = 'none') {
  const container = document.querySelector('.flashcard-container');
  const actions = document.querySelector('.learning-actions-row');
  const controls = document.querySelector('.study-card-controls');
  const end = document.getElementById('end-screen');

  if (currentStudyCards.length === 0) {
    container.style.display = 'none';
    actions.style.display = 'none';
    controls.style.display = 'none';
    end.style.display = 'flex';
    
    document.getElementById('endKnown').innerText = '0';
    document.getElementById('endLearning').innerText = '0';
    document.getElementById('endUnknown').innerText = '0';
    
    document.getElementById('progress-fill').style.width = '0%';
    return;
  }

  if (fcActiveIndex >= currentStudyCards.length) {
    localStorage.removeItem('tct_resume_session');
    container.style.display = 'none';
    actions.style.display = 'none';
    controls.style.display = 'none';
    end.style.display = 'flex';

    document.getElementById('endKnown').innerText = fcCardStates.filter(s => s === 1).length;
    document.getElementById('endLearning').innerText = fcCardStates.filter(s => s === -1).length;
    document.getElementById('endUnknown').innerText = fcCardStates.filter(s => s === 0).length;
    
    document.getElementById('progress-fill').style.width = '100%';
    playAudioFeedback('complete');
    triggerConfetti();
    recordActivity();
    return;
  }

  saveResumeSession();

  container.style.display = 'flex';
  actions.style.display = 'flex';
  controls.style.display = 'flex';
  end.style.display = 'none';

  const fcInner = document.getElementById('flashcard');
  if (direction !== 'none') {
    fcInner.classList.add(direction === 'next' ? 'slide-next' : 'slide-prev');
  }

  setTimeout(() => {
    fcInner.classList.remove('is-flipped');
    fcIsFlipped = false;
    updateRatingActionsVisibility();

    const card = currentStudyCards[fcActiveIndex];
    document.getElementById('front-text').innerHTML = escapeHtml(card.front_word) + 
      (card.phonetic ? ` <span class="card-phonetic">${escapeHtml(card.phonetic)}</span>` : '') +
      (card.word_type ? ` <span class="card-word-type">(${escapeHtml(card.word_type)})</span>` : '');
    document.getElementById('back-text').innerText = card.back_meaning;

    const img = document.getElementById('card-image');
    if (card.existing_image_url) {
      img.src = card.existing_image_url;
      img.style.display = 'block';
    } else {
      img.src = '';
      img.style.display = 'none';
    }

    document.getElementById('fc-ef-val').innerText = card.ease_factor || 2.5;
    document.getElementById('fc-rep-val').innerText = card.repetition || 0;
    document.getElementById('fc-interval-val').innerText = card.interval || 0;

    document.getElementById('current-index').innerText = fcActiveIndex + 1;
    document.getElementById('progress-fill').style.width = ((fcActiveIndex + 1) / currentStudyCards.length * 100) + '%';
    updateActiveCardStarUI(card.starred);
    
    fcInner.classList.remove('slide-next', 'slide-prev');
    document.getElementById('prevBtn').disabled = fcActiveIndex === 0;
    document.getElementById('nextBtn').disabled = false;
  }, direction === 'none' ? 0 : 180);
}

// SM-2 Spaced Repetition calculation
function calculateSM2(q, prevRep, prevInterval, prevEF) {
  let repetition = prevRep;
  let interval = prevInterval;
  let ease_factor = prevEF;

  if (q >= 3) {
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 6;
    } else {
      interval = Math.ceil(interval * ease_factor);
    }
    repetition++;
  } else {
    repetition = 0;
    interval = 1;
  }

  ease_factor = ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease_factor < 1.3) ease_factor = 1.3;

  const next_review = new Date();
  next_review.setDate(next_review.getDate() + interval);

  return {
    repetition: repetition,
    interval: interval,
    ease_factor: parseFloat(ease_factor.toFixed(2)),
    next_review: next_review.toISOString()
  };
}

window.markCardSRS = async function(q) {
  if (fcActiveIndex >= currentStudyCards.length) return;

  const card = currentStudyCards[fcActiveIndex];
  const updated = calculateSM2(q, card.repetition || 0, card.interval || 0, card.ease_factor || 2.5);
  
  await updateCardSRS(card.id, updated);
  
  card.repetition = updated.repetition;
  card.interval = updated.interval;
  card.ease_factor = updated.ease_factor;
  card.next_review = updated.next_review;

  const mainCard = currentSetCards.find(c => c.id === card.id);
  if (mainCard) {
    mainCard.repetition = updated.repetition;
    mainCard.interval = updated.interval;
    mainCard.ease_factor = updated.ease_factor;
    mainCard.next_review = updated.next_review;
  }

  fcCardStates[fcActiveIndex] = updated.repetition >= 3 ? 1 : (updated.repetition > 0 ? -1 : 0);
  updateFCStatsUI();

  fcActiveIndex++;
  updateFCCard('next');
};

window.restartStudySession = function() {
  fcActiveIndex = 0;
  updateFCCard('none');
};

window.jumpToCardIndex = function(idx) {
  if (idx >= 0 && idx < currentStudyCards.length) {
    fcActiveIndex = idx;
    updateFCCard('none');
    document.querySelector('.flashcard-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

document.getElementById('end-exit-btn').addEventListener('click', () => {
  showFolderView(activeFolderId);
});

// Pronunciation
window.speakWord = function(side) {
  const text = side === 'front' 
    ? document.getElementById('front-text').innerText 
    : document.getElementById('back-text').innerText;
  speakText(text, side === 'front' ? 'en-US' : 'vi-VN');
};

function speakText(text, lang) {
  if (!text || text === "English Word") return;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
}

// Flip Card Action
const fcInner = document.getElementById('flashcard');
fcInner.addEventListener('click', () => {
  fcInner.classList.toggle('is-flipped');
  fcIsFlipped = !fcIsFlipped;
  updateRatingActionsVisibility();
  playAudioFeedback('flip');
});

document.getElementById('flipBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  fcInner.classList.toggle('is-flipped');
  fcIsFlipped = !fcIsFlipped;
  updateRatingActionsVisibility();
  playAudioFeedback('flip');
});

// Arrow Keys navigation
document.getElementById('prevBtn').addEventListener('click', () => {
  if (fcActiveIndex > 0) {
    fcActiveIndex--;
    updateFCCard('prev');
  }
});

document.getElementById('nextBtn').addEventListener('click', () => {
  if (fcActiveIndex < currentStudyCards.length - 1) {
    fcActiveIndex++;
    updateFCCard('next');
  }
});

// Autoplay
document.getElementById('autoplayBtn').addEventListener('click', () => {
  const btn = document.getElementById('autoplayBtn');
  if (fcAutoplayRunning) {
    stopFCAutoplay();
  } else {
    fcAutoplayRunning = true;
    btn.innerHTML = '⏸️';
    fcAutoplayInterval = setInterval(() => {
      if (fcActiveIndex >= currentStudyCards.length - 1) {
        stopFCAutoplay();
      } else {
        fcActiveIndex++;
        updateFCCard('next');
      }
    }, 4000);
  }
});

function stopFCAutoplay() {
  fcAutoplayRunning = false;
  document.getElementById('autoplayBtn').innerHTML = '▶️';
  if (fcAutoplayInterval) {
    clearInterval(fcAutoplayInterval);
    fcAutoplayInterval = null;
  }
}

// Shuffle cards
document.getElementById('shuffleBtn').addEventListener('click', () => {
  for (let i = currentStudyCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentStudyCards[i], currentStudyCards[j]] = [currentStudyCards[j], currentStudyCards[i]];
    [fcCardStates[i], fcCardStates[j]] = [fcCardStates[j], fcCardStates[i]];
  }
  fcActiveIndex = 0;
  updateFCCard('none');
});

// Fullscreen
document.getElementById('fullscreenBtn').addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});

// Keyboard shortcuts helper
document.addEventListener('keydown', (e) => {
  if (activeView !== 'set-detail' || document.getElementById('subview-flashcards').classList.contains('hidden')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if (e.code === 'Space') {
    e.preventDefault();
    fcInner.classList.toggle('is-flipped');
    fcIsFlipped = !fcIsFlipped;
    updateRatingActionsVisibility();
    playAudioFeedback('flip');
  }
  if (e.code === 'ArrowRight') document.getElementById('nextBtn').click();
  if (e.code === 'ArrowLeft') document.getElementById('prevBtn').click();
  
  if (fcIsFlipped) {
    if (e.key === '1') { e.preventDefault(); markCardSRS(1); }
    if (e.key === '2') { e.preventDefault(); markCardSRS(3); }
    if (e.key === '3') { e.preventDefault(); markCardSRS(4); }
    if (e.key === '4') { e.preventDefault(); markCardSRS(5); }
  }
});

// Swipe Gesture logic
let startX = 0, currentX = 0, isDragging = false;
fcInner.addEventListener('pointerdown', (e) => {
  startX = e.clientX;
  isDragging = true;
  fcInner.setPointerCapture(e.pointerId);
  fcInner.classList.add('dragging');
  fcInner.style.transition = 'none';
});

fcInner.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  currentX = e.clientX - startX;
  fcInner.style.transform = `translateX(${currentX}px) rotate(${currentX / 16}deg) ${fcIsFlipped ? 'rotateY(180deg)' : ''}`;
});

function handlePointerEnd() {
  if (!isDragging) return;
  isDragging = false;
  fcInner.classList.remove('dragging');
  fcInner.style.transition = '';

  const threshold = 100;
  if (Math.abs(currentX) > threshold) {
    if (currentX > 0) {
      fcInner.style.transform = `translateX(200px) rotate(15deg) ${fcIsFlipped ? 'rotateY(180deg)' : ''}`;
      fcInner.style.opacity = '0';
      setTimeout(() => {
        fcInner.style.transform = '';
        fcInner.style.opacity = '';
        markCardSRS(4); // Good
      }, 150);
    } else {
      fcInner.style.transform = `translateX(-200px) rotate(-15deg) ${fcIsFlipped ? 'rotateY(180deg)' : ''}`;
      fcInner.style.opacity = '0';
      setTimeout(() => {
        fcInner.style.transform = '';
        fcInner.style.opacity = '';
        markCardSRS(1); // Again
      }, 150);
    }
  } else {
    fcInner.style.transform = fcIsFlipped ? 'rotateY(180deg)' : '';
  }
  currentX = 0;
}

fcInner.addEventListener('pointerup', handlePointerEnd);
fcInner.addEventListener('pointercancel', handlePointerEnd);

// Stats cards modals trigger
document.querySelectorAll('.study-stat-card').forEach(card => {
  card.addEventListener('click', () => {
    const state = parseInt(card.dataset.state);
    showStatsWordsModal(state);
  });
});

window.showStatsWordsModal = function(state) {
  const filtered = currentSetCards.map((c, i) => ({ ...c, originalIdx: i }))
                              .filter(c => fcCardStates[c.originalIdx] === state);

  const titleMap = {
    1: 'Từ đã thuộc',
    '-1': 'Từ chưa thuộc',
    0: 'Từ chưa học'
  };

  document.getElementById('modalTitle').innerText = titleMap[state];
  const listEl = document.getElementById('wordsList');
  listEl.innerHTML = '';

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding: 48px; opacity: 0.5;">Danh sách trống.</div>`;
  } else {
    filtered.forEach(c => {
      const row = document.createElement('div');
      row.className = 'stats-word-row';
      row.innerHTML = `
        <div class="stats-word-index-badge">${c.originalIdx + 1}</div>
        <div class="stats-word-main-info" onclick="jumpToCardIndex(${c.originalIdx}); closeWordsModal();">
          <div class="stats-word-term-text">
            ${escapeHtml(c.front_word)} 
            ${c.phonetic ? `<span class="word-row-phonetic">${escapeHtml(c.phonetic)}</span>` : ''} 
            ${c.word_type ? `<span class="word-row-type-badge">${escapeHtml(c.word_type)}</span>` : ''}
          </div>
          <div class="stats-word-def-text">${escapeHtml(c.back_meaning)}</div>
        </div>
        <button class="word-row-speak-btn" onclick="event.stopPropagation(); speakText('${c.front_word.replace(/'/g, "\\'")}', 'en-US')">
          <i class="fas fa-volume-up"></i>
        </button>
      `;
      listEl.appendChild(row);
    });
  }

  document.getElementById('wordsModal').classList.add('active');
};

window.closeWordsModal = function() {
  document.getElementById('wordsModal').classList.remove('active');
};

// --- SUBMODE 4.2: MATCHING GAME ---
let mItems = [];
let mSelectedId = null;
let mMatchedCount = 0;
let mIncorrectCount = 0;
let mTimerInterval = null;
let mStartTime = 0;

async function initMatchSubMode() {
  document.getElementById('m-start-screen').classList.remove('hidden');
  document.getElementById('m-arena').classList.add('hidden');
  document.getElementById('m-finish-screen').classList.add('hidden');
  
  // Load highscore from database or fallback to localStorage
  let highscore = await getSetHighscore(activeSetId);
  if (!highscore) {
    highscore = parseFloat(localStorage.getItem(`match_hs_${activeSetId}`) || '0');
  }
  document.getElementById('m-highscore').innerText = highscore > 0 ? highscore.toFixed(1) : '0.0';
  document.getElementById('m-timer').innerText = '0.0';
}

document.getElementById('m-start-btn').addEventListener('click', () => {
  document.getElementById('m-start-screen').classList.add('hidden');
  document.getElementById('m-arena').classList.remove('hidden');

  mItems = [];
  mMatchedCount = 0;
  mIncorrectCount = 0;
  mSelectedId = null;
  
  // Pick up to 6 cards for matching
  const subset = currentSetCards.slice(0, 6);
  subset.forEach((c, idx) => {
    mItems.push({ id: `t${idx}`, text: c.front_word, type: 'term', pairId: idx, matched: false });
    mItems.push({ id: `d${idx}`, text: c.back_meaning, type: 'definition', pairId: idx, matched: false });
  });

  // Shuffle
  for (let i = mItems.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mItems[i], mItems[j]] = [mItems[j], mItems[i]];
  }

  renderMatchingGrid();
  updateMatchingProgress();

  mStartTime = Date.now();
  if (mTimerInterval) clearInterval(mTimerInterval);
  mTimerInterval = setInterval(() => {
    const elapsed = (Date.now() - mStartTime) / 1000;
    document.getElementById('m-timer').innerText = elapsed.toFixed(1);
  }, 100);
});

function renderMatchingGrid() {
  const grid = document.getElementById('matchingGrid');
  grid.innerHTML = '';
  
  mItems.forEach(item => {
    const el = document.createElement('div');
    el.className = `matching-item ${item.type} ${item.matched ? 'matched' : ''} ${item.id === mSelectedId ? 'selected' : ''}`;
    el.innerText = item.text;
    el.addEventListener('click', () => handleMatchingSelect(item));
    grid.appendChild(el);
  });
}

function handleMatchingSelect(item) {
  if (item.matched) return;

  if (mSelectedId === null) {
    mSelectedId = item.id;
    renderMatchingGrid();
    return;
  }

  if (mSelectedId === item.id) {
    mSelectedId = null;
    renderMatchingGrid();
    return;
  }

  const prev = mItems.find(i => i.id === mSelectedId);
  if (prev.type === item.type) {
    mSelectedId = item.id;
    renderMatchingGrid();
    return;
  }

  if (prev.pairId === item.pairId) {
    // Correct Match
    prev.matched = item.matched = true;
    mMatchedCount++;
    mSelectedId = null;
    renderMatchingGrid();
    updateMatchingProgress();

    const fb = document.getElementById('matchingFeedback');
    fb.className = 'feedback-bar correct';
    fb.innerHTML = '<i class="fas fa-check-circle"></i> Ghép đúng!';
    fb.style.display = 'flex';
    setTimeout(() => fb.style.display = 'none', 1000);

    if (mMatchedCount * 2 === mItems.length) {
      finishMatchingGame();
    } else {
      playAudioFeedback('success');
    }
  } else {
    // Incorrect Match
    mIncorrectCount++;
    mSelectedId = null;
    playAudioFeedback('fail');

    // Shake
    const cards = document.querySelectorAll('.matching-item');
    cards.forEach(el => {
      if (el.innerText === prev.text || el.innerText === item.text) {
        el.classList.add('shake');
        el.style.borderColor = 'var(--danger)';
        setTimeout(() => {
          el.classList.remove('shake');
          el.style.borderColor = '';
        }, 300);
      }
    });

    const fb = document.getElementById('matchingFeedback');
    fb.className = 'feedback-bar incorrect';
    fb.innerHTML = '<i class="fas fa-times-circle"></i> Ghép sai!';
    fb.style.display = 'flex';
    setTimeout(() => fb.style.display = 'none', 1000);
  }
}

function updateMatchingProgress() {
  const total = mItems.length / 2;
  document.getElementById('matchingProgressText').innerText = `${mMatchedCount}/${total}`;
  const percent = total > 0 ? (mMatchedCount / total * 100) : 0;
  document.getElementById('matchingProgressFill').style.width = percent + '%';
}

async function finishMatchingGame() {
  if (mTimerInterval) clearInterval(mTimerInterval);
  const time = (Date.now() - mStartTime) / 1000;
  
  const totalAttempts = mMatchedCount + mIncorrectCount;
  const accuracy = totalAttempts > 0 ? Math.round((mMatchedCount / totalAttempts) * 100) : 100;

  // Save Highscore to DB & local
  const dbHs = await getSetHighscore(activeSetId);
  const localHs = parseFloat(localStorage.getItem(`match_hs_${activeSetId}`) || '999999');
  const currentHs = dbHs > 0 ? dbHs : (localHs < 999999 ? localHs : 999999);
  
  let isNewRecord = false;
  if (time < currentHs || currentHs === 999999 || currentHs === 0) {
    await saveSetHighscore(activeSetId, time);
    localStorage.setItem(`match_hs_${activeSetId}`, time.toString());
    document.getElementById('m-highscore').innerText = time.toFixed(1);
    isNewRecord = true;
  }

  document.getElementById('m-stat-correct').innerText = mMatchedCount;
  document.getElementById('m-stat-incorrect').innerText = mIncorrectCount;
  document.getElementById('m-stat-time').innerText = time.toFixed(1) + 's';
  document.getElementById('m-stat-accuracy').innerText = accuracy + '%';

  playAudioFeedback('complete');
  triggerConfetti();

  if (isNewRecord) {
    showToast("🏆 Kỷ lục mới! Bạn đã hoàn thành game nhanh nhất!", "success");
  }

  document.getElementById('m-arena').classList.add('hidden');
  document.getElementById('m-finish-screen').classList.remove('hidden');
}

document.getElementById('matchingShuffleBtn').addEventListener('click', () => {
  // reshuffle unmatched
  const unmatched = mItems.filter(i => !i.matched);
  for (let i = unmatched.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unmatched[i], unmatched[j]] = [unmatched[j], unmatched[i]];
  }
  let idx = 0;
  mItems = mItems.map(item => item.matched ? item : unmatched[idx++]);
  mSelectedId = null;
  renderMatchingGrid();
});

document.getElementById('matchingFinishBtn').addEventListener('click', () => {
  if (confirm("Bạn có muốn kết thúc game sớm không?")) {
    finishMatchingGame();
  }
});

document.getElementById('m-replay-btn').addEventListener('click', () => {
  document.getElementById('m-start-btn').click();
});

document.getElementById('m-exit-btn').addEventListener('click', () => {
  selectStudyMode('flashcards');
});
document.getElementById('matching-back-btn').addEventListener('click', () => {
  selectStudyMode('flashcards');
});

// --- SUBMODE 4.3: QUIZ MODE ---
let quizCards = [];
let quizActiveIndex = 0;
let quizIsAnswered = false;
let quizCorrect = 0;
let quizIncorrect = 0;
let quizSkipped = 0;
let quizStartTime = 0;
let quizResults = []; // term, result

function initQuizSubMode() {
  document.getElementById('quiz-card-panel').classList.remove('hidden');
  document.getElementById('quiz-dashboard-panel').classList.add('hidden');
  
  quizCards = [...currentSetCards];
  quizActiveIndex = 0;
  quizCorrect = 0;
  quizIncorrect = 0;
  quizSkipped = 0;
  quizResults = [];
  quizStartTime = Date.now();

  loadQuizQuestion();
  updateQuizProgress();
}

function updateQuizProgress() {
  const total = quizCards.length;
  document.getElementById('quizProgressText').innerText = `${quizActiveIndex}/${total}`;
  const percent = total > 0 ? (quizActiveIndex / total * 100) : 0;
  document.getElementById('quizProgressFill').style.width = percent + '%';
}

function loadQuizQuestion() {
  if (quizActiveIndex >= quizCards.length) {
    localStorage.removeItem('tct_resume_session');
    finishQuiz();
    return;
  }
  saveResumeSession();

  const card = quizCards[quizActiveIndex];
  document.getElementById('quizTermDisplay').innerHTML = escapeHtml(card.front_word) + 
    (card.phonetic ? ` <span class="quiz-phonetic">${escapeHtml(card.phonetic)}</span>` : '') +
    (card.word_type ? ` <span class="quiz-word-type">(${escapeHtml(card.word_type)})</span>` : '');
  document.getElementById('quizFeedback').innerHTML = '';
  document.getElementById('quizSkipBtn').disabled = false;
  quizIsAnswered = false;

  // Make choices
  let choices = [card.back_meaning];
  let dist = currentSetCards.map(c => c.back_meaning).filter(d => d !== card.back_meaning);
  dist.sort(() => Math.random() - 0.5);
  for (let i = 0; i < 3 && i < dist.length; i++) {
    choices.push(dist[i]);
  }
  while (choices.length < 4) {
    choices.push("(Không có đáp án)");
  }
  choices.sort(() => Math.random() - 0.5);

  const grid = document.getElementById('quizOptionsGrid');
  grid.innerHTML = '';
  choices.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option-button';
    btn.innerText = opt;
    btn.addEventListener('click', () => selectQuizOption(btn, opt));
    grid.appendChild(btn);
  });
}

function selectQuizOption(btn, opt) {
  if (quizIsAnswered) return;
  quizIsAnswered = true;

  const card = quizCards[quizActiveIndex];
  const buttons = document.querySelectorAll('.quiz-option-button');
  buttons.forEach(b => b.classList.add('disabled'));
  document.getElementById('quizSkipBtn').disabled = true;

  if (opt === card.back_meaning) {
    btn.classList.add('correct');
    playAudioFeedback('success');
    quizCorrect++;
    quizResults.push({ term: card.front_word, result: 'correct' });
    document.getElementById('quizFeedback').innerHTML = '<div class="quiz-feedback correct"><i class="fas fa-check-circle"></i> Chính xác!</div>';
    addStudyLog(card.id, 4);
    updateCardSRS(card.id, calculateSM2(4, card.repetition||0, card.interval||0, card.ease_factor||2.5));
    incrementDailyCount(1);
    quizTimeout = setTimeout(() => {
      quizActiveIndex++;
      loadQuizQuestion();
      updateQuizProgress();
    }, 1000);
  } else {
    btn.classList.add('wrong');
    playAudioFeedback('fail');
    buttons.forEach(b => {
      if (b.innerText === card.back_meaning) b.classList.add('correct');
    });
    quizIncorrect++;
    quizResults.push({ term: card.front_word, result: 'incorrect' });
    addStudyLog(card.id, 1);
    updateCardSRS(card.id, calculateSM2(1, card.repetition||0, card.interval||0, card.ease_factor||2.5));
    incrementDailyCount(1);
    
    document.getElementById('quizFeedback').innerHTML = `
      <div class="quiz-feedback incorrect">
        <i class="fas fa-times-circle"></i> Sai rồi! Đáp án: 
        <strong>${card.back_meaning}</strong>
      </div>
    `;
    quizTimeout = setTimeout(() => {
      quizActiveIndex++;
      loadQuizQuestion();
      updateQuizProgress();
    }, 2000);
  }
}

document.getElementById('quizSkipBtn').addEventListener('click', () => {
  if (quizIsAnswered) return;
  quizIsAnswered = true;
  
  const card = quizCards[quizActiveIndex];
  const buttons = document.querySelectorAll('.quiz-option-button');
  buttons.forEach(b => {
    b.classList.add('disabled');
    if (b.innerText === card.back_meaning) b.classList.add('correct');
  });
  document.getElementById('quizSkipBtn').disabled = true;

  quizSkipped++;
  quizResults.push({ term: card.front_word, result: 'skipped' });
  addStudyLog(card.id, 1);
  updateCardSRS(card.id, calculateSM2(1, card.repetition||0, card.interval||0, card.ease_factor||2.5));
  incrementDailyCount(1);

  document.getElementById('quizFeedback').innerHTML = `
    <div class="quiz-feedback warning">
      <i class="fas fa-forward"></i> Đã bỏ qua! Đáp án: <strong>${card.back_meaning}</strong>
    </div>
  `;
  quizTimeout = setTimeout(() => {
    quizActiveIndex++;
    loadQuizQuestion();
    updateQuizProgress();
  }, 1800);
});

document.getElementById('speakQuizTermBtn').addEventListener('click', () => {
  if (quizActiveIndex < quizCards.length) {
    speakText(quizCards[quizActiveIndex].front_word, 'en-US');
  }
});

function finishQuiz() {
  const duration = Math.round((Date.now() - quizStartTime) / 1000);
  const total = quizCards.length;
  const accuracy = total > 0 ? Math.round((quizCorrect / total) * 100) : 100;

  document.getElementById('q-stat-correct').innerText = quizCorrect;
  document.getElementById('q-stat-incorrect').innerText = quizIncorrect;
  document.getElementById('q-stat-skipped').innerText = quizSkipped;
  document.getElementById('q-stat-time').innerText = duration + 's';

  // accuracy pie chart conic-gradient update
  const pie = document.getElementById('quizPieChart');
  pie.style.setProperty('--acc-percentage', `${accuracy}%`);
  pie.style.setProperty('--acc-color', accuracy >= 80 ? '#23b26d' : (accuracy >= 50 ? '#ffcd1f' : '#ff6b6b'));
  document.getElementById('quizAccuracyValue').innerText = accuracy + '%';

  // render breakdown table
  const tbody = document.getElementById('quizBreakdownBody');
  tbody.innerHTML = '';
  quizResults.forEach(r => {
    const tr = document.createElement('tr');
    let label = '', cls = '';
    if (r.result === 'correct') { label = 'Đúng'; cls = 'result-correct'; }
    else if (r.result === 'incorrect') { label = 'Sai'; cls = 'result-incorrect'; }
    else { label = 'Bỏ qua'; cls = 'result-skipped'; }
    
    tr.innerHTML = `
      <td>${escapeHtml(r.term)}</td>
      <td><span class="badge-result ${r.result}">${label}</span></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('quiz-card-panel').classList.add('hidden');
  document.getElementById('quiz-dashboard-panel').classList.remove('hidden');

  // Activate/deactivate mistakes button
  document.getElementById('quizRetryMistakesBtn').disabled = (quizIncorrect + quizSkipped === 0);
  playAudioFeedback('complete');
  triggerConfetti();
}

document.getElementById('quizRetryMistakesBtn').addEventListener('click', () => {
  // filter incorrect cards
  const mistakes = [];
  quizResults.forEach((r, idx) => {
    if (r.result === 'incorrect' || r.result === 'skipped') {
      mistakes.push(quizCards[idx]);
    }
  });

  document.getElementById('quiz-card-panel').classList.remove('hidden');
  document.getElementById('quiz-dashboard-panel').classList.add('hidden');
  
  quizCards = mistakes;
  quizActiveIndex = 0;
  quizCorrect = 0;
  quizIncorrect = 0;
  quizSkipped = 0;
  quizResults = [];
  quizStartTime = Date.now();

  loadQuizQuestion();
  updateQuizProgress();
});

document.getElementById('quiz-exit-to-folder-btn').addEventListener('click', () => {
  clearQuizTimeout();
  selectStudyMode('flashcards');
});
document.getElementById('quiz-back-btn').addEventListener('click', () => {
  clearQuizTimeout();
  selectStudyMode('flashcards');
});

// ==========================================
// 5. CREATE/EDIT STUDY SET VIEW
// ==========================================
let editorRowsCount = 0;

window.showEditSetView = async function(setId) {
  showView('edit-set');
  
  const titleInput = document.getElementById('set-title-input');
  const descInput = document.getElementById('set-desc-input');
  const listContainer = document.getElementById('edit-cards-rows-list');
  
  document.getElementById('edit-set-id').value = setId || "";
  listContainer.innerHTML = '';
  editorRowsCount = 0;

  if (setId) {
    document.getElementById('edit-view-title').innerText = "Chỉnh sửa học phần";
    const setObj = await getStudySetById(setId);
    titleInput.value = setObj.title;
    descInput.value = setObj.description || '';
    
    const cards = await getCardsOfSet(setId);
    cards.forEach((c) => {
      addEditorCardRow(c.front_word, c.back_meaning, c.hint, c.existing_image_url, c.id, c.word_type, c.phonetic);
    });
  } else {
    document.getElementById('edit-view-title').innerText = "Tạo học phần mới";
    titleInput.value = '';
    descInput.value = '';
    // Add 1 empty row by default
    addEditorCardRow();
  }

  // Rescale textarea height
  descInput.style.height = 'auto';
  descInput.style.height = (descInput.scrollHeight) + 'px';
};

// Textarea auto-resize
document.getElementById('set-desc-input').addEventListener('input', (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = (e.target.scrollHeight) + 'px';
});

function addEditorCardRow(term = '', def = '', hint = '', img = '', cardId = '', wordType = '', phonetic = '') {
  const index = editorRowsCount;
  editorRowsCount++;

  const row = document.createElement('div');
  row.className = 'editor-term-card';
  row.innerHTML = `
    <div class="editor-term-card-header">
      <span class="editor-term-card-index">${index + 1}</span>
      <input type="hidden" class="row-card-id" value="${cardId}">
      <div class="editor-term-card-controls">
        <button type="button" class="btn-editor-card-control autofill-btn" title="Tự động điền (Dịch, loại từ, phiên âm, ảnh)" onclick="window.autoFillRow(this)">
          <i class="fas fa-magic"></i>
        </button>
        <button type="button" class="btn-editor-card-control" title="Tra từ điển" onclick="lookupDictForRow(this)" style="background:var(--primary); color:white;">
          <i class="fas fa-book"></i>
        </button>
        <button type="button" class="btn-editor-card-control btn-delete-card" onclick="removeEditorRow(this)">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    </div>
    
    <div class="editor-term-card-content">
      
      <div class="input-minimal-group" style="position:relative;">
        <input type="text" class="row-term-input" placeholder=" " required value="${escapeHtml(term)}" autocomplete="off">
        <label>THUẬT NGỮ</label>
        
        <!-- Suggestions dropdown -->
        <div class="suggest-dropdown" style="display:none;">
          <div class="suggest-loading-item"><i class="fas fa-spinner fa-spin"></i> Đang tìm gợi ý...</div>
          <div class="suggest-items"></div>
        </div>
      </div>

      <div class="input-minimal-group">
        <input type="text" class="row-type-input" placeholder=" " value="${escapeHtml(wordType)}" autocomplete="off" list="word-types-datalist">
        <label>LOẠI TỪ (N, V, ADJ...)</label>
      </div>

      <div class="input-minimal-group">
        <input type="text" class="row-phonetic-input" placeholder=" " value="${escapeHtml(phonetic)}" autocomplete="off">
        <label>PHIÊN ÂM (E.G. /ˈBJUːTIFL/)</label>
      </div>
      
      <div class="input-minimal-group">
        <input type="text" class="row-def-input" placeholder=" " required value="${escapeHtml(def)}" autocomplete="off">
        <label>ĐỊNH NGHĨA</label>
      </div>

      <div class="input-minimal-group">
        <input type="text" class="row-hint-input" placeholder=" " value="${escapeHtml(hint)}" autocomplete="off">
        <label>GỢI Ý / VÍ DỤ CÂU</label>
      </div>

      <div class="image-upload-area">
        <div class="image-upload-box" onclick="window.openImageSearchModal(this)" style="cursor: pointer; position: relative;">
          <i class="fas fa-image image-upload-box-icon"></i>
          <span class="image-upload-box-text">${img ? 'Thay đổi ảnh' : 'Thêm ảnh'}</span>
          <input type="file" accept="image/*" class="image-file-input" style="display:none;" onchange="previewCardImage(this)">
          <input type="hidden" class="row-image-data" value="${img}">
          <img src="${img}" class="image-upload-preview ${img ? '' : 'hidden'}" alt="">
        </div>
      </div>
      
    </div>
  `;

  document.getElementById('edit-cards-rows-list').appendChild(row);
  syncEditorRowIndexes();

  const termInput = row.querySelector('.row-term-input');
  const defInput = row.querySelector('.row-def-input');
  const dropdown = row.querySelector('.suggest-dropdown');
  initEditorSuggest(termInput, defInput, dropdown);

  // Tự động dịch và điền khi gõ xong từ (change event)
  termInput.addEventListener('change', () => {
    autoFillCardRow(row);
  });
}

document.getElementById('edit-add-row-btn').addEventListener('click', () => {
  addEditorCardRow();
  // Scroll to bottom
  const rows = document.querySelectorAll('.editor-term-card');
  rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
});

window.removeEditorRow = function(btn) {
  const card = btn.closest('.editor-term-card');
  const total = document.querySelectorAll('.editor-term-card').length;
  if (total <= 1) {
    alert("Bạn cần có ít nhất một thẻ từ vựng!");
    return;
  }

  card.style.opacity = '0';
  card.style.transform = 'scale(0.9)';
  setTimeout(() => {
    card.remove();
    syncEditorRowIndexes();
  }, 250);
};

function syncEditorRowIndexes() {
  const cards = document.querySelectorAll('.editor-term-card');
  cards.forEach((card, idx) => {
    card.querySelector('.editor-term-card-index').innerText = idx + 1;
  });
  editorRowsCount = cards.length;
}

// Image upload file reader
window.previewCardImage = async function(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;

  const box = fileInput.closest('.image-upload-box');
  const preview = box.querySelector('.image-upload-preview');
  const dataInput = box.querySelector('.row-image-data');
  
  const icon = box.querySelector('.image-upload-box-icon');
  const text = box.querySelector('.image-upload-box-text');
  const originalIcon = icon.className;
  const originalText = text.innerText;
  
  icon.className = 'fas fa-spinner fa-spin image-upload-box-icon';
  text.innerText = 'Đang tải...';

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Data = e.target.result;
    
    if (isDemoMode) {
      dataInput.value = base64Data;
      preview.src = base64Data;
      preview.classList.remove('hidden');
      icon.className = originalIcon;
      text.innerText = originalText;
    } else {
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            base64Data: base64Data
          })
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const json = await res.json();
        if (json.success) {
          dataInput.value = json.url;
          preview.src = json.url;
          preview.classList.remove('hidden');
        } else {
          throw new Error(json.error || 'Upload failed');
        }
      } catch (err) {
        console.error("Image upload failed, fallback to base64:", err);
        dataInput.value = base64Data;
        preview.src = base64Data;
        preview.classList.remove('hidden');
      } finally {
        icon.className = originalIcon;
        text.innerText = originalText;
      }
    }
  };
  reader.readAsDataURL(file);
};

// Term lookup dictionary suggest logic
let lookupDebounce;
function initEditorSuggest(termInput, defInput, dropdown) {
  termInput.addEventListener('input', () => {
    clearTimeout(lookupDebounce);
    const term = termInput.value.trim();
    if (!term) {
      dropdown.style.display = 'none';
      return;
    }
    lookupDebounce = setTimeout(() => {
      fetchSuggestDefinitions(term, defInput, dropdown);
    }, 600);
  });

  // Close dropdown on blur/outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-minimal-group')) {
      dropdown.style.display = 'none';
    }
  });
}

async function fetchSuggestDefinitions(term, defInput, dropdown) {
  const loading = dropdown.querySelector('.suggest-loading-item');
  const itemsContainer = dropdown.querySelector('.suggest-items');
  
  dropdown.style.display = 'block';
  loading.style.display = 'flex';
  itemsContainer.innerHTML = '';

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
    if (!res.ok) throw new Error("No suggestions");
    const data = await res.json();
    loading.style.display = 'none';

    let count = 0;
    data[0].meanings.forEach(m => {
      m.definitions.forEach(d => {
        if (count < 3) {
          const item = document.createElement('div');
          item.className = 'suggest-item';
          item.innerHTML = `
            <span class="suggest-item-pos">${m.partOfSpeech}</span>
            <div class="suggest-item-definition">${d.definition}</div>
          `;
          item.addEventListener('click', () => {
            defInput.value = d.definition;
            // flash effect
            defInput.parentElement.classList.add('flash-success');
            setTimeout(() => defInput.parentElement.classList.remove('flash-success'), 450);
            dropdown.style.display = 'none';
          });
          itemsContainer.appendChild(item);
          count++;
        }
      });
    });
  } catch(e) {
    loading.style.display = 'none';
    itemsContainer.innerHTML = `<div style="padding: 10px; font-size: 0.72rem; color: var(--text-sub);">Không có gợi ý tự động</div>`;
  }
}

// Submit set editor form
document.getElementById('setEditorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const setId = document.getElementById('edit-set-id').value || null;
  const title = document.getElementById('set-title-input').value.trim();
  const desc = document.getElementById('set-desc-input').value.trim();

  if (!title) {
    alert("Vui lòng điền tiêu đề học phần!");
    return;
  }

  const cardsList = [];
  const rows = document.querySelectorAll('.editor-term-card');
  let hasEmptyField = false;

  rows.forEach(row => {
    const cardId = row.querySelector('.row-card-id').value || '';
    const term = row.querySelector('.row-term-input').value.trim();
    const def = row.querySelector('.row-def-input').value.trim();
    const img = row.querySelector('.row-image-data').value || '';
    const hintInput = row.querySelector('.row-hint-input');
    const hint = hintInput ? hintInput.value.trim() : '';
    const typeInput = row.querySelector('.row-type-input');
    const wordType = typeInput ? typeInput.value.trim() : '';
    const phoneticInput = row.querySelector('.row-phonetic-input');
    const phonetic = phoneticInput ? phoneticInput.value.trim() : '';
    
    if (!term || !def) {
      hasEmptyField = true;
    }
    
    cardsList.push({
      id: cardId,
      front_word: term,
      back_meaning: def,
      hint: hint,
      word_type: wordType,
      phonetic: phonetic,
      existing_image_url: img
    });
  });

  if (hasEmptyField) {
    alert("Vui lòng nhập đầy đủ Thuật ngữ và Định nghĩa cho tất cả các thẻ!");
    return;
  }

  if (cardsList.length === 0) {
    alert("Học phần cần có ít nhất một thẻ từ vựng!");
    return;
  }

  const setObj = await createOrUpdateStudySet(setId, activeFolderId, title, desc);
  await saveSetCards(setObj.id, cardsList);

  showSetDetailView(setObj.id);
});

// ==========================================
// SYSTEM INITS & DELEGATES
// ==========================================

// Global Nav Links
document.getElementById('menu-home-btn').addEventListener('click', () => {
  showView('home');
});

document.getElementById('menu-library-btn').addEventListener('click', () => {
  initFoldersListView();
});

// Admin panel view trigger
document.getElementById('menu-admin-btn').addEventListener('click', () => {
  showView('admin');
});

// Admin back button
document.getElementById('admin-back-btn').addEventListener('click', () => {
  showView('home');
});

// Logout action
window.handleLogout = function() {
  token = null;
  currentUser = null;
  localStorage.removeItem('tct_srs_token');
  localStorage.removeItem('tct_srs_current_user');
  localStorage.removeItem('tct_srs_offline_mode');
  
  document.body.classList.add('not-logged-in');
  updateUserWidgetUI();
  
  showView('auth');
  showToast('Đã đăng xuất thành công!', 'info');
};

document.getElementById('sidebar-logout-btn').addEventListener('click', handleLogout);

// Continue Offline Mode (Demo Mode)
document.getElementById('auth-offline-btn').addEventListener('click', () => {
  isDemoMode = true;
  token = null;
  currentUser = { id: 'guest', username: 'Khách (Offline)', role: 'user' };
  
  localStorage.setItem('tct_srs_offline_mode', 'true');
  localStorage.removeItem('tct_srs_token');
  localStorage.removeItem('tct_srs_current_user');
  
  document.body.classList.remove('not-logged-in');
  updateUserWidgetUI();
  switchToDemoMode("Bạn đã chọn học ở Chế độ Offline.");
  
  showToast('Đang chạy ở chế độ offline cục bộ.', 'info');
  showView('home');
});

// Load Admin Dashboard statistics and user list
window.loadAdminDashboard = async function() {
  try {
    const statsRes = await fetch('/api/admin/stats');
    if (!statsRes.ok) {
      if (statsRes.status === 403) {
        showToast('Bạn không có quyền truy cập bảng quản trị!', 'error');
        showView('home');
        return;
      }
      throw new Error(`stats response error ${statsRes.status}`);
    }
    const stats = await statsRes.json();
    
    document.getElementById('ad-total-users').innerText = stats.totalUsers || 0;
    document.getElementById('ad-total-sets').innerText = stats.totalSets || 0;
    document.getElementById('ad-total-cards').innerText = stats.totalCards || 0;
    
    const kbSize = ((stats.dbSize || 0) / 1024).toFixed(1);
    document.getElementById('ad-db-size').innerText = `${kbSize} KB`;
    
    const uptime = stats.uptimeSeconds || 0;
    let uptimeStr = '';
    if (uptime < 60) {
      uptimeStr = `${uptime}s`;
    } else if (uptime < 3600) {
      uptimeStr = `${Math.floor(uptime / 60)}m ${uptime % 60}s`;
    } else {
      const hrs = Math.floor(uptime / 3600);
      const mins = Math.floor((uptime % 3600) / 60);
      uptimeStr = `${hrs}h ${mins}m`;
    }
    document.getElementById('ad-server-uptime').innerText = uptimeStr;
    
    const usersRes = await fetch('/api/admin/users');
    if (!usersRes.ok) throw new Error(`users response error ${usersRes.status}`);
    const users = await usersRes.json();
    
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = '';
    
    users.forEach(u => {
      const tr = document.createElement('tr');
      const isSelf = u.id === currentUser.id;
      
      let actionBtns = '';
      if (isSelf) {
        actionBtns = `<span style="font-style: italic; opacity: 0.6;">(Tài khoản của bạn)</span>`;
      } else {
        const toggleRoleBtn = u.role === 'admin' 
          ? `<button class="btn-action-small demote" onclick="changeUserRole('${u.id}', 'user')"><i class="fas fa-user-minus"></i> Hạ quyền</button>`
          : `<button class="btn-action-small promote" onclick="changeUserRole('${u.id}', 'admin')"><i class="fas fa-user-plus"></i> Thăng quyền</button>`;
          
        const deleteBtn = `<button class="btn-action-small delete" onclick="deleteUserAccount('${u.id}', '${escapeHtml(u.username)}')"><i class="fas fa-trash"></i> Xóa</button>`;
        
        actionBtns = `<div style="display: flex; gap: 8px;">${toggleRoleBtn} ${deleteBtn}</div>`;
      }
      
      const roleBadge = u.role === 'admin' 
        ? `<span class="badge-role admin">Admin</span>`
        : `<span class="badge-role user">User</span>`;
        
      tr.innerHTML = `
        <td><strong>${escapeHtml(u.username)}</strong></td>
        <td><code>${escapeHtml(u.id)}</code></td>
        <td>${roleBadge}</td>
        <td>${actionBtns}</td>
      `;
      tbody.appendChild(tr);
    });
    
  } catch (err) {
    console.error("Lỗi khi tải trang quản trị:", err);
    showToast('Lỗi tải dữ liệu bảng quản trị!', 'error');
  }
};

window.changeUserRole = async function(userId, newRole) {
  const roleName = newRole === 'admin' ? 'Quản trị viên' : 'Người dùng thường';
  if (!confirm(`Bạn có chắc chắn muốn thay đổi quyền của tài khoản này thành ${roleName}?`)) return;
  
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Cập nhật quyền thất bại.');
    }
    
    showToast('Cập nhật quyền thành công!', 'success');
    loadAdminDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteUserAccount = async function(userId, username) {
  if (!confirm(`CẢNH BÁO CỰC KỲ QUAN TRỌNG!\n\nBạn đang thực hiện xóa tài khoản "${username}". Hành động này sẽ xóa vĩnh viễn tài khoản cùng toàn bộ các học phần, từ vựng và lịch sử học tập của họ trong cơ sở dữ liệu.\n\nHành động này KHÔNG THỂ KHÔI PHỤC.\n\nBạn vẫn muốn tiếp tục chứ?`)) return;
  
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Xóa tài khoản thất bại.');
    }
    
    showToast(`Đã xóa tài khoản "${username}" thành công!`, 'success');
    loadAdminDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Today's review button
document.getElementById('start-review-btn').addEventListener('click', () => {
  showSetDetailView('all_due');
});

// Shortcut Help Modal triggers
window.openShortcutHelpModal = function() {
  document.getElementById('shortcutHelpModal').classList.add('active');
};

window.closeShortcutHelpModal = function() {
  document.getElementById('shortcutHelpModal').classList.remove('active');
};

document.getElementById('shortcutHelpBtn').addEventListener('click', openShortcutHelpModal);

// Study selection banner button listeners
document.getElementById('btn-study-due').addEventListener('click', () => {
  studyFilterMode = 'due';
  document.getElementById('study-select-banner').classList.add('hidden');
  
  document.querySelector('.flashcard-container').classList.remove('hidden');
  document.querySelector('.study-card-controls').classList.remove('hidden');
  document.querySelector('.study-stats-grid').classList.remove('hidden');
  
  initFlashcardsSubMode();
});

document.getElementById('btn-study-all').addEventListener('click', () => {
  studyFilterMode = 'all';
  document.getElementById('study-select-banner').classList.add('hidden');
  
  document.querySelector('.flashcard-container').classList.remove('hidden');
  document.querySelector('.study-card-controls').classList.remove('hidden');
  document.querySelector('.study-stats-grid').classList.remove('hidden');
  
  initFlashcardsSubMode();
});

// Helpers
function updateRatingActionsVisibility() {
  const ratingActions = document.getElementById('rating-actions');
  const flipPrompt = document.querySelector('.card-flip-prompt');
  if (fcIsFlipped) {
    ratingActions.classList.remove('hidden');
    if (flipPrompt) flipPrompt.style.opacity = '0';
  } else {
    ratingActions.classList.add('hidden');
    if (flipPrompt) flipPrompt.style.opacity = '0.6';
  }
}

function clearQuizTimeout() {
  if (quizTimeout) {
    clearTimeout(quizTimeout);
    quizTimeout = null;
  }
}

// Dark mode toggle
const darkToggle = document.getElementById('darkToggle');
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark-mode');
  darkToggle.innerText = '☀️';
}
darkToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDark);
  darkToggle.innerText = isDark ? '☀️' : '🌙';
  
  // Redraw charts with correct text colors
  refreshGlobalStats();
});

// Escape HTML utility
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initial triggers
async function startApp() {
  await initializeAppWithTimeout();
  
  const offlineModeFlag = localStorage.getItem('tct_srs_offline_mode') === 'true';
  
  if (isDemoMode || offlineModeFlag) {
    if (!currentUser || currentUser.id !== 'guest') {
      currentUser = { id: 'guest', username: 'Khách (Offline)', role: 'user' };
    }
    isDemoMode = true;
    document.body.classList.remove('not-logged-in');
    updateUserWidgetUI();
    switchToDemoMode(offlineModeFlag ? "Bạn đã chọn học ở Chế độ Offline." : "Không thể kết nối đến Local API Server.");
    await initHomeView();
    initPomodoro();
    showView('home');
  } else {
    if (token && currentUser) {
      document.body.classList.remove('not-logged-in');
      updateUserWidgetUI();
      const warningBanner = document.getElementById('firebase-warning');
      if (warningBanner) warningBanner.classList.add('hidden');
      
      await initHomeView();
      initPomodoro();
      showView('home');
    } else {
      document.body.classList.add('not-logged-in');
      updateUserWidgetUI();
      initPomodoro();
      showView('auth');
    }
  }
}

// ==========================================
// TTS SETTINGS
// ==========================================
let ttsSettings = {
  enabled: true,
  rate: 0.9,
  voice: 'en-US',
  autoFlip: false,
  audioFeedback: true
};

async function loadTTSSettings() {
  try {
    if (!isDemoMode) {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const s = await res.json();
        ttsSettings.enabled = s.tts_enabled !== false;
        ttsSettings.rate = s.tts_rate || 0.9;
        ttsSettings.voice = s.tts_voice || 'en-US';
        ttsSettings.autoFlip = s.auto_speak_on_flip === true;
        ttsSettings.audioFeedback = s.audio_feedback !== false;
      }
    } else {
      const s = JSON.parse(localStorage.getItem('tts_settings') || '{}');
      if (s.enabled !== undefined) ttsSettings.enabled = s.enabled;
      if (s.rate) ttsSettings.rate = s.rate;
      if (s.voice) ttsSettings.voice = s.voice;
      if (s.autoFlip !== undefined) ttsSettings.autoFlip = s.autoFlip;
      if (s.audioFeedback !== undefined) ttsSettings.audioFeedback = s.audioFeedback;
    }
  } catch(e) {}
}

async function saveTTSSettings() {
  const payload = { 
    tts_enabled: ttsSettings.enabled, 
    tts_rate: ttsSettings.rate, 
    tts_voice: ttsSettings.voice, 
    auto_speak_on_flip: ttsSettings.autoFlip,
    audio_feedback: ttsSettings.audioFeedback 
  };
  if (!isDemoMode) {
    await fetch('/api/settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  } else {
    localStorage.setItem('tts_settings', JSON.stringify({ 
      enabled: ttsSettings.enabled, 
      rate: ttsSettings.rate, 
      voice: ttsSettings.voice, 
      autoFlip: ttsSettings.autoFlip,
      audioFeedback: ttsSettings.audioFeedback 
    }));
  }
}

// Override speakText to use settings
function speakText(text, lang, rateOverride) {
  if (!text || text === 'English Word') return;
  if (!ttsSettings.enabled) return;
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang || ttsSettings.voice;
  utterance.rate = rateOverride || ttsSettings.rate;
  window.speechSynthesis.speak(utterance);
}

window.openTTSModal = function() {
  document.getElementById('tts-enabled-toggle').checked = ttsSettings.enabled;
  document.getElementById('tts-auto-flip-toggle').checked = ttsSettings.autoFlip;
  document.getElementById('audio-feedback-toggle').checked = ttsSettings.audioFeedback !== false;
  document.getElementById('tts-rate-slider').value = ttsSettings.rate;
  document.getElementById('tts-rate-label').innerText = ttsSettings.rate + 'x';
  document.getElementById('tts-voice-select').value = ttsSettings.voice;
  document.getElementById('ttsModal').classList.add('active');
};
window.closeTTSModal = function() { document.getElementById('ttsModal').classList.remove('active'); };

document.getElementById('tts-rate-slider').addEventListener('input', (e) => {
  document.getElementById('tts-rate-label').innerText = parseFloat(e.target.value).toFixed(1) + 'x';
});

window.testTTSPreview = function() {
  const text = document.getElementById('tts-test-input').value.trim() || 'Hello, this is a test';
  const voice = document.getElementById('tts-voice-select').value;
  const rate = parseFloat(document.getElementById('tts-rate-slider').value);
  speakText(text, voice, rate);
};

document.getElementById('save-tts-btn').addEventListener('click', async () => {
  ttsSettings.enabled = document.getElementById('tts-enabled-toggle').checked;
  ttsSettings.autoFlip = document.getElementById('tts-auto-flip-toggle').checked;
  ttsSettings.audioFeedback = document.getElementById('audio-feedback-toggle').checked;
  ttsSettings.rate = parseFloat(document.getElementById('tts-rate-slider').value);
  ttsSettings.voice = document.getElementById('tts-voice-select').value;
  await saveTTSSettings();
  closeTTSModal();
});

document.getElementById('tts-settings-btn').addEventListener('click', openTTSModal);

// ==========================================
// STUDY LOG
// ==========================================
const STUDY_LOG_KEY = 'srs_study_log';

async function addStudyLog(cardId, rating, timeTaken = 0) {
  const entry = {
    cardId,
    rating, // 1=Again, 3=Hard, 4=Good, 5=Easy
    timeTaken,
    date: new Date().toISOString().split('T')[0] // YYYY-MM-DD
  };
  if (!isDemoMode) {
    try {
      await fetch('/api/study-log', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(entry)
      });
    } catch(e) {}
  } else {
    const log = JSON.parse(localStorage.getItem(STUDY_LOG_KEY) || '[]');
    log.push(entry);
    if (log.length > 2000) log.splice(0, log.length - 2000);
    localStorage.setItem(STUDY_LOG_KEY, JSON.stringify(log));
  }
}

async function getStudyLog() {
  if (!isDemoMode) {
    try {
      const res = await fetch('/api/study-log');
      if (res.ok) return await res.json();
    } catch(e) {}
  }
  return JSON.parse(localStorage.getItem(STUDY_LOG_KEY) || '[]');
}

// Override markCardSRS to also log
const _originalMarkCardSRS = window.markCardSRS;
window.markCardSRS = async function(q) {
  if (fcActiveIndex < currentStudyCards.length) {
    const card = currentStudyCards[fcActiveIndex];
    await addStudyLog(card.id, q);
  }
  await _originalMarkCardSRS(q);
};

// ==========================================
// WRITE MODE
// ==========================================
let writeCards = [];
let writeIndex = 0;
let writeCorrect = 0;
let writeWrong = 0;
let writeMistakes = []; // {term, answer, correct}
let writeIsAnswered = false;

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function initWriteMode(cards) {
  writeCards = cards || [...currentSetCards];
  writeIndex = 0;
  writeCorrect = 0;
  writeWrong = 0;
  writeMistakes = [];
  writeIsAnswered = false;
  document.getElementById('write-card-panel').classList.remove('hidden');
  document.getElementById('write-dashboard').classList.add('hidden');
  loadWriteQuestion();
}

function loadWriteQuestion() {
  if (writeIndex >= writeCards.length) {
    localStorage.removeItem('tct_resume_session');
    finishWriteMode();
    return;
  }
  saveResumeSession();
  writeIsAnswered = false;
  const card = writeCards[writeIndex];
  const total = writeCards.length;

  document.getElementById('write-definition').innerHTML = escapeHtml(card.back_meaning) + 
    (card.phonetic ? ` <span class="write-phonetic">${escapeHtml(card.phonetic)}</span>` : '') +
    (card.word_type ? ` <span class="write-word-type">(${escapeHtml(card.word_type)})</span>` : '');
  document.getElementById('write-hint-text').innerText = card.hint ? `Gợi ý: ${card.hint}` : '';
  document.getElementById('write-answer-input').value = '';
  document.getElementById('write-answer-input').className = 'write-answer-input';
  document.getElementById('write-answer-input').disabled = false;
  document.getElementById('write-answer-input').focus();
  document.getElementById('write-char-hint').innerHTML = '';
  document.getElementById('write-feedback').className = 'write-feedback hidden';
  document.getElementById('write-submit-btn').classList.remove('hidden');
  document.getElementById('write-skip-btn').classList.remove('hidden');
  document.getElementById('write-next-btn').classList.add('hidden');

  document.getElementById('write-correct-count').innerText = writeCorrect;
  document.getElementById('write-wrong-count').innerText = writeWrong;
  document.getElementById('writeProgressText').innerText = `${writeIndex + 1}/${total}`;
  document.getElementById('writeProgressFill').style.width = `${(writeIndex / total) * 100}%`;
}

function renderCharHint(input, correct) {
  const hintEl = document.getElementById('write-char-hint');
  hintEl.innerHTML = '';
  const maxLen = Math.max(input.length, correct.length);
  for (let i = 0; i < maxLen; i++) {
    const span = document.createElement('span');
    if (i >= input.length) {
      span.className = 'ch-missing';
      span.textContent = correct[i];
    } else if (i >= correct.length || input[i].toLowerCase() !== correct[i].toLowerCase()) {
      span.className = 'ch-wrong';
      span.textContent = input[i];
    } else {
      span.className = 'ch-correct';
      span.textContent = input[i];
    }
    hintEl.appendChild(span);
  }
}

function checkWriteAnswer() {
  if (writeIsAnswered) return;
  writeIsAnswered = true;

  const card = writeCards[writeIndex];
  const userAnswer = document.getElementById('write-answer-input').value.trim();
  const correctAnswer = card.front_word.trim();
  const dist = levenshteinDistance(userAnswer.toLowerCase(), correctAnswer.toLowerCase());
  const isCorrect = dist === 0;
  const isAlmost = dist <= Math.max(1, Math.floor(correctAnswer.length * 0.2));

  const feedbackEl = document.getElementById('write-feedback');
  const inputEl = document.getElementById('write-answer-input');
  inputEl.disabled = true;

  document.getElementById('write-submit-btn').classList.add('hidden');
  document.getElementById('write-skip-btn').classList.add('hidden');
  document.getElementById('write-next-btn').classList.remove('hidden');

  if (isCorrect) {
    inputEl.classList.add('correct');
    playAudioFeedback('success');
    feedbackEl.className = 'write-feedback correct-fb';
    feedbackEl.innerHTML = `<div id="write-feedback-icon">🎉</div><div id="write-feedback-text">Chính xác! Tuyệt vời!</div>`;
    writeCorrect++;
    addStudyLog(card.id, 4);
    updateCardSRS(card.id, calculateSM2(4, card.repetition||0, card.interval||0, card.ease_factor||2.5));
  } else if (isAlmost) {
    inputEl.classList.add('almost');
    playAudioFeedback('fail');
    renderCharHint(userAnswer, correctAnswer);
    feedbackEl.className = 'write-feedback almost-fb';
    feedbackEl.innerHTML = `<div id="write-feedback-icon">⚠️</div><div id="write-feedback-text">Gần đúng! Sai nhỏ (${dist} ký tự)</div><div class="write-correct-answer">Đáp án: <strong>${escapeHtml(correctAnswer)}</strong></div>`;
    writeWrong++;
    writeMistakes.push({ term: card.front_word, def: card.back_meaning, userAnswer, correct: correctAnswer });
    addStudyLog(card.id, 3);
    updateCardSRS(card.id, calculateSM2(3, card.repetition||0, card.interval||0, card.ease_factor||2.5));
  } else {
    inputEl.classList.add('wrong');
    playAudioFeedback('fail');
    renderCharHint(userAnswer, correctAnswer);
    feedbackEl.className = 'write-feedback wrong-fb';
    feedbackEl.innerHTML = `<div id="write-feedback-icon">❌</div><div id="write-feedback-text">Sai rồi!</div><div class="write-correct-answer">Đáp án đúng: <strong>${escapeHtml(correctAnswer)}</strong></div>`;
    writeWrong++;
    writeMistakes.push({ term: card.front_word, def: card.back_meaning, userAnswer, correct: correctAnswer });
    addStudyLog(card.id, 1);
    updateCardSRS(card.id, calculateSM2(1, card.repetition||0, card.interval||0, card.ease_factor||2.5));
  }

  document.getElementById('write-correct-count').innerText = writeCorrect;
  document.getElementById('write-wrong-count').innerText = writeWrong;
  incrementDailyCount(1);
}

function finishWriteMode() {
  const total = writeCards.length;
  const accuracy = total > 0 ? Math.round((writeCorrect / total) * 100) : 0;
  document.getElementById('write-card-panel').classList.add('hidden');
  document.getElementById('write-dashboard').classList.remove('hidden');
  document.getElementById('wd-correct').innerText = writeCorrect;
  document.getElementById('wd-wrong').innerText = writeWrong;
  document.getElementById('wd-accuracy').innerText = accuracy + '%';
  document.getElementById('writeProgressFill').style.width = '100%';

  // Render mistakes
  const mistakesEl = document.getElementById('write-mistakes-list');
  if (writeMistakes.length > 0) {
    mistakesEl.innerHTML = `<h4 style="margin-bottom:10px; font-size:0.9rem;">📋 Các từ cần ôn lại (${writeMistakes.length}):</h4>`
      + writeMistakes.map(m => `<div class="word-row-item" style="margin-bottom:6px; padding:10px 14px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px;">
          <div><strong>${escapeHtml(m.correct)}</strong> <span style="color:var(--text-sub); font-size:0.8rem;">(${escapeHtml(m.def)})</span></div>
          <div style="color:var(--danger); font-size:0.82rem;">Bạn viết: "${escapeHtml(m.userAnswer)}"</div>
        </div>
      </div>`).join('');
  } else {
    mistakesEl.innerHTML = '';
  }

  document.getElementById('write-retry-mistakes-btn').disabled = writeMistakes.length === 0;
  recordActivity();
}

document.getElementById('write-submit-btn').addEventListener('click', checkWriteAnswer);

document.getElementById('write-next-btn').addEventListener('click', () => {
  writeIndex++;
  loadWriteQuestion();
});

document.getElementById('write-skip-btn').addEventListener('click', () => {
  if (writeIsAnswered) return;
  writeIsAnswered = true;
  const card = writeCards[writeIndex];
  const inputEl = document.getElementById('write-answer-input');
  inputEl.disabled = true;
  document.getElementById('write-submit-btn').classList.add('hidden');
  document.getElementById('write-skip-btn').classList.add('hidden');
  document.getElementById('write-next-btn').classList.remove('hidden');
  const feedbackEl = document.getElementById('write-feedback');
  feedbackEl.className = 'write-feedback wrong-fb';
  feedbackEl.innerHTML = `<div id="write-feedback-icon">⏭️</div><div id="write-feedback-text">Đã bỏ qua</div><div class="write-correct-answer">Đáp án: <strong>${escapeHtml(card.front_word)}</strong></div>`;
  writeWrong++;
  writeMistakes.push({ term: card.front_word, def: card.back_meaning, userAnswer: '(bỏ qua)', correct: card.front_word });
  document.getElementById('write-correct-count').innerText = writeCorrect;
  document.getElementById('write-wrong-count').innerText = writeWrong;
  addStudyLog(card.id, 1);
  updateCardSRS(card.id, calculateSM2(1, card.repetition||0, card.interval||0, card.ease_factor||2.5));
  incrementDailyCount(1);
});

document.getElementById('write-answer-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (!writeIsAnswered) checkWriteAnswer();
    else { writeIndex++; loadWriteQuestion(); }
  }
});

document.getElementById('write-back-btn').addEventListener('click', () => { selectStudyMode('flashcards'); });
document.getElementById('write-speak-btn').addEventListener('click', () => {
  if (writeIndex < writeCards.length) speakText(writeCards[writeIndex].front_word, ttsSettings.voice);
});
document.getElementById('write-retry-btn').addEventListener('click', () => initWriteMode());
document.getElementById('write-retry-mistakes-btn').addEventListener('click', () => {
  const mistakeCards = currentSetCards.filter(c => writeMistakes.some(m => m.correct === c.front_word));
  initWriteMode(mistakeCards.length > 0 ? mistakeCards : writeCards);
});
document.getElementById('write-exit-btn').addEventListener('click', () => { selectStudyMode('flashcards'); });

// ==========================================
// ANALYTICS VIEW
// ==========================================
let forecastChart30Instance = null;
let ratingDistChartInstance = null;

async function initAnalyticsView() {
  showView('analytics');
  await renderSidebar();

  const log = await getStudyLog();
  let allCards = [];
  if (isDemoMode) {
    allCards = getLocalStorage(CARDS_KEY);
  } else {
    try {
      const res = await fetch('/api/cards');
      if (res.ok) allCards = await res.json();
    } catch(e) {}
  }

  // Summary stats
  const streak = parseInt(localStorage.getItem('study_streak') || '0');
  const uniqueDates = [...new Set(log.map(l => l.date))];
  const totalReviews = log.length;
  const goodRatings = log.filter(l => l.rating >= 4).length;
  const retention = totalReviews > 0 ? Math.round((goodRatings / totalReviews) * 100) : 0;

  document.getElementById('an-total-sessions').innerText = uniqueDates.length;
  document.getElementById('an-total-reviews').innerText = totalReviews;
  document.getElementById('an-streak').innerText = streak;
  document.getElementById('an-retention').innerText = retention + '%';

  // Activity Heatmap (12 weeks)
  renderActivityHeatmap(log);

  // 30-day forecast
  render30DayForecast(allCards);

  // Rating distribution
  renderRatingDistChart(log);

  // Hard words table
  renderHardWordsTable(allCards);
}

function renderActivityHeatmap(log) {
  const heatmapEl = document.getElementById('activity-heatmap');
  heatmapEl.innerHTML = '';

  // Build date -> count map
  const dateCount = {};
  log.forEach(l => { dateCount[l.date] = (dateCount[l.date] || 0) + 1; });

  // 12 weeks back
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 83); // 12 * 7
  startDate.setDay = startDate.getDay();

  let current = new Date(startDate);
  // align to Sunday
  current.setDate(current.getDate() - current.getDay());

  for (let week = 0; week < 13; week++) {
    const weekEl = document.createElement('div');
    weekEl.className = 'heatmap-week';
    for (let day = 0; day < 7; day++) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      const dateStr = current.toISOString().split('T')[0];
      const count = dateCount[dateStr] || 0;
      const level = count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 30 ? 3 : 4;
      if (level > 0) cell.setAttribute('data-count', level);
      cell.title = `${dateStr}: ${count} lần ôn tập`;
      weekEl.appendChild(cell);
      current.setDate(current.getDate() + 1);
    }
    heatmapEl.appendChild(weekEl);
  }
}

function render30DayForecast(allCards) {
  const ctx = document.getElementById('forecastChart30');
  if (!ctx) return;
  if (forecastChart30Instance) { forecastChart30Instance.destroy(); }

  const now = new Date();
  now.setHours(0,0,0,0);
  const labels = [], data = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    labels.push(i === 0 ? 'Hôm nay' : d.toLocaleDateString('vi-VN', {day: 'numeric', month: 'numeric'}));
    const count = allCards.filter(c => {
      const rev = new Date(c.next_review || 0);
      rev.setHours(0,0,0,0);
      return rev.getTime() === d.getTime();
    }).length;
    data.push(i === 0 ? allCards.filter(c => new Date(c.next_review||0) <= now).length : count);
  }

  const isDark = document.body.classList.contains('dark-mode');
  const textClr = isDark ? '#f6f7fb' : '#1a1d23';
  const gridClr = isDark ? '#3c4257' : '#d9dde8';

  forecastChart30Instance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Số thẻ cần ôn', data, backgroundColor: data.map((_, i) => i === 0 ? 'rgba(255,107,107,0.85)' : 'rgba(66,85,255,0.7)'), borderRadius: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: textClr, maxTicksLimit: 10 } }, y: { grid: { color: gridClr }, ticks: { color: textClr, stepSize: 1, precision: 0 } } } }
  });
}

function renderRatingDistChart(log) {
  const ctx = document.getElementById('ratingDistChart');
  if (!ctx) return;
  if (ratingDistChartInstance) { ratingDistChartInstance.destroy(); }

  const again = log.filter(l => l.rating === 1).length;
  const hard = log.filter(l => l.rating === 3).length;
  const good = log.filter(l => l.rating === 4).length;
  const easy = log.filter(l => l.rating === 5).length;

  const isDark = document.body.classList.contains('dark-mode');
  const textClr = isDark ? '#f6f7fb' : '#1a1d23';

  ratingDistChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Quên (Again)', 'Khó (Hard)', 'Tốt (Good)', 'Dễ (Easy)'],
      datasets: [{ data: [again, hard, good, easy], backgroundColor: ['#ff6b6b','#ffcd1f','#4255ff','#23b26d'], borderWidth: isDark ? 2 : 1, borderColor: isDark ? '#2e3856' : '#ffffff' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textClr, font: { family: 'Inter', weight: 'bold' } } } } }
  });
}

function renderHardWordsTable(allCards) {
  const tbody = document.getElementById('hard-words-tbody');
  if (!tbody) return;
  const sorted = [...allCards]
    .filter(c => (c.repetition || 0) > 0)
    .sort((a, b) => (a.ease_factor || 2.5) - (b.ease_factor || 2.5))
    .slice(0, 10);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; opacity:0.5;">Chưa có dữ liệu. Hãy ôn tập thêm!</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((c, i) => {
    const ef = c.ease_factor || 2.5;
    const efCls = ef < 1.8 ? 'ef-low' : ef < 2.2 ? 'ef-mid' : 'ef-high';
    return `<tr>
      <td style="font-weight:700; color:var(--text-sub);">${i+1}</td>
      <td style="font-weight:700;">${escapeHtml(c.front_word)}</td>
      <td style="color:var(--text-sub);">${escapeHtml(c.back_meaning)}</td>
      <td><span class="ef-badge ${efCls}">${ef.toFixed(2)}</span></td>
      <td>${c.repetition || 0} lần</td>
      <td><button class="btn-restore" onclick="speakText('${c.front_word.replace(/'/g,"\\'")}')"><i class="fas fa-volume-up"></i></button></td>
    </tr>`;
  }).join('');
}

document.getElementById('analytics-back-btn').addEventListener('click', () => showView('home'));
document.getElementById('analytics-backup-btn').addEventListener('click', () => createBackupNow());
document.getElementById('menu-analytics-btn').addEventListener('click', () => { showView('analytics'); });

// ==========================================
// DICTIONARY LOOKUP MODAL
// ==========================================
let dictTargetDefInput = null;
let dictTargetHintInput = null;

window.openDictModal = async function(word, defInput, hintInput) {
  dictTargetDefInput = defInput;
  dictTargetHintInput = hintInput;
  const modal = document.getElementById('dictModal');
  const content = document.getElementById('dict-modal-content');
  content.innerHTML = '<div class="dict-loading"><i class="fas fa-spinner fa-spin"></i> Đang tra từ điển...</div>';
  modal.classList.add('active');

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    renderDictResult(data[0], word);
  } catch(e) {
    content.innerHTML = `<div class="dict-loading"><i class="fas fa-times-circle" style="color:var(--danger);"></i> Không tìm thấy từ "${escapeHtml(word)}". Kiểm tra lại chính tả.</div>`;
  }
};

window.closeDictModal = function() { document.getElementById('dictModal').classList.remove('active'); };

function renderDictResult(entry, word) {
  const content = document.getElementById('dict-modal-content');
  const phonetics = entry.phonetics || [];
  const phonetic = phonetics.find(p => p.text)?.text || '';
  const audioUrl = phonetics.find(p => p.audio)?.audio || '';

  let html = `<div class="dict-word-header">
    <div class="dict-word-title">${escapeHtml(entry.word || word)}</div>
    ${phonetic ? `<div class="dict-phonetic">${phonetic}</div>` : ''}
    <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
      <button class="dict-speak-btn" onclick="speakText('${(entry.word||word).replace(/'/g,"\\'")}')"><i class="fas fa-volume-up"></i> Nghe phát âm</button>
      <button class="dict-translate-btn" onclick="window.translateDictModal(this)" style="background:#f97316; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:0.85rem; font-weight:700; transition:all 0.2s; display:flex; align-items:center; gap:6px;"><i class="fas fa-language" style="font-size:1.1rem;"></i> Dịch sang Tiếng Việt</button>
    </div>
  </div>`;

  const meanings = entry.meanings || [];
  let totalDefs = 0;
  meanings.forEach(m => {
    if (totalDefs >= 6) return;
    html += `<div class="dict-meaning-group"><span class="dict-pos-pill">${m.partOfSpeech}</span>`;
    m.definitions.slice(0, 3).forEach(d => {
      if (totalDefs >= 6) return;
      totalDefs++;
      html += `<div class="dict-def-item" onclick="selectDictDef('${d.definition.replace(/'/g,"\\'").replace(/"/g,'&quot;')}', '${(d.example||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}')">
        <div class="dict-def-text">${escapeHtml(d.definition)}</div>
        ${d.example ? `<div class="dict-example-text">"${escapeHtml(d.example)}"</div>` : ''}
      </div>`;
    });
    if (m.synonyms && m.synonyms.length > 0) {
      html += `<div class="dict-synonyms">Đồng nghĩa: ${m.synonyms.slice(0,5).map(s => `<span onclick="speakText('${s}')">${escapeHtml(s)}</span>`).join(', ')}</div>`;
    }
    html += `</div>`;
  });

  content.innerHTML = html;
}

window.selectDictDef = function(def, example, defVi = '') {
  if (dictTargetDefInput) {
    dictTargetDefInput.value = defVi || def;
    dictTargetDefInput.parentElement.classList.add('flash-success');
    setTimeout(() => dictTargetDefInput.parentElement.classList.remove('flash-success'), 500);
  }
  if (dictTargetHintInput && example) {
    dictTargetHintInput.value = example;
  }
  closeDictModal();
};

window.translateDictModal = async function(btn) {
  const isTranslated = btn.getAttribute('data-translated') === 'true';
  const hasBeenTranslated = btn.getAttribute('data-has-translated') === 'true';

  if (isTranslated) {
    // ẨN BẢN DỊCH
    const viDefs = document.querySelectorAll('.dict-def-vi');
    const viExamples = document.querySelectorAll('.dict-example-vi');
    viDefs.forEach(el => el.style.display = 'none');
    viExamples.forEach(el => el.style.display = 'none');

    // Phục hồi sự kiện click gốc (chỉ chọn tiếng Anh)
    const defItems = document.querySelectorAll('.dict-def-item');
    defItems.forEach(item => {
      const originalClick = item.getAttribute('data-original-click');
      if (originalClick) {
        item.setAttribute('onclick', originalClick);
      }
    });

    btn.setAttribute('data-translated', 'false');
    btn.innerHTML = '<i class="fas fa-language" style="font-size:1.1rem;"></i> Dịch sang Tiếng Việt';
    btn.style.background = '#f97316';
    return;
  }

  // HIỆN BẢN DỊCH (Nếu đã dịch một lần rồi, chỉ cần hiển thị lại)
  if (hasBeenTranslated) {
    const viDefs = document.querySelectorAll('.dict-def-vi');
    const viExamples = document.querySelectorAll('.dict-example-vi');
    viDefs.forEach(el => el.style.display = 'block');
    viExamples.forEach(el => el.style.display = 'block');

    // Chuyển lại sự kiện click sang bản dịch tiếng Việt
    const defItems = document.querySelectorAll('.dict-def-item');
    defItems.forEach(item => {
      const defText = item.querySelector('.dict-def-text')?.innerText.trim() || '';
      const exampleEl = item.querySelector('.dict-example-vi') || item.querySelector('.dict-example-text');
      const exampleText = exampleEl ? exampleEl.innerText.replace(/^👉 Dịch câu:|^"|"$/g, '').trim() : '';
      const defVi = item.querySelector('.dict-def-vi')?.innerText.replace(/^(?:\s*|.*?)\s*Dịch:\s*/i, '').trim() || '';

      item.onclick = function() {
        selectDictDef(defText, exampleText, defVi);
      };
    });

    btn.setAttribute('data-translated', 'true');
    btn.innerHTML = '<i class="fas fa-eye-slash"></i> Ẩn bản dịch';
    btn.style.background = '#10b981';
    return;
  }

  // TIẾN HÀNH DỊCH LẦN ĐẦU TIÊN
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang dịch...';

  const defItems = document.querySelectorAll('.dict-def-item');
  for (const item of defItems) {
    // Lưu lại onclick gốc để phục hồi khi ẩn
    const originalClick = item.getAttribute('onclick');
    if (originalClick) {
      item.setAttribute('data-original-click', originalClick);
    }

    const defEl = item.querySelector('.dict-def-text');
    const exampleEl = item.querySelector('.dict-example-text');
    
    const defText = defEl ? defEl.innerText.trim() : '';
    const exampleText = exampleEl ? exampleEl.innerText.replace(/^"|"$/g, '').trim() : '';

    let defVi = '';
    let exampleVi = '';

    if (defText) {
      try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(defText)}`);
        if (res.ok) {
          const data = await res.json();
          defVi = data[0][0][0];
          
          // Chèn bản dịch tiếng Việt bên dưới định nghĩa tiếng Anh
          const viDiv = document.createElement('div');
          viDiv.className = 'dict-def-vi';
          viDiv.style.color = '#10b981';
          viDiv.style.fontWeight = '600';
          viDiv.style.marginTop = '6px';
          viDiv.style.fontSize = '0.88rem';
          viDiv.innerHTML = `<i class="fas fa-check-circle"></i> Dịch: ${escapeHtml(defVi)}`;
          item.appendChild(viDiv);
        }
      } catch (e) {
        console.error("Dịch định nghĩa thất bại:", e);
      }
    }

    if (exampleText) {
      try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(exampleText)}`);
        if (res.ok) {
          const data = await res.json();
          exampleVi = data[0][0][0];
          
          // Chèn bản dịch tiếng Việt bên dưới ví dụ tiếng Anh
          const viExampleDiv = document.createElement('div');
          viExampleDiv.className = 'dict-example-vi';
          viExampleDiv.style.color = 'var(--text-sub)';
          viExampleDiv.style.fontStyle = 'italic';
          viExampleDiv.style.marginTop = '2px';
          viExampleDiv.style.fontSize = '0.82rem';
          viExampleDiv.style.opacity = '0.9';
          viExampleDiv.innerHTML = `👉 Dịch câu: <em>"${escapeHtml(exampleVi)}"</em>`;
          item.appendChild(viExampleDiv);
        }
      } catch (e) {
        console.error("Dịch ví dụ thất bại:", e);
      }
    }

    // Gán onclick mới để chọn nghĩa dịch tiếng Việt
    item.onclick = function() {
      selectDictDef(defText, exampleVi || exampleText, defVi);
    };
  }

  btn.disabled = false;
  btn.setAttribute('data-translated', 'true');
  btn.setAttribute('data-has-translated', 'true');
  btn.innerHTML = '<i class="fas fa-eye-slash"></i> Ẩn bản dịch';
  btn.style.background = '#10b981';
};

// Dictionary lookup function for editor row

window.autoFillRow = function(btn) {
  const row = btn.closest('.editor-term-card');
  autoFillCardRow(row);
};

async function autoFillCardRow(row) {
  const termInput = row.querySelector('.row-term-input');
  const typeInput = row.querySelector('.row-type-input');
  const phoneticInput = row.querySelector('.row-phonetic-input');
  const defInput = row.querySelector('.row-def-input');
  
  const imagePreview = row.querySelector('.image-upload-preview');
  const imageHidden = row.querySelector('.row-image-data');
  const uploadText = row.querySelector('.image-upload-box-text');

  const word = termInput.value.trim();
  if (!word) return;

  // Hiển thị trạng thái đang tải
  if (!defInput.value) defInput.placeholder = "Đang dịch tự động...";
  if (!phoneticInput.value) phoneticInput.placeholder = "Đang tra...";
  if (!typeInput.value) typeInput.placeholder = "Đang tra...";

  // 1. Tự động dịch sang tiếng Việt bằng Google Translate API
  let translatedText = "";
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(word)}`);
    if (res.ok) {
      const data = await res.json();
      translatedText = data[0][0][0];
      if (!defInput.value && translatedText) {
        defInput.value = translatedText;
        defInput.parentElement?.classList.add('flash-success');
        setTimeout(() => defInput.parentElement?.classList.remove('flash-success'), 1000);
      }
    }
  } catch (err) {
    console.error("Dịch tự động thất bại:", err);
  } finally {
    defInput.placeholder = "ĐỊNH NGHĨA";
  }

  // 2. Tra cứu Loại từ & Phiên âm bằng Dictionary API
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (res.ok) {
      const data = await res.json();
      const entry = data[0];
      
      // Lấy phiên âm
      const phonetic = entry.phonetic || entry.phonetics?.find(p => p.text)?.text || "";
      if (phonetic && !phoneticInput.value) {
        phoneticInput.value = phonetic;
        phoneticInput.parentElement?.classList.add('flash-success');
        setTimeout(() => phoneticInput.parentElement?.classList.remove('flash-success'), 1000);
      }

      // Lấy loại từ
      let pos = entry.meanings?.[0]?.partOfSpeech || "";
      if (pos) {
        const posMap = {
          "noun": "n. (Danh từ)",
          "verb": "v. (Động từ)",
          "adjective": "adj. (Tính từ)",
          "adverb": "adv. (Trạng từ)",
          "preposition": "prep. (Giới từ)",
          "conjunction": "conj. (Liên từ)"
        };
        const posShort = posMap[pos.toLowerCase()] || pos;
        if (!typeInput.value) {
          typeInput.value = posShort;
          typeInput.parentElement?.classList.add('flash-success');
          setTimeout(() => typeInput.parentElement?.classList.remove('flash-success'), 1000);
        }
      }
    } else {
      if (res.status === 404) {
        showToast(`Không tìm thấy phiên âm/loại từ cho "${word}". Vui lòng kiểm tra lại chính tả!`, 'error');
      }
    }
  } catch (err) {
    console.error("Tra cứu từ điển thất bại:", err);
  } finally {
    phoneticInput.placeholder = "PHIÊN ÂM (E.G. /ˈBJUːTIFL/)";
    typeInput.placeholder = "LOẠI TỪ (N, V, ADJ...)";
  }

}

// ==========================================
// IMAGE SEARCH RECOMMENDATION SYSTEM
// ==========================================
let currentImgTargetRow = null;

window.openImageSearchModal = function(box) {
  // Prevent nested input clicks
  if (event && event.target && event.target.tagName === 'INPUT') return;

  const row = box.closest('.editor-term-card');
  currentImgTargetRow = row;
  
  const termInput = row.querySelector('.row-term-input');
  const keyword = termInput ? termInput.value.trim() : '';
  
  document.getElementById('img-search-keyword').value = keyword;
  document.getElementById('imageSearchModal').classList.add('active');
  
  searchImagesForModal();
};

window.closeImageSearchModal = function() {
  document.getElementById('imageSearchModal').classList.remove('active');
};

window.searchImagesForModal = async function() {
  const keyword = document.getElementById('img-search-keyword').value.trim();
  const resultsContainer = document.getElementById('image-search-results');
  resultsContainer.innerHTML = '';

  if (!keyword) {
    resultsContainer.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; opacity:0.5;">Nhập từ khóa tiếng Anh để tìm kiếm hình ảnh gợi ý.</div>';
    return;
  }

  resultsContainer.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Đang tải ảnh gợi ý...</div>';

  try {
    // 1. Tra cứu Wikimedia Commons để lấy ảnh chuẩn xác theo từ khóa
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(keyword.toLowerCase())}&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json&origin=*&gsrlimit=30`;
    const res = await fetch(wikiUrl);
    let wikiImages = [];
    if (res.ok) {
      const data = await res.json();
      const pages = data.query?.pages || {};
      wikiImages = Object.values(pages)
        .map(p => {
          const info = p.imageinfo?.[0];
          return info?.thumburl || info?.url || "";
        })
        .filter(url => {
          if (!url) return false;
          const lower = url.toLowerCase();
          return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
        });
    }

    // Lọc trùng lặp
    let images = [...new Set(wikiImages)];

    // Nếu không đủ 12 ảnh, bù bằng LoremFlickr
    if (images.length < 12) {
      const needed = 12 - images.length;
      for (let i = 1; i <= needed; i++) {
        images.push(`https://loremflickr.com/400/300/${encodeURIComponent(keyword.toLowerCase())}?random=${i}`);
      }
    }

    // Giới hạn tối đa 12 ảnh
    images = images.slice(0, 12);

    // Render các item ảnh
    resultsContainer.innerHTML = '';
    images.forEach((url, idx) => {
      const item = document.createElement('div');
      item.className = 'img-search-item';
      item.innerHTML = `<img src="${url}" alt="Gợi ý ${idx+1}" onerror="this.src='https://placehold.co/150x110?text=Error+Loading'">`;
      item.addEventListener('click', () => {
        selectSuggestedImage(url);
      });
      resultsContainer.appendChild(item);
    });
  } catch (err) {
    console.error("Lỗi khi tải ảnh gợi ý:", err);
    // Fallback hoàn toàn về LoremFlickr
    resultsContainer.innerHTML = '';
    const images = [];
    for (let i = 1; i <= 12; i++) {
      images.push(`https://loremflickr.com/400/300/${encodeURIComponent(keyword.toLowerCase())}?random=${i}`);
    }
    images.forEach((url, idx) => {
      const item = document.createElement('div');
      item.className = 'img-search-item';
      item.innerHTML = `<img src="${url}" alt="Gợi ý ${idx+1}" onerror="this.src='https://placehold.co/150x110?text=Error+Loading'">`;
      item.addEventListener('click', () => {
        selectSuggestedImage(url);
      });
      resultsContainer.appendChild(item);
    });
  }
};

function selectSuggestedImage(url) {
  if (!currentImgTargetRow) return;
  
  const preview = currentImgTargetRow.querySelector('.image-upload-preview');
  const dataInput = currentImgTargetRow.querySelector('.row-image-data');
  const text = currentImgTargetRow.querySelector('.image-upload-box-text');

  dataInput.value = url;
  preview.src = url;
  preview.classList.remove('hidden');
  if (text) text.innerText = "Thay đổi ảnh";
  
  closeImageSearchModal();
  showToast("Đã chọn hình ảnh thành công!", "success");
}

window.triggerLocalImageUpload = function() {
  if (!currentImgTargetRow) return;
  const fileInput = currentImgTargetRow.querySelector('.image-file-input');
  if (fileInput) {
    fileInput.click();
  }
  closeImageSearchModal();
};

window.lookupDictForRow = function(btn) {
  const row = btn.closest('.editor-term-card');
  const termInput = row.querySelector('.row-term-input');
  const defInput = row.querySelector('.row-def-input');
  const hintInput = row.querySelector('.row-hint-input');
  const word = termInput.value.trim();
  if (!word) { alert('Vui lòng nhập từ tiếng Anh trước!'); return; }
  openDictModal(word, defInput, hintInput);
};

// ==========================================
// BACKUP MANAGER
// ==========================================
window.openBackupModal = async function() {
  document.getElementById('backupModal').classList.add('active');
  await loadBackupList();
};
window.closeBackupModal = function() { document.getElementById('backupModal').classList.remove('active'); };

async function loadBackupList() {
  const container = document.getElementById('backup-list-container');
  if (isDemoMode) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">Tính năng backup cần server.ps1 đang chạy.</div>';
    return;
  }
  try {
    const res = await fetch('/api/backups');
    const backups = await res.json();
    if (!backups || backups.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.5;">Chưa có bản sao lưu nào.</div>';
      return;
    }
    container.innerHTML = backups.map(b => `
      <div class="backup-item">
        <div class="backup-item-icon"><i class="fas fa-file-archive"></i></div>
        <div class="backup-item-info">
          <div class="backup-item-name">${escapeHtml(b.filename)}</div>
          <div class="backup-item-date">${new Date(b.date).toLocaleString('vi-VN')} — ${Math.round(b.size/1024)} KB</div>
        </div>
        <button class="btn-restore" onclick="restoreBackup('${b.filename}')">
          <i class="fas fa-undo"></i> Khôi phục
        </button>
      </div>
    `).join('');
  } catch(e) {
    container.innerHTML = '<div style="color:var(--danger); padding:10px;">Lỗi tải danh sách backup.</div>';
  }
}

async function createBackupNow() {
  if (isDemoMode) { alert('Cần server đang chạy để tạo backup!'); return; }
  try {
    const res = await fetch('/api/backups', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Đã tạo backup: ${data.filename}`);
      await loadBackupList();
    }
  } catch(e) { alert('Lỗi tạo backup!'); }
}

window.restoreBackup = async function(filename) {
  if (!confirm(`Bạn có chắc muốn KHÔI PHỤC dữ liệu từ "${filename}"?\n\nDữ liệu hiện tại sẽ được backup trước khi khôi phục.`)) return;
  try {
    const res = await fetch(`/api/restore/${filename}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('✅ Đã khôi phục thành công! Ứng dụng sẽ tải lại.');
      closeBackupModal();
      setTimeout(() => location.reload(), 500);
    }
  } catch(e) { alert('Lỗi khôi phục!'); }
};

window.syncLocalToApi = async function() {
  try {
    const ping = await fetch('/api/status');
    if (!ping.ok) throw new Error('API server unreachable');
  } catch (e) {
    alert("❌ Không thể kết nối với máy chủ API. Hãy chắc chắn rằng file server.ps1 đang chạy!");
    return;
  }

  if (!confirm("⚠️ Bạn có chắc muốn ĐẨY toàn bộ dữ liệu từ LocalStorage lên máy chủ API?\nDữ liệu hiện tại trên Máy chủ sẽ bị thay thế (và tự động sao lưu dự phòng).")) return;

  const payload = {
    folders: getLocalStorage(FOLDERS_KEY),
    sets: getLocalStorage(SETS_KEY),
    cards: getLocalStorage(CARDS_KEY),
    study_log: JSON.parse(localStorage.getItem(STUDY_LOG_KEY) || '[]'),
    settings: (() => {
      const s = JSON.parse(localStorage.getItem('tts_settings') || '{}');
      return {
        tts_enabled: s.enabled !== false,
        tts_rate: s.rate || 0.9,
        tts_voice: s.voice || 'en-US',
        auto_speak_on_flip: s.autoFlip === true
      };
    })()
  };

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    if (data.success) {
      alert("✅ Đồng bộ lên Server thành công! Ứng dụng sẽ tải lại.");
      setTimeout(() => location.reload(), 500);
    } else {
      alert("❌ Đồng bộ thất bại: " + data.error);
    }
  } catch (e) {
    alert("❌ Lỗi kết nối khi đồng bộ: " + e.message);
  }
};

window.syncApiToLocal = async function() {
  try {
    const ping = await fetch('/api/status');
    if (!ping.ok) throw new Error('API server unreachable');
  } catch (e) {
    alert("❌ Không thể kết nối với máy chủ API. Hãy chắc chắn rằng file server.ps1 đang chạy!");
    return;
  }

  if (!confirm("⚠️ Bạn có chắc muốn TẢI toàn bộ dữ liệu từ máy chủ API về máy?\nDữ liệu LocalStorage hiện tại trên trình duyệt của bạn sẽ bị ghi đè hoàn toàn!")) return;

  try {
    const [foldersRes, setsRes, cardsRes, logRes, settingsRes] = await Promise.all([
      fetch('/api/folders'),
      fetch('/api/sets'),
      fetch('/api/cards'),
      fetch('/api/study-log'),
      fetch('/api/settings')
    ]);

    if (!foldersRes.ok || !setsRes.ok || !cardsRes.ok || !logRes.ok || !settingsRes.ok) {
      throw new Error("Một hoặc nhiều yêu cầu tải dữ liệu từ API thất bại.");
    }

    const folders = await foldersRes.json();
    const sets = await setsRes.json();
    const cards = await cardsRes.json();
    const studyLog = await logRes.json();
    const settings = await settingsRes.json();

    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    localStorage.setItem(SETS_KEY, JSON.stringify(sets));
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
    localStorage.setItem(STUDY_LOG_KEY, JSON.stringify(studyLog));
    localStorage.setItem('tts_settings', JSON.stringify({
      enabled: settings.tts_enabled !== false,
      rate: settings.tts_rate || 0.9,
      voice: settings.tts_voice || 'en-US',
      autoFlip: settings.auto_speak_on_flip === true
    }));

    alert("✅ Tải dữ liệu từ máy chủ thành công! Ứng dụng sẽ tải lại.");
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    alert("❌ Không thể tải dữ liệu: " + e.message);
  }
};

window.mergeSync = async function() {
  try {
    const ping = await fetch('/api/status');
    if (!ping.ok) throw new Error('API server unreachable');
  } catch (e) {
    alert("❌ Không thể kết nối với máy chủ API. Hãy chắc chắn rằng file server.ps1 đang chạy!");
    return;
  }

  if (!confirm("🔄 Bạn có chắc muốn TRỘN (Merge) dữ liệu giữa LocalStorage và Máy chủ?\nTiến trình học tập và học phần sẽ được kết hợp từ cả hai nguồn.")) return;

  try {
    // 1. Tải dữ liệu từ API Server
    const [foldersRes, setsRes, cardsRes, logRes, settingsRes] = await Promise.all([
      fetch('/api/folders'),
      fetch('/api/sets'),
      fetch('/api/cards'),
      fetch('/api/study-log'),
      fetch('/api/settings')
    ]);

    if (!foldersRes.ok || !setsRes.ok || !cardsRes.ok || !logRes.ok || !settingsRes.ok) {
      throw new Error("Một hoặc nhiều yêu cầu tải dữ liệu từ API thất bại.");
    }

    const apiFolders = await foldersRes.json();
    const apiSets = await setsRes.json();
    const apiCards = await cardsRes.json();
    const apiStudyLog = await logRes.json();
    const apiSettings = await settingsRes.json();

    // 2. Lấy dữ liệu từ LocalStorage
    const localFolders = getLocalStorage(FOLDERS_KEY);
    const localSets = getLocalStorage(SETS_KEY);
    const localCards = getLocalStorage(CARDS_KEY);
    const localStudyLog = JSON.parse(localStorage.getItem(STUDY_LOG_KEY) || '[]');
    const localSettings = JSON.parse(localStorage.getItem('tts_settings') || '{}');

    // 3. Trộn Folders
    const folderMap = new Map();
    apiFolders.forEach(f => folderMap.set(f.id, f));
    localFolders.forEach(f => {
      if (!folderMap.has(f.id)) {
        folderMap.set(f.id, f);
      }
    });
    const mergedFolders = Array.from(folderMap.values());

    // 4. Trộn Sets
    const setMap = new Map();
    apiSets.forEach(s => setMap.set(s.id, s));
    localSets.forEach(s => {
      if (!setMap.has(s.id)) {
        setMap.set(s.id, s);
      }
    });
    const mergedSets = Array.from(setMap.values());

    // 5. Trộn Cards
    const cardMap = new Map();
    apiCards.forEach(c => cardMap.set(c.id, c));
    localCards.forEach(c => {
      if (!cardMap.has(c.id)) {
        cardMap.set(c.id, c);
      } else {
        // Giữ lại thẻ có số lần lặp lại (tiến trình học) cao hơn
        const apiCard = cardMap.get(c.id);
        const apiRep = apiCard.repetition || 0;
        const localRep = c.repetition || 0;
        if (localRep > apiRep) {
          cardMap.set(c.id, c);
        }
      }
    });
    const mergedCards = Array.from(cardMap.values());

    // 6. Trộn Study Log
    const logMap = new Map();
    apiStudyLog.forEach(l => {
      const key = l.id || `${l.cardId}_${l.date}_${l.rating}`;
      logMap.set(key, l);
    });
    localStudyLog.forEach(l => {
      const key = l.id || `${l.cardId}_${l.date}_${l.rating}`;
      logMap.set(key, l);
    });
    const mergedStudyLog = Array.from(logMap.values());

    // 7. Trộn Settings (ưu tiên LocalSettings nếu có sửa đổi)
    const mergedSettings = {
      tts_enabled: localSettings.enabled !== undefined ? localSettings.enabled : (apiSettings.tts_enabled !== false),
      tts_rate: localSettings.rate !== undefined ? localSettings.rate : (apiSettings.tts_rate || 0.9),
      tts_voice: localSettings.voice !== undefined ? localSettings.voice : (apiSettings.tts_voice || 'en-US'),
      auto_speak_on_flip: localSettings.autoFlip !== undefined ? localSettings.autoFlip : (apiSettings.auto_speak_on_flip === true)
    };

    const payload = {
      folders: mergedFolders,
      sets: mergedSets,
      cards: mergedCards,
      study_log: mergedStudyLog,
      settings: mergedSettings
    };

    // 8. Đẩy dữ liệu đã trộn lên Server
    const syncRes = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!syncRes.ok) throw new Error(`HTTP error during save: ${syncRes.status}`);

    const syncData = await syncRes.json();
    if (!syncData.success) throw new Error(syncData.error || "Lỗi ghi dữ liệu trộn lên server");

    // 9. Ghi đè lại LocalStorage
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(mergedFolders));
    localStorage.setItem(SETS_KEY, JSON.stringify(mergedSets));
    localStorage.setItem(CARDS_KEY, JSON.stringify(mergedCards));
    localStorage.setItem(STUDY_LOG_KEY, JSON.stringify(mergedStudyLog));
    localStorage.setItem('tts_settings', JSON.stringify({
      enabled: mergedSettings.tts_enabled,
      rate: mergedSettings.tts_rate,
      voice: mergedSettings.tts_voice,
      autoFlip: mergedSettings.auto_speak_on_flip
    }));

    alert("✅ Trộn và đồng bộ dữ liệu thành công! Ứng dụng sẽ tải lại.");
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    alert("❌ Lỗi trong quá trình trộn dữ liệu: " + e.message);
  }
};

window.openPrintModal = function() {
  document.getElementById('printModal').classList.add('active');
};

window.closePrintModal = function() {
  document.getElementById('printModal').classList.remove('active');
};

window.startPrintProcess = function() {
  const layout = document.querySelector('input[name="print-layout"]:checked').value;
  closePrintModal();

  if (!currentSetCards || currentSetCards.length === 0) {
    alert("Học phần này không có thẻ nào để in!");
    return;
  }

  // Get current set info
  const setTitle = document.getElementById('set-detail-title').innerText || "Học phần từ vựng";
  
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Không thể mở cửa sổ in. Vui lòng cho phép mở popup trên trình duyệt của bạn!");
    return;
  }

  let htmlContent = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>In học phần - ${setTitle}</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <style>
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          margin: 40px;
          color: #1e293b;
          background-color: #ffffff;
        }
        h1 {
          font-size: 1.8rem;
          margin-bottom: 5px;
          color: #0f172a;
        }
        .set-meta {
          font-size: 0.9rem;
          color: #64748b;
          margin-bottom: 24px;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 12px;
        }
        
        /* Layout List */
        .print-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        .print-table th, .print-table td {
          border: 1px solid #cbd5e1;
          padding: 12px;
          text-align: left;
          vertical-align: top;
        }
        .print-table th {
          background-color: #f1f5f9;
          font-weight: 700;
          color: #334155;
        }
        .term-col {
          font-weight: 700;
          font-size: 1.05rem;
          color: #4f46e5;
          width: 25%;
        }
        .pos-phonetic {
          font-size: 0.85rem;
          color: #64748b;
          margin-top: 4px;
        }
        .pos-badge {
          background-color: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 0.75rem;
        }
        
        /* Layout Cards */
        .print-cards-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        .fold-card-item {
          border: 2px dashed #94a3b8;
          border-radius: 8px;
          display: flex;
          height: 180px;
          box-sizing: border-box;
          page-break-inside: avoid;
        }
        .card-half {
          flex: 1;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          box-sizing: border-box;
          position: relative;
        }
        .card-half.front {
          border-right: 1px dotted #cbd5e1;
          background-color: #f8fafc;
        }
        .card-half.back {
          background-color: #ffffff;
        }
        .fold-line-label {
          position: absolute;
          right: -12px;
          top: 50%;
          transform: translateY(-50%) rotate(90deg);
          font-size: 0.55rem;
          color: #94a3b8;
          background: #ffffff;
          padding: 2px 4px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          z-index: 10;
        }
        .card-term {
          font-size: 1.25rem;
          font-weight: 800;
          color: #0f172a;
        }
        .card-def {
          font-size: 1.1rem;
          font-weight: 600;
          color: #1e293b;
        }
        .card-subtext {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 6px;
        }
        .card-img-preview {
          max-height: 50px;
          max-width: 80px;
          object-fit: cover;
          border-radius: 4px;
          margin-bottom: 6px;
        }
        
        @media print {
          body {
            margin: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      </style>
    </head>
    <body>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:16px;" class="no-print">
        <div>
          <h1 style="margin:0;">Học phần: ${escapeHtml(setTitle)}</h1>
          <div style="font-size:0.9rem; color:#64748b; margin-top:4px;">Số lượng: ${currentSetCards.length} từ vựng • Tạo bởi TCTEnglish</div>
        </div>
        <button onclick="window.print()" style="background:#23b26d; color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:700; font-size:1rem; cursor:pointer; display:flex; align-items:center; gap:8px;">
          <i class="fas fa-print"></i> Click vào đây để IN / Xuất PDF
        </button>
      </div>
  `;

  if (layout === 'list') {
    htmlContent += `
      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">STT</th>
            <th>Thuật ngữ (English)</th>
            <th>Định nghĩa (Tiếng Việt)</th>
          </tr>
        </thead>
        <tbody>
    `;

    currentSetCards.forEach((c, idx) => {
      htmlContent += `
        <tr>
          <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
          <td class="term-col">
            <div>${escapeHtml(c.front_word)}</div>
            <div class="pos-phonetic">
              ${c.phonetic ? `<span style="font-family: monospace; font-size: 0.9rem; margin-right: 6px;">${escapeHtml(c.phonetic)}</span>` : ''}
              ${c.word_type ? `<span class="pos-badge">${escapeHtml(c.word_type)}</span>` : ''}
            </div>
          </td>
          <td>
            <div style="font-weight: 500; font-size: 1.05rem;">${escapeHtml(c.back_meaning)}</div>
            ${c.hint ? `<div style="font-size: 0.8rem; color: #64748b; margin-top: 4px; font-style: italic;">Gợi ý: ${escapeHtml(c.hint)}</div>` : ''}
          </td>
        </tr>
      `;
    });

    htmlContent += `
        </tbody>
      </table>
    `;
  } else {
    // Layout cards (Fold-and-cut grid)
    htmlContent += `<div class="print-cards-grid">`;

    currentSetCards.forEach((c) => {
      htmlContent += `
        <div class="fold-card-item">
          <!-- Mặt trước -->
          <div class="card-half front">
            <span class="fold-line-label">GẤP ĐÔI</span>
            <div class="card-term">${escapeHtml(c.front_word)}</div>
            <div class="pos-phonetic" style="margin-top: 8px;">
              ${c.phonetic ? `<span style="font-family: monospace; font-size: 0.85rem; margin-right: 6px;">${escapeHtml(c.phonetic)}</span>` : ''}
              ${c.word_type ? `<span class="pos-badge">${escapeHtml(c.word_type)}</span>` : ''}
            </div>
          </div>
          <!-- Mặt sau -->
          <div class="card-half back">
            ${c.existing_image_url ? `<img src="${c.existing_image_url}" class="card-img-preview" onerror="this.style.display='none'">` : ''}
            <div class="card-def">${escapeHtml(c.back_meaning)}</div>
            ${c.hint ? `<div class="card-subtext" style="font-style: italic;">Gợi ý: ${escapeHtml(c.hint)}</div>` : ''}
          </div>
        </div>
      `;
    });

    htmlContent += `</div>`;
  }

  htmlContent += `
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
};

document.getElementById('backup-manager-btn').addEventListener('click', openBackupModal);
document.getElementById('create-backup-btn').addEventListener('click', createBackupNow);

// ==========================================
// PHASE 3: TOAST NOTIFICATION SYSTEM
// ==========================================
(function() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);
})();

function showToast(message, type = 'info', icon = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icon || icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==========================================
// PHASE 3: KEYBOARD SHORTCUTS MODAL
// ==========================================
window.openShortcutsModal = function() {
  document.getElementById('shortcutsModal').classList.add('active');
};
window.closeShortcutsModal = function() {
  document.getElementById('shortcutsModal').classList.remove('active');
};

// Global keyboard handler
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  // '?' → shortcuts modal
  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault();
    const sm = document.getElementById('shortcutsModal');
    if (sm.classList.contains('active')) closeShortcutsModal();
    else openShortcutsModal();
  }

  // 'D' → dark mode toggle
  if (e.key === 'd' || e.key === 'D') {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const btn = document.getElementById('dark-mode-toggle-btn');
    if (btn) btn.click();
  }

  // Escape → close any open modal
  if (e.key === 'Escape') {
    const modals = document.querySelectorAll('.modal-overlay.active');
    modals.forEach(m => m.classList.remove('active'));
  }
});

// ==========================================
// PHASE 2: DAILY GOAL + STREAK SYSTEM
// ==========================================
const DAILY_GOAL_KEY = 'daily_goal_target';
const DAILY_COUNT_KEY = 'daily_review_count';
const DAILY_DATE_KEY = 'daily_review_date';
const STREAK_KEY = 'study_streak';
const STREAK_DATE_KEY = 'study_streak_last_date';

function getUserKey(key) {
  if (currentUser && currentUser.id) {
    return `${currentUser.id}_${key}`;
  }
  return key;
}

function getDailyGoalTarget() {
  return parseInt(localStorage.getItem(getUserKey(DAILY_GOAL_KEY)) || '20');
}

function setDailyGoalTarget(n) {
  localStorage.setItem(getUserKey(DAILY_GOAL_KEY), n.toString());
}

function getDailyCount() {
  const today = new Date().toISOString().split('T')[0];
  const storedDate = localStorage.getItem(getUserKey(DAILY_DATE_KEY));
  if (storedDate !== today) {
    // Reset count for new day
    localStorage.setItem(getUserKey(DAILY_DATE_KEY), today);
    localStorage.setItem(getUserKey(DAILY_COUNT_KEY), '0');
    return 0;
  }
  return parseInt(localStorage.getItem(getUserKey(DAILY_COUNT_KEY)) || '0');
}

function incrementDailyCount(n = 1) {
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem(getUserKey(DAILY_DATE_KEY), today);
  const current = getDailyCount();
  const newCount = current + n;
  localStorage.setItem(getUserKey(DAILY_COUNT_KEY), newCount.toString());

  // Check and update streak
  const lastDate = localStorage.getItem(getUserKey(STREAK_DATE_KEY));
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let streak = parseInt(localStorage.getItem(getUserKey(STREAK_KEY)) || '0');
  if (lastDate !== today) {
    if (lastDate === yesterdayStr || streak === 0) {
      streak++;
    } else if (!lastDate) {
      streak = 1;
    } else {
      streak = 1; // reset streak for missing a day
    }
    localStorage.setItem(getUserKey(STREAK_KEY), streak.toString());
    localStorage.setItem(getUserKey(STREAK_DATE_KEY), today);
  }

  updateDailyGoalUI(newCount, getDailyGoalTarget(), streak);
  updateSidebarStreak(streak);
  return newCount;
}

function updateDailyGoalUI(count, target, streak) {
  const goalEl = document.getElementById('goal-today-count');
  const targetEl = document.getElementById('goal-target');
  const ringFill = document.getElementById('goal-ring-fill');
  const streakEl = document.getElementById('streak-days');

  if (goalEl) goalEl.innerText = count;
  if (targetEl) targetEl.innerText = target;
  if (streakEl) streakEl.innerText = streak !== undefined ? streak : (parseInt(localStorage.getItem(getUserKey(STREAK_KEY)) || '0'));

  if (ringFill) {
    const pct = Math.min(count / target, 1);
    const circumference = 138.2;
    const offset = circumference * (1 - pct);
    ringFill.setAttribute('stroke-dashoffset', offset.toFixed(1));
    // Color feedback
    if (pct >= 1) {
      ringFill.setAttribute('stroke', '#23b26d');
      if (count === target) showToast('🎉 Đã hoàn thành mục tiêu hôm nay!', 'success');
    } else if (pct >= 0.5) {
      ringFill.setAttribute('stroke', '#ffcd1f');
    } else {
      ringFill.setAttribute('stroke', '#4255ff');
    }
  }
}

function updateSidebarStreak(streak) {
  const el = document.getElementById('sidebar-streak');
  if (el) el.innerText = streak !== undefined ? streak : (localStorage.getItem(getUserKey(STREAK_KEY)) || '0');
}

function initDailyGoalUI() {
  const count = getDailyCount();
  const target = getDailyGoalTarget();
  const streak = parseInt(localStorage.getItem(getUserKey(STREAK_KEY)) || '0');
  updateDailyGoalUI(count, target, streak);
  updateSidebarStreak(streak);
}

// Intercept markCardSRS to count daily reviews
const _originalMCS2 = window.markCardSRS;
window.markCardSRS = async function(q) {
  await _originalMCS2(q);
  incrementDailyCount(1);
};

// Also intercept write mode check answer
const _origCheckWrite = checkWriteAnswer;

// Set goal button
document.getElementById('set-goal-btn')?.addEventListener('click', () => {
  const current = getDailyGoalTarget();
  const newGoal = prompt(`Đặt mục tiêu ôn tập hàng ngày (thẻ/ngày):\nHiện tại: ${current}`, current);
  if (newGoal && !isNaN(parseInt(newGoal)) && parseInt(newGoal) > 0) {
    setDailyGoalTarget(parseInt(newGoal));
    initDailyGoalUI();
    showToast(`✅ Đã đặt mục tiêu: ${parseInt(newGoal)} thẻ/ngày`, 'success');
  }
});

// ==========================================
// PHASE 2: SMART REVIEW SESSION
// ==========================================
let smartReviewLimit = 20;
let smartReviewAllCards = [];

window.openSmartReviewModal = async function() {
  const modal = document.getElementById('smartReviewModal');
  modal.classList.add('active');

  // Load all cards and compute stats
  let allCards = [];
  if (!isDemoMode) {
    try {
      const res = await fetch('/api/cards');
      if (res.ok) allCards = await res.json();
    } catch(e) {}
  } else {
    allCards = getLocalStorage(CARDS_KEY);
  }
  smartReviewAllCards = allCards;

  const now = new Date();
  const dueCards = allCards.filter(c => new Date(c.next_review || 0) <= now);
  const newCards = allCards.filter(c => (c.repetition || 0) === 0);
  const mastered = allCards.filter(c => (c.repetition || 0) >= 5);
  const starred = allCards.filter(c => c.starred === true);

  document.getElementById('sr-due-count').innerText = dueCards.length;
  document.getElementById('sr-new-count').innerText = newCards.length;
  document.getElementById('sr-mastered-count').innerText = mastered.length;
  document.getElementById('sr-starred-count').innerText = starred.length;
};
window.closeSmartReviewModal = function() {
  document.getElementById('smartReviewModal').classList.remove('active');
};

document.getElementById('smart-review-quick-btn')?.addEventListener('click', openSmartReviewModal);
document.getElementById('start-review-btn')?.addEventListener('click', openSmartReviewModal);

document.querySelectorAll('.sr-limit-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sr-limit-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    smartReviewLimit = parseInt(btn.dataset.limit);
  });
});

document.getElementById('start-smart-review-btn')?.addEventListener('click', async () => {
  closeSmartReviewModal();

  const now = new Date();
  const filterVal = document.getElementById('smart-review-filter').value;
  let pool = [];

  if (filterVal === 'starred') {
    pool = smartReviewAllCards.filter(c => c.starred === true);
  } else {
    // Prioritize: due cards first, then new cards
    const dueCards = smartReviewAllCards.filter(c => new Date(c.next_review || 0) <= now);
    const newCards = smartReviewAllCards.filter(c => (c.repetition || 0) === 0 && new Date(c.next_review || 0) > now);
    pool = [...dueCards, ...newCards];
  }

  pool = pool.slice(0, smartReviewLimit);

  if (pool.length === 0) {
    showToast(filterVal === 'starred' ? '🎉 Bạn chưa đánh dấu thẻ nào hoặc bộ lọc rỗng!' : '🎉 Không có thẻ nào cần ôn tập hôm nay! Xuất sắc!', 'info');
    return;
  }

  // Find a set to navigate to, or create a virtual session
  // We'll use the first card's set_id to navigate
  const mode = document.getElementById('smart-review-mode').value;

  // Group by most common set
  const setCount = {};
  pool.forEach(c => { setCount[c.set_id] = (setCount[c.set_id] || 0) + 1; });
  const topSetId = Object.entries(setCount).sort((a,b) => b[1]-a[1])[0]?.[0];

  if (topSetId) {
    // Navigate to that set and filter to due cards
    await showSetDetailView(topSetId);
    // Override study cards with the smart review pool for that set
    currentStudyCards = currentSetCards.filter(c => pool.some(p => p.id === c.id));
    studyFilterMode = 'due';

    document.getElementById('studyMode').value = mode;
    selectStudyMode(mode);
    showToast(`🧠 Phiên ôn tập thông minh: ${pool.filter(c => c.set_id === topSetId).length} thẻ`, 'info');
  }
});

// ==========================================
// PHASE 2: IMPORT CSV / TEXT
// ==========================================
let importedParsedCards = [];

function parseImportText(text, separator) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const cards = [];
  const sepMap = { tab: '\t', comma: ',', semicolon: ';' };
  const sep = sepMap[separator] || '\t';

  lines.forEach(line => {
    const parts = line.split(sep);
    if (parts.length >= 4) {
      const term = parts[0].trim().replace(/^["']|["']$/g, '');
      const phonetic = parts[1].trim().replace(/^["']|["']$/g, '');
      const wordType = parts[2].trim().replace(/^["']|["']$/g, '');
      const def = parts.slice(3).join(sep).trim().replace(/^["']|["']$/g, '');
      if (term && def) cards.push({ term, def, wordType, phonetic });
    } else if (parts.length === 3) {
      const term = parts[0].trim().replace(/^["']|["']$/g, '');
      const wordType = parts[1].trim().replace(/^["']|["']$/g, '');
      const def = parts.slice(2).join(sep).trim().replace(/^["']|["']$/g, '');
      if (term && def) cards.push({ term, def, wordType, phonetic: '' });
    } else if (parts.length === 2) {
      const term = parts[0].trim().replace(/^["']|["']$/g, '');
      const def = parts[1].trim().replace(/^["']|["']$/g, '');
      if (term && def) cards.push({ term, def, wordType: '', phonetic: '' });
    }
  });
  return cards;
}

function getImportSeparator() {
  const checked = document.querySelector('input[name="import-format"]:checked');
  return checked ? checked.value : 'tab';
}

function renderImportPreview(cards) {
  const preview = document.getElementById('import-preview');
  const table = document.getElementById('import-preview-table');

  if (cards.length === 0) {
    preview.classList.add('hidden');
    return;
  }

  preview.classList.remove('hidden');
  const displayCards = cards.slice(0, 8);
  table.innerHTML = displayCards.map((c, i) =>
    `<div class="import-preview-row">
      <span class="import-preview-num">${i+1}</span>
      <span class="term">
        ${escapeHtml(c.term)}
        ${c.phonetic ? `<span class="word-row-phonetic">${escapeHtml(c.phonetic)}</span>` : ''}
        ${c.wordType ? `<span class="word-row-type-badge">${escapeHtml(c.wordType)}</span>` : ''}
      </span>
      <span class="def">${escapeHtml(c.def)}</span>
    </div>`
  ).join('') + (cards.length > 8 ? `<div style="padding:6px; font-size:0.78rem; color:var(--text-sub);">...và ${cards.length - 8} từ nữa</div>` : '');
}

window.openImportModal = function() {
  document.getElementById('importModal').classList.add('active');
  document.getElementById('import-text-area').value = '';
  document.getElementById('import-preview').classList.add('hidden');
  importedParsedCards = [];
};
window.closeImportModal = function() {
  document.getElementById('importModal').classList.remove('active');
};

document.getElementById('import-csv-btn')?.addEventListener('click', openImportModal);

document.getElementById('import-file-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  document.getElementById('import-text-area').value = text;
  importedParsedCards = parseImportText(text, getImportSeparator());
  renderImportPreview(importedParsedCards);
});

document.getElementById('import-preview-btn')?.addEventListener('click', () => {
  const text = document.getElementById('import-text-area').value;
  importedParsedCards = parseImportText(text, getImportSeparator());
  renderImportPreview(importedParsedCards);
  if (importedParsedCards.length > 0) {
    showToast(`📋 Tìm thấy ${importedParsedCards.length} từ vựng`, 'info');
  } else {
    showToast('❌ Không tìm thấy từ vựng hợp lệ. Kiểm tra định dạng!', 'error');
  }
});

document.getElementById('import-confirm-btn')?.addEventListener('click', () => {
  const text = document.getElementById('import-text-area').value;
  importedParsedCards = parseImportText(text, getImportSeparator());

  if (importedParsedCards.length === 0) {
    showToast('❌ Không có dữ liệu hợp lệ để nhập!', 'error');
    return;
  }

  // Xóa hàng trống đầu tiên nếu người dùng chưa nhập gì (trạng thái tạo mới)
  const existingRows = document.querySelectorAll('.editor-term-card');
  if (existingRows.length === 1) {
    const termVal = existingRows[0].querySelector('.row-term-input').value.trim();
    const defVal = existingRows[0].querySelector('.row-def-input').value.trim();
    const typeVal = existingRows[0].querySelector('.row-type-input')?.value.trim() || '';
    const hintVal = existingRows[0].querySelector('.row-hint-input')?.value.trim() || '';
    if (!termVal && !defVal && !typeVal && !hintVal) {
      existingRows[0].remove();
      editorRowsCount = 0;
    }
  }

  // Add to editor rows
  importedParsedCards.forEach(c => {
    addEditorCardRow(c.term, c.def, '', '', '', c.wordType, c.phonetic);
  });

  closeImportModal();
  showToast(`✅ Đã thêm ${importedParsedCards.length} thẻ từ vựng!`, 'success');

  // Scroll to end
  const rows = document.querySelectorAll('.editor-term-card');
  if (rows.length > 0) {
    rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

// ==========================================
// PHASE 2: EXPORT CSV
// ==========================================
window.exportCurrentSet = function() {
  if (!activeSetId || currentSetCards.length === 0) {
    showToast('❌ Không có dữ liệu để xuất!', 'error');
    return;
  }

  const lines = ['Từ vựng\tĐịnh nghĩa\tGợi ý\tEase Factor\tLần ôn\tNgày ôn tiếp'];
  currentSetCards.forEach(c => {
    lines.push([
      c.front_word || '',
      c.back_meaning || '',
      c.hint || '',
      c.ease_factor || 2.5,
      c.repetition || 0,
      c.next_review ? new Date(c.next_review).toLocaleDateString('vi-VN') : ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join('\t'));
  });

  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const setTitle = document.getElementById('set-title-input')?.value || 'flashcards';
  a.download = `${setTitle.replace(/[^a-zA-Z0-9_\- ]/g, '_')}_export.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`✅ Đã xuất ${currentSetCards.length} từ vựng!`, 'success');
};

document.getElementById('export-set-btn')?.addEventListener('click', () => {
  // Export current editor rows as CSV
  const rows = document.querySelectorAll('.editor-term-card');
  if (rows.length === 0) {
    showToast('❌ Chưa có từ vựng để xuất!', 'error');
    return;
  }

  const lines = ['Từ vựng\tĐịnh nghĩa\tGợi ý'];
  rows.forEach(row => {
    const term = row.querySelector('.row-term-input')?.value?.trim() || '';
    const def = row.querySelector('.row-def-input')?.value?.trim() || '';
    const hint = row.querySelector('.row-hint-input')?.value?.trim() || '';
    if (term || def) {
      lines.push([term, def, hint].map(v => `"${String(v).replace(/"/g, '""')}"`).join('\t'));
    }
  });

  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const setTitle = document.getElementById('set-title-input')?.value || 'flashcards';
  a.download = `${setTitle.replace(/[^a-zA-Z0-9_\- ]/g, '_')}_export.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`✅ Đã xuất ${rows.length} thẻ!`, 'success');
});

// ==========================================
// ADVANCED PREMIUM FEATURES (STAGE 2)
// ==========================================

// 1. Starred Cards Logic
window.toggleStarCard = async function(cardId, element = null) {
  let card = currentSetCards.find(c => c.id === cardId);
  if (!card) {
    card = smartReviewAllCards.find(c => c.id === cardId);
  }
  if (!card) return;

  const newStarred = !card.starred;
  card.starred = newStarred;

  await updateCardSRS(card.id, { starred: newStarred });

  if (element) {
    const icon = element.querySelector('i');
    if (newStarred) {
      element.classList.add('active');
      icon.className = 'fas fa-star';
    } else {
      element.classList.remove('active');
      icon.className = 'far fa-star';
    }
  }

  if (currentStudyCards[fcActiveIndex] && currentStudyCards[fcActiveIndex].id === cardId) {
    currentStudyCards[fcActiveIndex].starred = newStarred;
    updateActiveCardStarUI(newStarred);
  }

  const filterSelect = document.getElementById('terms-filter-select');
  if (filterSelect && filterSelect.value === 'starred') {
    filterAndRenderSetTerms();
  }

  showToast(newStarred ? '⭐ Đã đánh dấu thẻ!' : '☆ Đã bỏ đánh dấu!', 'success');
};

window.toggleActiveCardStar = async function() {
  if (fcActiveIndex >= currentStudyCards.length) return;
  const card = currentStudyCards[fcActiveIndex];
  const newStarred = !card.starred;
  card.starred = newStarred;

  await updateCardSRS(card.id, { starred: newStarred });

  const mainCard = currentSetCards.find(c => c.id === card.id);
  if (mainCard) mainCard.starred = newStarred;

  updateActiveCardStarUI(newStarred);
  showToast(newStarred ? '⭐ Đã đánh dấu thẻ!' : '☆ Đã bỏ đánh dấu!', 'success');
};

window.toggleListCardStar = async function(e, cardId) {
  await toggleStarCard(cardId, e.currentTarget);
};

function updateActiveCardStarUI(starred) {
  const btns = document.querySelectorAll('.card-star-btn');
  btns.forEach(btn => {
    const icon = btn.querySelector('i');
    if (starred) {
      btn.classList.add('active');
      icon.className = 'fas fa-star';
    } else {
      btn.classList.remove('active');
      icon.className = 'far fa-star';
    }
  });
}

// 2. Set Detail Search, Filter & Sort Logic
function filterAndRenderSetTerms() {
  const searchInput = document.getElementById('terms-search-input');
  const filterSelect = document.getElementById('terms-filter-select');
  const sortSelect = document.getElementById('terms-sort-select');
  
  if (!searchInput || !filterSelect || !sortSelect) return;
  
  const query = searchInput.value.trim().toLowerCase();
  const filterVal = filterSelect.value;
  const sortVal = sortSelect.value;
  const now = new Date();

  let filtered = currentSetCards.map((c, i) => ({ ...c, originalIdx: i }));

  if (query) {
    filtered = filtered.filter(c => 
      c.front_word.toLowerCase().includes(query) || 
      c.back_meaning.toLowerCase().includes(query)
    );
  }

  if (filterVal === 'starred') {
    filtered = filtered.filter(c => c.starred === true);
  } else if (filterVal === 'due') {
    filtered = filtered.filter(c => new Date(c.next_review || 0) <= now);
  } else if (filterVal === 'mastered') {
    filtered = filtered.filter(c => (c.repetition || 0) >= 3);
  } else if (filterVal === 'learning') {
    filtered = filtered.filter(c => (c.repetition || 0) > 0 && (c.repetition || 0) < 3);
  } else if (filterVal === 'new') {
    filtered = filtered.filter(c => !(c.repetition || 0));
  }

  if (sortVal === 'az') {
    filtered.sort((a, b) => a.front_word.localeCompare(b.front_word, 'vi', { sensitivity: 'base' }));
  } else if (sortVal === 'za') {
    filtered.sort((a, b) => b.front_word.localeCompare(a.front_word, 'vi', { sensitivity: 'base' }));
  } else if (sortVal === 'hardest') {
    filtered.sort((a, b) => (a.ease_factor || 2.5) - (b.ease_factor || 2.5));
  } else if (sortVal === 'easiest') {
    filtered.sort((a, b) => (b.ease_factor || 2.5) - (a.ease_factor || 2.5));
  } else if (sortVal === 'progress') {
    filtered.sort((a, b) => (b.repetition || 0) - (a.repetition || 0));
  }

  const container = document.getElementById('set-terms-list');
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 24px; font-style:italic; opacity:0.6; color:var(--text-sub);">Không tìm thấy từ vựng phù hợp.</div>`;
    return;
  }

  filtered.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'word-row-item';
    row.innerHTML = `
      <div class="word-row-index">${c.originalIdx + 1}</div>
      <div class="word-row-content" onclick="jumpToCardIndex(${c.originalIdx})">
        <div class="word-row-term">
          ${escapeHtml(c.front_word)}
          ${c.phonetic ? `<span class="word-row-phonetic">${escapeHtml(c.phonetic)}</span>` : ''}
          ${c.word_type ? `<span class="word-row-type-badge">${escapeHtml(c.word_type)}</span>` : ''}
        </div>
        <div class="word-row-divider"></div>
        <div class="word-row-def">${escapeHtml(c.back_meaning)}</div>
      </div>
      <div class="word-row-actions">
        <button class="word-row-star-btn ${c.starred ? 'active' : ''}" onclick="event.stopPropagation(); toggleListCardStar(event, '${c.id}')" title="Đánh dấu">
          <i class="${c.starred ? 'fas' : 'far'} fa-star"></i>
        </button>
        <button class="word-row-speak-btn" onclick="event.stopPropagation(); speakText('${c.front_word.replace(/'/g, "\\'")}', 'en-US')">
          <i class="fas fa-volume-up"></i>
        </button>
      </div>
    `;
    container.appendChild(row);
  });
}

// 3. Pomodoro Focus Timer Logic
let pomoInterval = null;
let pomoTimeRemaining = 25 * 60;
let pomoMode = 'work';
let pomoRunning = false;
let pomoTotalDuration = 25 * 60;

window.togglePomodoroWidget = function() {
  const widget = document.getElementById('pomodoroWidget');
  if (!widget) return;
  widget.classList.toggle('hidden');
  if (!widget.classList.contains('hidden')) {
    widget.classList.remove('minimized');
  }
};

window.minimizePomodoroWidget = function() {
  const widget = document.getElementById('pomodoroWidget');
  if (!widget) return;
  widget.classList.toggle('minimized');
  const icon = document.getElementById('pomodoroMinimizeBtn').querySelector('i');
  if (widget.classList.contains('minimized')) {
    icon.className = 'fas fa-plus';
  } else {
    icon.className = 'fas fa-minus';
  }
};

window.closePomodoroWidget = function() {
  stopPomodoro();
  const widget = document.getElementById('pomodoroWidget');
  if (widget) widget.classList.add('hidden');
};

function initPomodoro() {
  const pomoBtn = document.getElementById('pomodoroBtn');
  if (!pomoBtn) return;
  
  pomoBtn.addEventListener('click', togglePomodoroWidget);
  document.getElementById('pomodoroMinimizeBtn').addEventListener('click', minimizePomodoroWidget);
  document.getElementById('pomodoroCloseBtn').addEventListener('click', closePomodoroWidget);

  const startBtn = document.getElementById('pomodoroStartBtn');
  const resetBtn = document.getElementById('pomodoroResetBtn');

  startBtn.addEventListener('click', () => {
    if (pomoRunning) {
      pausePomodoro();
    } else {
      startPomodoro();
    }
  });

  resetBtn.addEventListener('click', resetPomodoro);

  document.querySelectorAll('.pomodoro-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pomodoro-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setPomodoroMode(btn.dataset.mode);
    });
  });

  updatePomodoroUI();
}

function setPomodoroMode(mode) {
  stopPomodoro();
  pomoMode = mode;
  pomoTotalDuration = pomoTimeRemaining = (mode === 'work' ? 25 : 5) * 60;
  document.getElementById('pomodoroStatus').innerText = mode === 'work' ? 'Học tập cao độ!' : 'Thư giãn chút nào!';
  updatePomodoroUI();
}

function startPomodoro() {
  if (pomoRunning) return;
  pomoRunning = true;
  document.getElementById('pomodoroStartBtn').innerHTML = '<i class="fas fa-pause"></i> Tạm dừng';
  document.getElementById('pomodoroStartBtn').className = 'btn-pomodoro-action pause';
  
  pomoInterval = setInterval(() => {
    pomoTimeRemaining--;
    if (pomoTimeRemaining <= 0) {
      playPomodoroAlarm();
      if (pomoMode === 'work') {
        showToast('🔔 Hết giờ tập trung! Hãy nghỉ ngơi 5 phút.', 'info');
        setPomodoroMode('break');
        startPomodoro();
      } else {
        showToast('🔔 Hết giờ nghỉ! Bắt đầu tập trung học tiếp nào.', 'success');
        setPomodoroMode('work');
      }
    }
    updatePomodoroUI();
  }, 1000);
}

function pausePomodoro() {
  pomoRunning = false;
  clearInterval(pomoInterval);
  document.getElementById('pomodoroStartBtn').innerHTML = '<i class="fas fa-play"></i> Bắt đầu';
  document.getElementById('pomodoroStartBtn').className = 'btn-pomodoro-action start';
}

function stopPomodoro() {
  pausePomodoro();
  pomoTimeRemaining = pomoTotalDuration;
  updatePomodoroUI();
}

function resetPomodoro() {
  stopPomodoro();
  showToast('🔄 Đồng hồ Pomodoro đã được đặt lại', 'info');
}

function updatePomodoroUI() {
  const min = Math.floor(pomoTimeRemaining / 60);
  const sec = pomoTimeRemaining % 60;
  document.getElementById('pomodoroTime').innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

  const ringFill = document.getElementById('pomodoro-ring-fill');
  if (ringFill) {
    const pct = pomoTimeRemaining / pomoTotalDuration;
    const circumference = 282.7;
    const offset = circumference * (1 - pct);
    ringFill.setAttribute('stroke-dashoffset', offset.toFixed(1));
    
    if (pomoMode === 'work') {
      ringFill.setAttribute('stroke', 'var(--primary)');
    } else {
      ringFill.setAttribute('stroke', 'var(--success)');
    }
  }
}

function playPomodoroAlarm() {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(pomoMode === 'work' ? 'Time is up. Take a break.' : 'Break is over. Get back to work.');
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch (e) {}
}

// ==========================================
// RESUME STUDY SESSION SYSTEM
// ==========================================
function saveResumeSession() {
  if (!activeSetId) return;
  const select = document.getElementById('studyMode');
  const mode = select ? select.value : 'flashcards';
  let index = 0;
  if (mode === 'flashcards') {
    index = fcActiveIndex;
  } else if (mode === 'quiz') {
    index = quizActiveIndex;
  } else if (mode === 'write') {
    index = typeof writeIndex !== 'undefined' ? writeIndex : 0;
  }
  
  const session = {
    setId: activeSetId,
    mode: mode,
    index: index,
    time: Date.now()
  };
  localStorage.setItem('tct_resume_session', JSON.stringify(session));
}

async function checkAndShowResumeBanner() {
  const sessionData = localStorage.getItem('tct_resume_session');
  const banner = document.getElementById('resume-session-banner');
  if (!sessionData || !banner) {
    if (banner) banner.classList.add('hidden');
    return;
  }

  try {
    const session = JSON.parse(sessionData);
    // Expiration: check if older than 24 hours (86400000 ms)
    if (Date.now() - session.time > 86400000) {
      localStorage.removeItem('tct_resume_session');
      banner.classList.add('hidden');
      return;
    }

    // Load set info to show the title
    const setObj = await getStudySetById(session.setId);
    if (!setObj) {
      localStorage.removeItem('tct_resume_session');
      banner.classList.add('hidden');
      return;
    }

    const modeLabels = {
      flashcards: 'Flashcard',
      quiz: 'Trắc nghiệm',
      write: 'Viết từ',
      match: 'Ghép thẻ'
    };

    document.getElementById('resume-set-name').innerText = setObj.title;
    document.getElementById('resume-mode-text').innerText = modeLabels[session.mode] || session.mode;
    document.getElementById('resume-card-index').innerText = (session.index + 1);
    banner.classList.remove('hidden');
  } catch(e) {
    console.error("Lỗi tải resume session:", e);
    banner.classList.add('hidden');
  }
}

window.resumeStudySession = async function() {
  const sessionData = localStorage.getItem('tct_resume_session');
  if (!sessionData) return;

  try {
    const session = JSON.parse(sessionData);
    const setObj = await getStudySetById(session.setId);
    if (!setObj) return;

    // Open set detail view
    activeFolderId = setObj.folder_id;
    await showSetDetailView(session.setId);

    // Switch mode
    selectStudyMode(session.mode);
    const select = document.getElementById('studyMode');
    if (select) select.value = session.mode;

    // Apply the saved index
    if (session.mode === 'flashcards') {
      fcActiveIndex = session.index;
      updateFCCard('none');
    } else if (session.mode === 'quiz') {
      quizActiveIndex = session.index;
      loadQuizQuestion();
    } else if (session.mode === 'write') {
      writeIndex = session.index;
      loadWriteQuestion();
    }

    // Hide banner
    document.getElementById('resume-session-banner')?.classList.add('hidden');
  } catch(e) {
    console.error("Lỗi khi khôi phục phiên học:", e);
  }
};

window.discardResumeSession = function() {
  localStorage.removeItem('tct_resume_session');
  document.getElementById('resume-session-banner')?.classList.add('hidden');
};

// ==========================================
// PHASE 3: GLOBAL START
// ==========================================
startApp();
loadTTSSettings();
initDailyGoalUI();

// Update home view stats after load
setTimeout(() => {
  const savedStreak = parseInt(localStorage.getItem(getUserKey(STREAK_KEY)) || '0');
  updateSidebarStreak(savedStreak);
}, 500);

// ==========================================
// AUDIO FEEDBACK & CONFETTI CELEBRATIONS
// ==========================================
let audioCtx = null;

function playAudioFeedback(type) {
  if (ttsSettings && ttsSettings.audioFeedback === false) return;
  
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const now = audioCtx.currentTime;
    
    if (type === 'flip') {
      // Short high-quality card lật wave
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);
      
      gainNode.gain.setValueAtTime(0.08, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start(now);
      osc.stop(now + 0.08);
    } 
    else if (type === 'success') {
      // Ting ting sound (C5 and E5 chime)
      const duration = 0.12;
      
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + duration);
      
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.08);
      gain2.gain.setValueAtTime(0.12, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08 + duration);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.08 + duration);
    } 
    else if (type === 'fail') {
      // Buzzer sound
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.22);
      
      gainNode.gain.setValueAtTime(0.06, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start(now);
      osc.stop(now + 0.22);
    } 
    else if (type === 'complete') {
      // Fanfare: C5 - E5 - G5 - C6
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const start = now + index * 0.08;
        const dur = 0.25;
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        
        gainNode.gain.setValueAtTime(0.1, start);
        gainNode.gain.exponentialRampToValueAtTime(0.001, start + dur);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(start);
        osc.stop(start + dur);
      });
    }
  } catch (err) {
    console.warn("Audio feedback error:", err);
  }
}

function triggerConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.zIndex = '99999';
  canvas.style.pointerEvents = 'none';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'];
  const particles = [];
  const particleCount = 120;

  for (let i = 0; i < particleCount; i++) {
    const isLeft = i < particleCount / 2;
    particles.push({
      x: isLeft ? 0 : width,
      y: height * 0.9,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      angle: isLeft ? (Math.random() * 45 - 25) * Math.PI / 180 : (Math.random() * 45 + 160) * Math.PI / 180,
      speed: Math.random() * 15 + 15,
      gravity: 0.45,
      rotation: Math.random() * 360,
      rotationSpeed: Math.random() * 10 - 5,
      opacity: 1,
      drag: 0.93
    });
  }

  const startTime = Date.now();
  const duration = 2500;

  function animate() {
    ctx.clearRect(0, 0, width, height);

    const elapsed = Date.now() - startTime;
    if (elapsed > duration) {
      if (canvas.parentNode) {
        document.body.removeChild(canvas);
      }
      return;
    }

    particles.forEach(p => {
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed + p.gravity;
      p.speed *= p.drag;
      p.gravity += 0.05;
      p.rotation += p.rotationSpeed;
      
      if (elapsed > duration * 0.6) {
        p.opacity = 1 - (elapsed - duration * 0.6) / (duration * 0.4);
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;
      
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
