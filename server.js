const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;
const dbPath = path.join(__dirname, 'database.json');

// Auto-backup on startup
try {
  const backupsDirInit = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupsDirInit)) {
    fs.mkdirSync(backupsDirInit, { recursive: true });
  }
  if (fs.existsSync(dbPath)) {
    const date = new Date();
    const formatDigit = (num) => String(num).padStart(2, '0');
    const tsInit = `${date.getFullYear()}${formatDigit(date.getMonth() + 1)}${formatDigit(date.getDate())}_${formatDigit(date.getHours())}${formatDigit(date.getMinutes())}${formatDigit(date.getSeconds())}`;
    const initBackupPath = path.join(backupsDirInit, `auto_${tsInit}.json`);
    fs.copyFileSync(dbPath, initBackupPath);
    console.log(`Auto-backup created: ${initBackupPath}`);
    
    // Keep only 7 most recent backups
    const allBk = fs.readdirSync(backupsDirInit)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, stat: fs.statSync(path.join(backupsDirInit, f)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    if (allBk.length > 7) {
      allBk.slice(7).forEach(f => {
        try { fs.unlinkSync(path.join(backupsDirInit, f.name)); } catch (e) {}
      });
    }
  }
} catch (e) {
  console.error("Auto-backup failed at startup:", e);
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Database Helpers
function readDb() {
  try {
    if (!fs.existsSync(dbPath)) {
      return { users: [], folders: [], sets: [], cards: [], study_log: [] };
    }
    const data = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(data);
    ['users', 'folders', 'sets', 'cards', 'study_log'].forEach(prop => {
      if (!db[prop]) db[prop] = [];
    });
    return db;
  } catch (e) {
    console.error('Error reading database:', e);
    return { users: [], folders: [], sets: [], cards: [], study_log: [] };
  }
}

function writeDb(db) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing database:', e);
  }
}

function makeBackup(prefix = 'backup') {
  const backupsDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const date = new Date();
  const formatDigit = (num) => String(num).padStart(2, '0');
  const ts = `${date.getFullYear()}${formatDigit(date.getMonth() + 1)}${formatDigit(date.getDate())}_${formatDigit(date.getHours())}${formatDigit(date.getMinutes())}${formatDigit(date.getSeconds())}`;
  const backupName = `${prefix}_${ts}.json`;
  const backupPath = path.join(backupsDir, backupName);
  
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
  }
  
  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, stat: fs.statSync(path.join(backupsDir, f)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    if (files.length > 7) {
      files.slice(7).forEach(f => {
        try { fs.unlinkSync(path.join(backupsDir, f.name)); } catch (e) {}
      });
    }
  } catch (e) {}
  return backupName;
}

// Password hashing
function getPasswordHash(password) {
  if (!password) return "";
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Token helper: base64(userId:role:ticks)
const EPOCH_TICKS = 621355968000000000n;

function jsMsToTicks(ms) {
  return BigInt(ms) * 10000n + EPOCH_TICKS;
}

function ticksToJsMs(ticksStr) {
  try {
    const ticks = BigInt(ticksStr);
    return Number((ticks - EPOCH_TICKS) / 10000n);
  } catch (e) {
    return 0;
  }
}

function generateToken(userId, role) {
  const ticks = jsMsToTicks(Date.now()).toString();
  const tokenStr = `${userId}:${role}:${ticks}`;
  return Buffer.from(tokenStr, 'utf8').toString('base64');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length === 3) {
      const userId = parts[0];
      const role = parts[1];
      const timestampStr = parts[2];
      
      let timestampMs = 0;
      if (timestampStr.length > 15) {
        timestampMs = ticksToJsMs(timestampStr);
      } else {
        timestampMs = parseInt(timestampStr, 10);
      }
      
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - timestampMs < sevenDaysMs) {
        return { userId, role };
      }
    }
  } catch (e) {}
  return null;
}

// Authentication Middleware
function authMiddleware(req, res, next) {
  // Bypass authentication for non-API requests (like static HTML, CSS, JS files)
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded) {
      const db = readDb();
      const user = db.users.find(u => u.id === decoded.userId);
      if (user) {
        req.currentUser = {
          id: user.id,
          role: user.role,
          username: user.username
        };
        return next();
      }
    }
  }
  
  // Bypass validation for public API endpoints
  const publicPaths = ['/api/status', '/api/auth/register', '/api/auth/login'];
  if (publicPaths.includes(req.path)) {
    return next();
  }
  
  return res.status(401).json({ error: 'Unauthorized' });
}

app.use(authMiddleware);

// Admin Middleware
function adminMiddleware(req, res, next) {
  if (req.currentUser && req.currentUser.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: "Access denied" });
}

// API Routes
// 0. Public Status Check
app.get('/api/status', (req, res) => {
  res.json({ status: "online" });
});

// 0.1 Register
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const cleanUsername = username.trim().toLowerCase();
  const db = readDb();
  if (db.users.some(u => u.username.toLowerCase() === cleanUsername)) {
    return res.status(400).json({ error: "Username already exists" });
  }
  const role = db.users.length === 0 ? "admin" : "user";
  const newUserId = "user_" + crypto.randomBytes(4).toString('hex');
  const newUser = {
    id: newUserId,
    username: cleanUsername,
    passwordHash: getPasswordHash(password),
    role,
    settings: { tts_enabled: true, tts_rate: 0.9, tts_voice: "en-US", auto_speak_on_flip: false, audio_feedback: true }
  };
  db.users.push(newUser);
  writeDb(db);
  res.status(201).json({ id: newUserId, username: cleanUsername, role });
});

// 0.2 Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const cleanUsername = username.trim().toLowerCase();
  const db = readDb();
  const foundUser = db.users.find(u => u.username.toLowerCase() === cleanUsername);
  if (!foundUser || getPasswordHash(password) !== foundUser.passwordHash) {
    return res.status(401).json({ error: "Incorrect username or password" });
  }
  const token = generateToken(foundUser.id, foundUser.role);
  res.status(200).json({
    token,
    user: {
      id: foundUser.id,
      username: foundUser.username,
      role: foundUser.role,
      avatarUrl: foundUser.avatarUrl
    }
  });
});

// 0.3 Admin endpoints
app.get('/api/admin/users', adminMiddleware, (req, res) => {
  const db = readDb();
  res.json(db.users.map(u => ({ id: u.id, username: u.username, role: u.role })));
});

app.put('/api/admin/users/:userId/role', adminMiddleware, (req, res) => {
  const { role } = req.body;
  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ error: "Invalid role" });
  }
  const db = readDb();
  const user = db.users.find(u => u.id === req.params.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  user.role = role;
  writeDb(db);
  res.json({ id: req.params.userId, role });
});

app.delete('/api/admin/users/:userId', adminMiddleware, (req, res) => {
  if (req.params.userId === req.currentUser.id) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  const db = readDb();
  db.users = db.users.filter(u => u.id !== req.params.userId);
  db.folders = db.folders.filter(f => f.user_id !== req.params.userId);
  db.sets = db.sets.filter(s => s.user_id !== req.params.userId);
  db.cards = db.cards.filter(c => c.user_id !== req.params.userId);
  db.study_log = db.study_log.filter(l => l.user_id !== req.params.userId);
  writeDb(db);
  res.json({ success: true });
});

app.get('/api/admin/stats', adminMiddleware, (req, res) => {
  const db = readDb();
  let dbSize = 0;
  if (fs.existsSync(dbPath)) {
    dbSize = fs.statSync(dbPath).size;
  }
  res.json({
    totalUsers: db.users.length,
    totalSets: db.sets.length,
    totalCards: db.cards.length,
    dbSize,
    uptimeSeconds: Math.round(process.uptime())
  });
});

// 0.4 Upload (authorized)
app.post('/api/upload', (req, res) => {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const { base64Data, filename } = req.body;
  if (!base64Data) {
    return res.status(400).json({ error: "No base64 data provided" });
  }
  let base64Str = base64Data;
  if (base64Str.startsWith('data:')) {
    base64Str = base64Str.split(';base64,')[1];
  }
  try {
    const bytes = Buffer.from(base64Str, 'base64');
    let ext = path.extname(filename || '');
    if (!ext) ext = '.png';
    const uniqueName = crypto.randomBytes(4).toString('hex') + "_" + new Date().toISOString().replace(/[-:T.Z]/g, '') + ext;
    const filePath = path.join(uploadsDir, uniqueName);
    fs.writeFileSync(filePath, bytes);
    res.json({ success: true, url: "/uploads/" + uniqueName });
  } catch (err) {
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

// 1. Folders
app.get('/api/folders', (req, res) => {
  const db = readDb();
  res.json(db.folders.filter(f => f.user_id === req.currentUser.id));
});

app.post('/api/folders', (req, res) => {
  const folder = req.body;
  const db = readDb();
  folder.id = "folder_" + crypto.randomBytes(4).toString('hex');
  folder.user_id = req.currentUser.id;
  db.folders.push(folder);
  writeDb(db);
  res.status(201).json(folder);
});

app.put('/api/folders/:folderId', (req, res) => {
  const db = readDb();
  const folder = db.folders.find(f => f.id === req.params.folderId);
  if (!folder) return res.status(404).json({ error: "Folder not found" });
  if (folder.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: "Access denied" });
  }
  folder.name = req.body.name;
  writeDb(db);
  res.json(folder);
});

app.delete('/api/folders/:folderId', (req, res) => {
  const db = readDb();
  const folder = db.folders.find(f => f.id === req.params.folderId);
  if (!folder) return res.status(404).json({ error: "Folder not found" });
  if (folder.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: "Access denied" });
  }
  db.folders = db.folders.filter(f => f.id !== req.params.folderId);
  const setsToDelete = db.sets.filter(s => s.folder_id === req.params.folderId && s.user_id === req.currentUser.id);
  db.sets = db.sets.filter(s => !(s.folder_id === req.params.folderId && s.user_id === req.currentUser.id));
  const setIds = setsToDelete.map(s => s.id);
  if (setIds.length > 0) {
    db.cards = db.cards.filter(c => !setIds.includes(c.set_id));
  }
  writeDb(db);
  res.json({ success: true });
});

// 2. Sets
app.get('/api/sets', (req, res) => {
  const { folderId } = req.query;
  const db = readDb();
  let userSets = db.sets.filter(s => s.user_id === req.currentUser.id);
  if (folderId) {
    userSets = userSets.filter(s => s.folder_id === folderId);
  }
  res.json(userSets);
});

app.post('/api/sets', (req, res) => {
  const newSet = req.body;
  const db = readDb();
  if (!newSet.id) {
    newSet.id = "set_" + crypto.randomBytes(4).toString('hex');
  }
  if (!newSet.user_id) {
    newSet.user_id = req.currentUser.id;
  }
  
  const existingSetIdx = db.sets.findIndex(s => s.id === newSet.id);
  if (existingSetIdx !== -1) {
    if (db.sets[existingSetIdx].user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }
    db.sets[existingSetIdx].title = newSet.title;
    db.sets[existingSetIdx].description = newSet.description;
    writeDb(db);
    res.json(db.sets[existingSetIdx]);
  } else {
    db.sets.push(newSet);
    writeDb(db);
    res.json(newSet);
  }
});

app.get('/api/sets/:setId', (req, res) => {
  const db = readDb();
  const set = db.sets.find(s => s.id === req.params.setId);
  if (!set) return res.status(404).json({ error: "Set not found" });
  if (set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: "Access denied" });
  }
  res.json(set);
});

app.delete('/api/sets/:setId', (req, res) => {
  const db = readDb();
  const set = db.sets.find(s => s.id === req.params.setId);
  if (!set) return res.status(404).json({ error: "Set not found" });
  if (set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: "Access denied" });
  }
  db.sets = db.sets.filter(s => s.id !== req.params.setId);
  db.cards = db.cards.filter(c => c.set_id !== req.params.setId);
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/sets/:setId/highscore', (req, res) => {
  const { score } = req.body;
  const db = readDb();
  const set = db.sets.find(s => s.id === req.params.setId);
  if (!set) return res.status(404).json({ error: "Set not found" });
  if (set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: "Access denied" });
  }
  if (set.highscore === undefined || set.highscore === null || score < set.highscore) {
    set.highscore = score;
    writeDb(db);
  }
  res.json(set);
});

// 3. Cards
app.get('/api/cards', (req, res) => {
  const { setId } = req.query;
  const db = readDb();
  const userSets = db.sets.filter(s => s.user_id === req.currentUser.id);
  const userSetIds = userSets.map(s => s.id);
  let userCards = db.cards.filter(c => userSetIds.includes(c.set_id));
  if (setId) {
    userCards = userCards.filter(c => c.set_id === setId);
  }
  res.json(userCards);
});

app.post('/api/sets/:setId/cards', (req, res) => {
  const db = readDb();
  const set = db.sets.find(s => s.id === req.params.setId);
  if (!set) return res.status(404).json({ error: "Set not found" });
  if (set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: "Access denied" });
  }
  
  const cardsList = req.body.cards || [];
  db.cards = db.cards.filter(c => c.set_id !== req.params.setId);
  cardsList.forEach(c => {
    if (!c.id) {
      c.id = "card_" + crypto.randomBytes(4).toString('hex') + crypto.randomBytes(2).toString('hex');
    }
    if (!c.user_id) c.user_id = req.currentUser.id;
    if (!c.set_id) c.set_id = req.params.setId;
    db.cards.push(c);
  });
  writeDb(db);
  res.json({ success: true, count: cardsList.length });
});

app.patch('/api/cards/:cardId', (req, res) => {
  const db = readDb();
  const card = db.cards.find(c => c.id === req.params.cardId);
  if (!card) return res.status(404).json({ error: "Card not found" });
  
  const set = db.sets.find(s => s.id === card.set_id);
  if (set && set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: "Access denied" });
  }
  
  const fields = req.body;
  Object.keys(fields).forEach(key => {
    card[key] = fields[key];
  });
  writeDb(db);
  res.json(card);
});

app.put('/api/cards/:cardId', (req, res) => {
  const db = readDb();
  const card = db.cards.find(c => c.id === req.params.cardId);
  if (!card) return res.status(404).json({ error: "Card not found" });
  
  const set = db.sets.find(s => s.id === card.set_id);
  if (set && set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: "Access denied" });
  }
  
  const fields = req.body;
  Object.keys(fields).forEach(key => {
    card[key] = fields[key];
  });
  writeDb(db);
  res.json(card);
});

// 4. Study Log
app.get('/api/study-log', (req, res) => {
  const db = readDb();
  res.json(db.study_log.filter(l => l.user_id === req.currentUser.id));
});

app.post('/api/study-log', (req, res) => {
  const entry = req.body;
  const db = readDb();
  entry.id = "log_" + crypto.randomBytes(4).toString('hex');
  entry.user_id = req.currentUser.id;
  db.study_log.push(entry);
  
  // Keep only last 5000 logs for the user to prevent bloat
  const userLogs = db.study_log.filter(l => l.user_id === req.currentUser.id);
  if (userLogs.length > 5000) {
    const logsToKeep = userLogs.slice(userLogs.length - 5000);
    db.study_log = db.study_log.filter(l => l.user_id !== req.currentUser.id).concat(logsToKeep);
  }
  writeDb(db);
  res.status(201).json({ success: true });
});

// 4.5 User Profile Update
app.put('/api/user/profile', (req, res) => {
  const reqData = req.body;
  const db = readDb();
  const user = db.users.find(u => u.id === req.currentUser.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  
  // 1. Update username
  if (reqData.username) {
    const cleanUsername = reqData.username.trim().toLowerCase();
    if (cleanUsername !== user.username) {
      if (db.users.some(u => u.username.toLowerCase() === cleanUsername)) {
        return res.status(400).json({ error: "Username already exists" });
      }
      user.username = cleanUsername;
    }
  }
  // 2. Update avatarUrl
  if (reqData.avatarUrl !== undefined) {
    user.avatarUrl = reqData.avatarUrl;
  }
  // 3. Update password
  if (reqData.newPassword) {
    if (!reqData.currentPassword) {
      return res.status(400).json({ error: "Current password is required to change password" });
    }
    const currentHash = getPasswordHash(reqData.currentPassword);
    if (currentHash !== user.passwordHash) {
      return res.status(400).json({ error: "Incorrect current password" });
    }
    user.passwordHash = getPasswordHash(reqData.newPassword);
  }
  writeDb(db);
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl
    }
  });
});

// 5. Settings
app.get('/api/settings', (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.currentUser.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.settings) {
    user.settings = { tts_enabled: true, tts_rate: 0.9, tts_voice: "en-US", auto_speak_on_flip: false, audio_feedback: true };
    writeDb(db);
  }
  res.json(user.settings);
});

app.put('/api/settings', (req, res) => {
  const newSettings = req.body;
  const db = readDb();
  const user = db.users.find(u => u.id === req.currentUser.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.settings) user.settings = {};
  Object.keys(newSettings).forEach(key => {
    user.settings[key] = newSettings[key];
  });
  writeDb(db);
  res.json(user.settings);
});

app.post('/api/settings', (req, res) => {
  const newSettings = req.body;
  const db = readDb();
  const user = db.users.find(u => u.id === req.currentUser.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.settings) user.settings = {};
  Object.keys(newSettings).forEach(key => {
    user.settings[key] = newSettings[key];
  });
  writeDb(db);
  res.json(user.settings);
});

// 6. Backups
app.get('/api/backups', (req, res) => {
  const backupsDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(backupsDir, f);
        const stat = fs.statSync(filePath);
        const dateStr = stat.mtime.toISOString().split('.')[0];
        return { filename: f, size: stat.size, date: dateStr };
      })
      .sort((a, b) => b.filename.localeCompare(a.filename))
      .slice(0, 10);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups', (req, res) => {
  try {
    const backupName = makeBackup('backup');
    res.status(201).json({ success: true, filename: backupName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restore/:backupFileName', (req, res) => {
  const backupFileName = req.params.backupFileName;
  const backupsDir = path.join(__dirname, 'backups');
  const backupPath = path.join(backupsDir, backupFileName);
  if (fs.existsSync(backupPath)) {
    makeBackup('pre_restore');
    fs.copyFileSync(backupPath, dbPath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Backup file not found" });
  }
});

// 7. Sync
app.post('/api/sync', (req, res) => {
  try {
    makeBackup('pre_sync');
    const syncData = req.body;
    const db = readDb();
    
    db.folders = db.folders.filter(f => f.user_id !== req.currentUser.id);
    db.sets = db.sets.filter(s => s.user_id !== req.currentUser.id);
    db.cards = db.cards.filter(c => c.user_id !== req.currentUser.id);
    db.study_log = db.study_log.filter(l => l.user_id !== req.currentUser.id);
    
    if (Array.isArray(syncData.folders)) {
      syncData.folders.forEach(f => {
        f.user_id = req.currentUser.id;
        db.folders.push(f);
      });
    }
    if (Array.isArray(syncData.sets)) {
      syncData.sets.forEach(s => {
        s.user_id = req.currentUser.id;
        db.sets.push(s);
      });
    }
    if (Array.isArray(syncData.cards)) {
      syncData.cards.forEach(c => {
        c.user_id = req.currentUser.id;
        db.cards.push(c);
      });
    }
    if (Array.isArray(syncData.study_log)) {
      syncData.study_log.forEach(l => {
        l.user_id = req.currentUser.id;
        db.study_log.push(l);
      });
    }
    
    writeDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Sync failed: " + err.message });
  }
});

// Static files serving
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Node.js Express Server listening on http://localhost:${PORT}`);
});
