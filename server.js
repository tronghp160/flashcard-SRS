require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { User, Folder, Set, Card, StudyLog } = require('./models');

const app = express();
const PORT = process.env.PORT || 8080;
const dbPath = path.join(__dirname, 'database.json');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flashcard_srs';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch(err => console.error('MongoDB connection error:', err));

// Auto-backup database.json if it exists on startup (legacy safeguard)
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

// MongoDB Backup and Restore Helpers
async function exportMongoToObj() {
  const users = await User.find({}).lean();
  const folders = await Folder.find({}).lean();
  const sets = await Set.find({}).lean();
  const cards = await Card.find({}).lean();
  const study_log = await StudyLog.find({}).lean();
  return { users, folders, sets, cards, study_log };
}

async function importObjToMongo(dbObj) {
  await User.deleteMany({});
  await Folder.deleteMany({});
  await Set.deleteMany({});
  await Card.deleteMany({});
  await StudyLog.deleteMany({});

  if (Array.isArray(dbObj.users) && dbObj.users.length > 0) await User.insertMany(dbObj.users);
  if (Array.isArray(dbObj.folders) && dbObj.folders.length > 0) await Folder.insertMany(dbObj.folders);
  if (Array.isArray(dbObj.sets) && dbObj.sets.length > 0) await Set.insertMany(dbObj.sets);
  if (Array.isArray(dbObj.cards) && dbObj.cards.length > 0) await Card.insertMany(dbObj.cards);
  if (Array.isArray(dbObj.study_log) && dbObj.study_log.length > 0) await StudyLog.insertMany(dbObj.study_log);
}

async function makeBackup(prefix = 'backup') {
  const backupsDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const date = new Date();
  const formatDigit = (num) => String(num).padStart(2, '0');
  const ts = `${date.getFullYear()}${formatDigit(date.getMonth() + 1)}${formatDigit(date.getDate())}_${formatDigit(date.getHours())}${formatDigit(date.getMinutes())}${formatDigit(date.getSeconds())}`;
  const backupName = `${prefix}_${ts}.json`;
  const backupPath = path.join(backupsDir, backupName);
  
  try {
    const dbData = await exportMongoToObj();
    fs.writeFileSync(backupPath, JSON.stringify(dbData, null, 2), 'utf8');
  } catch (e) {
    console.error('Error creating backup:', e);
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
async function authMiddleware(req, res, next) {
  // Bypass authentication for non-API requests (like static HTML, CSS, JS files)
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded) {
      try {
        const user = await User.findOne({ id: decoded.userId });
        if (user) {
          req.currentUser = {
            id: user.id,
            role: user.role,
            username: user.username
          };
          return next();
        }
      } catch (e) {
        console.error("Error in authMiddleware user lookup:", e);
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
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const cleanUsername = username.trim().toLowerCase();
  try {
    const userExists = await User.findOne({ username: cleanUsername });
    if (userExists) {
      return res.status(400).json({ error: "Username already exists" });
    }
    const count = await User.countDocuments({});
    const role = count === 0 ? "admin" : "user";
    const newUserId = "user_" + crypto.randomBytes(4).toString('hex');
    const newUser = new User({
      id: newUserId,
      username: cleanUsername,
      passwordHash: getPasswordHash(password),
      role,
      settings: { tts_enabled: true, tts_rate: 0.9, tts_voice: "en-US", auto_speak_on_flip: false, audio_feedback: true }
    });
    await newUser.save();
    res.status(201).json({ id: newUserId, username: cleanUsername, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 0.2 Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const cleanUsername = username.trim().toLowerCase();
  try {
    const foundUser = await User.findOne({ username: cleanUsername });
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 0.3 Admin endpoints
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, 'id username role');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:userId/role', adminMiddleware, async (req, res) => {
  const { role } = req.body;
  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ error: "Invalid role" });
  }
  try {
    const user = await User.findOneAndUpdate({ id: req.params.userId }, { role }, { new: true });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ id: req.params.userId, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:userId', adminMiddleware, async (req, res) => {
  if (req.params.userId === req.currentUser.id) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  try {
    await User.deleteOne({ id: req.params.userId });
    await Folder.deleteMany({ user_id: req.params.userId });
    await Set.deleteMany({ user_id: req.params.userId });
    await Card.deleteMany({ user_id: req.params.userId });
    await StudyLog.deleteMany({ user_id: req.params.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    const totalSets = await Set.countDocuments({});
    const totalCards = await Card.countDocuments({});
    let dbSize = 0;
    try {
      const stats = await mongoose.connection.db.stats();
      dbSize = stats.dataSize || stats.storageSize || 0;
    } catch (e) {
      if (fs.existsSync(dbPath)) {
        dbSize = fs.statSync(dbPath).size;
      }
    }
    res.json({
      totalUsers,
      totalSets,
      totalCards,
      dbSize,
      uptimeSeconds: Math.round(process.uptime())
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
app.get('/api/folders', async (req, res) => {
  try {
    const folders = await Folder.find({ user_id: req.currentUser.id });
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/folders', async (req, res) => {
  const folder = req.body;
  folder.id = "folder_" + crypto.randomBytes(4).toString('hex');
  folder.user_id = req.currentUser.id;
  try {
    const newFolder = new Folder(folder);
    await newFolder.save();
    res.status(201).json(newFolder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/folders/:folderId', async (req, res) => {
  try {
    const folder = await Folder.findOne({ id: req.params.folderId });
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    if (folder.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }
    folder.name = req.body.name;
    await folder.save();
    res.json(folder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/folders/:folderId', async (req, res) => {
  try {
    const folder = await Folder.findOne({ id: req.params.folderId });
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    if (folder.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }
    await Folder.deleteOne({ id: req.params.folderId });
    const setsToDelete = await Set.find({ folder_id: req.params.folderId, user_id: req.currentUser.id });
    const setIds = setsToDelete.map(s => s.id);
    await Set.deleteMany({ folder_id: req.params.folderId, user_id: req.currentUser.id });
    if (setIds.length > 0) {
      await Card.deleteMany({ set_id: { $in: setIds } });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Sets
app.get('/api/sets', async (req, res) => {
  const { folderId } = req.query;
  try {
    const query = { user_id: req.currentUser.id };
    if (folderId) {
      query.folder_id = folderId;
    }
    const sets = await Set.find(query);
    res.json(sets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sets', async (req, res) => {
  const newSet = req.body;
  if (!newSet.id) {
    newSet.id = "set_" + crypto.randomBytes(4).toString('hex');
  }
  if (!newSet.user_id) {
    newSet.user_id = req.currentUser.id;
  }
  
  try {
    const existingSet = await Set.findOne({ id: newSet.id });
    if (existingSet) {
      if (existingSet.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
        return res.status(403).json({ error: "Access denied" });
      }
      existingSet.title = newSet.title;
      existingSet.description = newSet.description;
      if (newSet.folder_id !== undefined) {
        existingSet.folder_id = newSet.folder_id;
      }
      await existingSet.save();
      res.json(existingSet);
    } else {
      const setDoc = new Set(newSet);
      await setDoc.save();
      res.json(setDoc);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sets/:setId', async (req, res) => {
  try {
    const set = await Set.findOne({ id: req.params.setId });
    if (!set) return res.status(404).json({ error: "Set not found" });
    if (set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sets/:setId', async (req, res) => {
  try {
    const set = await Set.findOne({ id: req.params.setId });
    if (!set) return res.status(404).json({ error: "Set not found" });
    if (set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }
    await Set.deleteOne({ id: req.params.setId });
    await Card.deleteMany({ set_id: req.params.setId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sets/:setId/highscore', async (req, res) => {
  const { score } = req.body;
  try {
    const set = await Set.findOne({ id: req.params.setId });
    if (!set) return res.status(404).json({ error: "Set not found" });
    if (set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }
    if (set.highscore === undefined || set.highscore === null || score < set.highscore) {
      set.highscore = score;
      await set.save();
    }
    res.json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Cards
app.get('/api/cards', async (req, res) => {
  const { setId } = req.query;
  try {
    const userSets = await Set.find({ user_id: req.currentUser.id });
    const userSetIds = userSets.map(s => s.id);
    const query = { set_id: { $in: userSetIds } };
    if (setId) {
      query.set_id = setId;
    }
    const cards = await Card.find(query);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sets/:setId/cards', async (req, res) => {
  try {
    const set = await Set.findOne({ id: req.params.setId });
    if (!set) return res.status(404).json({ error: "Set not found" });
    if (set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const cardsList = req.body.cards || [];
    await Card.deleteMany({ set_id: req.params.setId });
    const processedCards = cardsList.map(c => {
      if (!c.id) {
        c.id = "card_" + crypto.randomBytes(4).toString('hex') + crypto.randomBytes(2).toString('hex');
      }
      c.user_id = req.currentUser.id;
      c.set_id = req.params.setId;
      return c;
    });
    if (processedCards.length > 0) {
      await Card.insertMany(processedCards);
    }
    res.json({ success: true, count: processedCards.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/cards/:cardId', async (req, res) => {
  try {
    const card = await Card.findOne({ id: req.params.cardId });
    if (!card) return res.status(404).json({ error: "Card not found" });
    
    const set = await Set.findOne({ id: card.set_id });
    if (set && set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const fields = req.body;
    Object.keys(fields).forEach(key => {
      card[key] = fields[key];
    });
    await card.save();
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cards/:cardId', async (req, res) => {
  try {
    const card = await Card.findOne({ id: req.params.cardId });
    if (!card) return res.status(404).json({ error: "Card not found" });
    
    const set = await Set.findOne({ id: card.set_id });
    if (set && set.user_id !== req.currentUser.id && req.currentUser.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const fields = req.body;
    Object.keys(fields).forEach(key => {
      card[key] = fields[key];
    });
    await card.save();
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Study Log
app.get('/api/study-log', async (req, res) => {
  try {
    const logs = await StudyLog.find({ user_id: req.currentUser.id });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/study-log', async (req, res) => {
  const entry = req.body;
  entry.id = "log_" + crypto.randomBytes(4).toString('hex');
  entry.user_id = req.currentUser.id;
  try {
    const logDoc = new StudyLog(entry);
    await logDoc.save();
    
    // Keep only last 5000 logs for the user to prevent bloat
    const count = await StudyLog.countDocuments({ user_id: req.currentUser.id });
    if (count > 5000) {
      const oldestLogs = await StudyLog.find({ user_id: req.currentUser.id })
        .sort({ createdAt: 1 })
        .limit(count - 5000);
      const oldestIds = oldestLogs.map(l => l._id);
      await StudyLog.deleteMany({ _id: { $in: oldestIds } });
    }
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4.5 User Profile Update
app.put('/api/user/profile', async (req, res) => {
  const reqData = req.body;
  try {
    const user = await User.findOne({ id: req.currentUser.id });
    if (!user) return res.status(404).json({ error: "User not found" });
    
    // 1. Update username
    if (reqData.username) {
      const cleanUsername = reqData.username.trim().toLowerCase();
      if (cleanUsername !== user.username) {
        const exists = await User.findOne({ username: cleanUsername });
        if (exists) {
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
    await user.save();
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Settings
app.get('/api/settings', async (req, res) => {
  try {
    const user = await User.findOne({ id: req.currentUser.id });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.settings) {
      user.settings = { tts_enabled: true, tts_rate: 0.9, tts_voice: "en-US", auto_speak_on_flip: false, audio_feedback: true };
      await user.save();
    }
    res.json(user.settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const handleSettingsUpdate = async (req, res) => {
  const newSettings = req.body;
  try {
    const user = await User.findOne({ id: req.currentUser.id });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.settings) user.settings = {};
    Object.keys(newSettings).forEach(key => {
      user.settings[key] = newSettings[key];
    });
    user.markModified('settings');
    await user.save();
    res.json(user.settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.put('/api/settings', handleSettingsUpdate);
app.post('/api/settings', handleSettingsUpdate);

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

app.post('/api/backups', async (req, res) => {
  try {
    const backupName = await makeBackup('backup');
    res.status(201).json({ success: true, filename: backupName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restore/:backupFileName', async (req, res) => {
  const backupFileName = req.params.backupFileName;
  const backupsDir = path.join(__dirname, 'backups');
  const backupPath = path.join(backupsDir, backupFileName);
  if (fs.existsSync(backupPath)) {
    try {
      await makeBackup('pre_restore');
      const dataStr = fs.readFileSync(backupPath, 'utf8');
      const dataObj = JSON.parse(dataStr);
      await importObjToMongo(dataObj);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Restore failed: " + err.message });
    }
  } else {
    res.status(404).json({ error: "Backup file not found" });
  }
});

// 7. Sync
app.post('/api/sync', async (req, res) => {
  try {
    await makeBackup('pre_sync');
    const syncData = req.body;
    
    // Clear user's existing records
    await Folder.deleteMany({ user_id: req.currentUser.id });
    await Set.deleteMany({ user_id: req.currentUser.id });
    await Card.deleteMany({ user_id: req.currentUser.id });
    await StudyLog.deleteMany({ user_id: req.currentUser.id });
    
    if (Array.isArray(syncData.folders)) {
      const folders = syncData.folders.map(f => {
        f.user_id = req.currentUser.id;
        return f;
      });
      if (folders.length > 0) await Folder.insertMany(folders);
    }
    if (Array.isArray(syncData.sets)) {
      const sets = syncData.sets.map(s => {
        s.user_id = req.currentUser.id;
        return s;
      });
      if (sets.length > 0) await Set.insertMany(sets);
    }
    if (Array.isArray(syncData.cards)) {
      const cards = syncData.cards.map(c => {
        c.user_id = req.currentUser.id;
        return c;
      });
      if (cards.length > 0) await Card.insertMany(cards);
    }
    if (Array.isArray(syncData.study_log)) {
      const study_log = syncData.study_log.map(l => {
        l.user_id = req.currentUser.id;
        return l;
      });
      if (study_log.length > 0) await StudyLog.insertMany(study_log);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Sync failed: " + err.message });
  }
});

// 8. Image Suggestions API
app.get('/api/suggest-images', async (req, res) => {
  const { keyword, meaning, wordType } = req.query;
  if (!keyword) {
    return res.status(400).json({ error: "Keyword is required" });
  }

  const pixabayKey = process.env.PIXABAY_API_KEY;
  const unsplashKey = process.env.UNSPLASH_API_KEY;

  if (!pixabayKey && !unsplashKey) {
    return res.json([]);
  }

  const searchQueries = [keyword.toLowerCase().trim()];
  if (meaning) {
    const cleanMeaning = meaning.toLowerCase().trim();
    if (cleanMeaning !== searchQueries[0]) {
      searchQueries.push(cleanMeaning);
    }
  }

  const imageUrls = [];

  try {
    const apiTasks = [];

    if (pixabayKey) {
      searchQueries.forEach(query => {
        const url = `https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=15&safesearch=true`;
        apiTasks.push(
          fetch(url)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data && Array.isArray(data.hits)) {
                data.hits.forEach(hit => {
                  if (hit.webformatURL) imageUrls.push(hit.webformatURL);
                });
              }
            })
            .catch(err => console.error("Pixabay query error:", err.message))
        );
      });
    }

    if (unsplashKey) {
      searchQueries.forEach(query => {
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=15&client_id=${unsplashKey}`;
        apiTasks.push(
          fetch(url)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data && Array.isArray(data.results)) {
                data.results.forEach(item => {
                  if (item.urls?.small) imageUrls.push(item.urls.small);
                });
              }
            })
            .catch(err => console.error("Unsplash query error:", err.message))
        );
      });
    }

    await Promise.allSettled(apiTasks);

    const uniqueUrls = [...new Set(imageUrls)].slice(0, 24);
    res.json(uniqueUrls);
  } catch (err) {
    res.status(500).json({ error: "Failed to suggest images: " + err.message });
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
