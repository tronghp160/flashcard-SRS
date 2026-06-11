const mongoose = require('mongoose');

// User Schema
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  avatarUrl: { type: String, default: '' },
  settings: {
    tts_enabled: { type: Boolean, default: true },
    tts_rate: { type: Number, default: 0.9 },
    tts_voice: { type: String, default: 'en-US' },
    auto_speak_on_flip: { type: Boolean, default: false },
    audio_feedback: { type: Boolean, default: true }
  }
}, { timestamps: true });

// Folder Schema
const FolderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  user_id: { type: String, required: true, index: true }
}, { timestamps: true });

// Set Schema
const SetSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  user_id: { type: String, required: true, index: true },
  folder_id: { type: String, default: null, index: true },
  highscore: { type: Number, default: null }
}, { timestamps: true });

// Card Schema
const CardSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  set_id: { type: String, required: true, index: true },
  user_id: { type: String, required: true, index: true },
  front_word: { type: String, required: true },
  back_meaning: { type: String, required: true },
  hint: { type: String, default: '' },
  word_type: { type: String, default: '' },
  phonetic: { type: String, default: '' },
  existing_image_url: { type: String, default: '' },
  interval: { type: Number, default: 0 },
  repetition: { type: Number, default: 0 },
  ease_factor: { type: Number, default: 2.5 },
  next_review: { type: String, required: true } // Matches client-side ISO date string format
}, { timestamps: true });

// Study Log Schema
const StudyLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  cardId: { type: String, required: true, index: true },
  user_id: { type: String, required: true, index: true },
  rating: { type: Number, required: true },
  timeTaken: { type: Number, default: 0 },
  date: { type: String, required: true, index: true } // Format: YYYY-MM-DD
}, { timestamps: true });

// Compile Models
const User = mongoose.model('User', UserSchema);
const Folder = mongoose.model('Folder', FolderSchema);
const Set = mongoose.model('Set', SetSchema);
const Card = mongoose.model('Card', CardSchema);
const StudyLog = mongoose.model('StudyLog', StudyLogSchema);

module.exports = {
  User,
  Folder,
  Set,
  Card,
  StudyLog
};
