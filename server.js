[15/10/2026 11:19 م] Mohammed Hayder | Entrepreneur ️: const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'titanium_default_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==========================================
// 🔑 مسارات نظام المصادقة (Authentication API)
// ==========================================

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'يرجى إدخال البيانات' });

  try {
    const result = await db.query('SELECT * FROM users WHERE username = \$1', [username.trim()]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة!' });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة!' });

    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في خادم النظام' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/auth/status', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

// ==========================================
// 📦 مسارات إدارة الحالات والأطباء (محمية بجدار الحماية)
// ==========================================

// 1. إضافة حالة جديدة مع فحص/إضافة الدكتور تلقائياً
app.post('/api/cases', authMiddleware, async (req, res) => {
  const { docName, docPhone, patientName, workType, units, pricingType, priceInput, receivedDate, deliveryDate } = req.body;

  try {
    // التحقق أو إضافة الدكتور أولاً
    let docResult = await db.query('SELECT id FROM doctors WHERE name = \$1', [docName.trim()]);
    let doctorId;

    if (docResult.rows.length === 0) {
      const newDoc = await db.query('INSERT INTO doctors (name, phone) VALUES (\$1, \$2) RETURNING id', [docName.trim(), docPhone]);
      doctorId = newDoc.rows[0].id;
    } else {
      doctorId = docResult.rows[0].id;
    }

    // توليد رقم حالة تلقائي فريد (TL-تتابع ميكروثانية لضمان عدم التكرار)
    const caseNumber = TL-${Date.now().toString().slice(-6)};

    // حساب السعر الإجمالي
    const uCount = parseInt(units) || 1;
    const pInput = parseFloat(priceInput) || 0;
    const totalPrice = pricingType === 'unit' ? uCount * pInput : pInput;

    // إدخال الحالة في جدول الحالات
    const newCase = await db.query(
      INSERT INTO cases (case_number, doctor_id, patient_name, work_type, units, pricing_type, price_per_unit, total_price, received_date, delivery_date, status)
       VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, 'جديدة') RETURNING *,
      [caseNumber, doctorId, patientName.trim(), workType, uCount, pricingType, pInput, totalPrice, receivedDate, deliveryDate]
    );

    res.json({ success: true, case: newCase.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'تعذر حفظ الحالة في قاعدة البيانات' });
  }
});

// 2. جلب جميع الحالات مع اسم الدكتور وحساب أيام التأخير ديناميكياً
app.get('/api/cases', authMiddleware, async (req, res) => {
[15/10/2026 11:19 م] Mohammed Hayder | Entrepreneur ️: try {
    const result = await db.query(
      SELECT c.*, d.name as doctor_name, d.phone as doctor_phone,
      COALESCE((SELECT SUM(amount) FROM payments WHERE case_id = c.id), 0) as total_paid
      FROM cases c
      JOIN doctors d ON c.doctor_id = d.id
      ORDER BY c.id DESC
    );

    // حساب التنبيهات والتأخير بناءً على تاريخ اليوم الفعلي
    const today = new Date('2026-10-15'); 

    const processedCases = result.rows.map(c => {
      const delivery = new Date(c.delivery_date);
      let delayDays = 0;
      let alertColor = 'none';

      // لا يُحسب التأخير إذا كانت الحالة مسلّمة أو ملغاة
      if (c.status !== 'مسلّمة' && c.status !== 'ملغاة') {
        if (today > delivery) {
          const diffTime = Math.abs(today - delivery);
          delayDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          alertColor = 'critical'; // متأخرة باللون الأحمر
        } else {
          const diffTime = Math.abs(delivery - today);
          const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (daysLeft <= 2) alertColor = 'warning'; // قريبة جداً (يومين أو أقل) بالأصفر
        }
      }

      return {
        ...c,
        delay_days: delayDays,
        alert_color: alertColor,
        remaining_amount: parseFloat(c.total_price) - parseFloat(c.total_paid)
      };
    });

    res.json(processedCases);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب البيانات من السيرفر' });
  }
});

// 3. جلب إحصائيات لوحة التحكم الشاملة
app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const todayStr = '2026-10-15';

    const stats = await db.query(
      SELECT 
        COUNT(CASE WHEN status = 'جديدة' THEN 1 END) as new_cases,
        COUNT(CASE WHEN status = 'قيد التنفيذ' THEN 1 END) as progress_cases,
        COUNT(CASE WHEN status = 'جاهزة' THEN 1 END) as ready_cases,
        COUNT(CASE WHEN status = 'جديدة' OR status = 'قيد التنفيذ' OR status = 'جاهزة' AND delivery_date < \$1 THEN 1 END) as late_cases,
        COALESCE(SUM(total_price), 0) as total_sales,
        COALESCE((SELECT SUM(amount) FROM payments), 0) as total_income
      FROM cases
    , [todayStr]);

    res.json(stats.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'خطأ في حساب الإحصائيات' });
  }
});

app.listen(PORT, () => {
  console.log(🚀 خادم Titanium Lab المتكامل يعمل على المنفذ: ${PORT});
});
