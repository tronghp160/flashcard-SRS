require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { User, Folder, Set, Card, StudyLog } = require('./models');

const dbPath = path.join(__dirname, 'database.json');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flashcard_srs';

async function migrate() {
  console.log('=== BẮT ĐẦU CHUYỂN ĐỔI DỮ LIỆU SANG MONGODB ===');
  
  // 1. Kiểm tra file database.json
  if (!fs.existsSync(dbPath)) {
    console.error(`Lỗi: Không tìm thấy file dữ liệu cục bộ tại: ${dbPath}`);
    console.log('Không có dữ liệu nào để di chuyển.');
    process.exit(1);
  }

  let dbData;
  try {
    const rawData = fs.readFileSync(dbPath, 'utf8');
    dbData = JSON.parse(rawData);
  } catch (err) {
    console.error('Lỗi khi đọc hoặc phân tích cú pháp database.json:', err.message);
    process.exit(1);
  }

  // 2. Kết nối tới MongoDB
  console.log(`Đang kết nối tới MongoDB: ${MONGODB_URI}...`);
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Kết nối MongoDB thành công.');
  } catch (err) {
    console.error('Không thể kết nối tới MongoDB:', err.message);
    console.log('Vui lòng kiểm tra lại cấu hình MONGODB_URI trong tệp .env');
    process.exit(1);
  }

  try {
    // 3. Xóa dữ liệu cũ trên MongoDB để tránh trùng lặp
    console.log('Đang dọn dẹp dữ liệu cũ trên MongoDB...');
    await User.deleteMany({});
    await Folder.deleteMany({});
    await Set.deleteMany({});
    await Card.deleteMany({});
    await StudyLog.deleteMany({});
    console.log('Đã dọn dẹp các bộ sưu tập (collections).');

    // 4. Nhập dữ liệu mới
    // 4.1 Users
    let userCount = 0;
    if (Array.isArray(dbData.users) && dbData.users.length > 0) {
      console.log(`Đang nhập ${dbData.users.length} tài khoản người dùng...`);
      await User.insertMany(dbData.users);
      userCount = dbData.users.length;
    }

    // 4.2 Folders
    let folderCount = 0;
    if (Array.isArray(dbData.folders) && dbData.folders.length > 0) {
      console.log(`Đang nhập ${dbData.folders.length} thư mục...`);
      await Folder.insertMany(dbData.folders);
      folderCount = dbData.folders.length;
    }

    // 4.3 Sets
    let setCount = 0;
    if (Array.isArray(dbData.sets) && dbData.sets.length > 0) {
      console.log(`Đang nhập ${dbData.sets.length} bộ thẻ ghi nhớ...`);
      await Set.insertMany(dbData.sets);
      setCount = dbData.sets.length;
    }

    // 4.4 Cards
    let cardCount = 0;
    if (Array.isArray(dbData.cards) && dbData.cards.length > 0) {
      console.log(`Đang nhập ${dbData.cards.length} thẻ ghi nhớ...`);
      await Card.insertMany(dbData.cards);
      cardCount = dbData.cards.length;
    }

    // 4.5 Study Logs
    let logCount = 0;
    if (Array.isArray(dbData.study_log) && dbData.study_log.length > 0) {
      console.log(`Đang nhập ${dbData.study_log.length} bản ghi lịch sử học...`);
      await StudyLog.insertMany(dbData.study_log);
      logCount = dbData.study_log.length;
    }

    console.log('\n=== KẾT QUẢ CHUYỂN ĐỔI (MIGRATION STATS) ===');
    console.log(`- Tài khoản người dùng (Users): ${userCount}`);
    console.log(`- Thư mục (Folders): ${folderCount}`);
    console.log(`- Bộ thẻ ghi nhớ (Sets): ${setCount}`);
    console.log(`- Thẻ ghi nhớ (Cards): ${cardCount}`);
    console.log(`- Nhật ký học tập (Study Logs): ${logCount}`);
    console.log('==========================================');
    console.log('Chuyển đổi dữ liệu hoàn tất thành công!');

  } catch (err) {
    console.error('Đã xảy ra lỗi trong quá trình di chuyển dữ liệu:', err.message);
  } finally {
    // 5. Đóng kết nối
    await mongoose.connection.close();
    console.log('Đã ngắt kết nối với MongoDB.');
    process.exit(0);
  }
}

migrate();
