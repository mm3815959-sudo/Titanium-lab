const { Pool } = require('pg');
require('dotenv').config();

// الاتصال بقاعدة البيانات السحابية عبر المتغير السري
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // مطلوبة للاتصال الآمن بقواعد البيانات السحابية في Replit
  }
});

const createTables = async () => {
  const queryText = 
    -- 1. جدول المستخدمين (تسجيل الدخول الآمن للـ Admin)
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role VARCHAR(20) DEFAULT 'admin'
    );

    -- 2. جدول الأطباء
    CREATE TABLE IF NOT EXISTS doctors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      phone VARCHAR(20)
    );

    -- 3. جدول الحالات (الطلبات)
    CREATE TABLE IF NOT EXISTS cases (
      id SERIAL PRIMARY KEY,
      case_number VARCHAR(50) UNIQUE NOT NULL,
      doctor_id INT REFERENCES doctors(id) ON DELETE RESTRICT,
      patient_name VARCHAR(100) NOT NULL,
      work_type VARCHAR(50) NOT NULL,
      units INT NOT NULL CHECK (units > 0),
      pricing_type VARCHAR(20) NOT NULL, -- 'unit' (سعر الوحدة) أو 'full' (السعر الكامل)
      price_per_unit NUMERIC(12, 2) DEFAULT 0,
      total_price NUMERIC(12, 2) NOT NULL,
      received_date DATE NOT NULL,
      delivery_date DATE NOT NULL,
      actual_delivery_date DATE,
      status VARCHAR(20) DEFAULT 'جديدة', -- 'جديدة'، 'قيد التنفيذ'، 'جاهزة'، 'مسلّمة'، 'ملغاة'
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. جدول الدفعات المالية المتعددة لكل حالة
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      case_id INT REFERENCES cases(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      payment_date DATE NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  ;

  try {
    const bcrypt = require('bcryptjs');

    // تنفيذ استعلام إنشاء الجداول في قاعدة البيانات
    await pool.query(queryText);
    console.log("✔️ تم فحص وإنشاء جداول قاعدة البيانات بنجاح في السحاب.");

    // إنشاء حساب مدير افتراضي تلقائياً إن لم يكن موجوداً مسبقاً
    const userCheck = await pool.query("SELECT * FROM users WHERE username = 'admin'");
    if (userCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('titanium2026', 10);
      await pool.query("INSERT INTO users (username, password, role) VALUES ('admin', \$1, 'admin')", [hashedPassword]);
      console.log("🔑 تم إنشاء حساب المدير الافتراضي: (اسم المستخدم: admin / كلمة المرور: titanium2026)");
    }
  } catch (err) {
    console.error("❌ خطأ فني أثناء تهيئة قاعدة البيانات الحية:", err);
  }
};

// تشغيل دالة الفحص والإنشاء فور استدعاء الملف
createTables();

module.exports = pool;
