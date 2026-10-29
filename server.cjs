const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key');
const { generateOtp, isOtpExpired } = require('./otp-utils.cjs');

// Firebase Admin - optional for now, using mock for file uploads
let db = null;
let firebaseAdmin = null;
try {
  const admin = require('firebase-admin');
  firebaseAdmin = admin;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const adminOptions = serviceAccountJson
    ? {
        credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
        projectId: 'skillstreetofficial'
      }
    : {
        credential: admin.credential.applicationDefault(),
        projectId: 'skillstreetofficial'
      };
  admin.initializeApp(adminOptions);
  db = admin.firestore();
} catch (error) {
  console.warn('Firebase Admin unavailable - payment features will be limited:', error.message);
}

const app = express();

// Platform commission rate (10%)
const COMMISSION_RATE = 10;
const otpStore = new Map();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendOtpEmail(email, otp) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { success: false, reason: 'missing-config' };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'SkillStreet email verification OTP',
      html: `<p>Your SkillStreet verification code is <strong>${otp}</strong>.</p><p>This code will expire in 5 minutes.</p>`
    });
    return { success: true };
  } catch (error) {
    console.error('OTP email error:', error);
    return { success: false, reason: 'send-failed' };
  }
}

// SQLite Database Setup
const DB_PATH = path.join(__dirname, 'database.sqlite');
const sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize SQLite tables
function initializeDatabase() {
  sqliteDb.serialize(() => {
    // Users table
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Uploads table
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        file_size INTEGER,
        mime_type TEXT
      )
    `);

    console.log('Database tables initialized');
  });
}

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('Created uploads directory');
}

// Configure Multer for local file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Sanitize username
    const username = req.body.username || 'user';
    const sanitizedUsername = username.replace(/[^a-zA-Z0-9]/g, '_');
    
    // Generate unique filename: username_timestamp.extension
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const newFilename = `${sanitizedUsername}_${timestamp}${ext}`;
    
    cb(null, newFilename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit
  }
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
}));
app.use(express.json());

app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = (email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const otp = generateOtp(6);
    const expiresAt = Date.now() + 5 * 60 * 1000;
    otpStore.set(normalizedEmail, { otp, expiresAt, verified: false });

    const emailResult = await sendOtpEmail(normalizedEmail, otp);
    if (!emailResult.success) {
      otpStore.delete(normalizedEmail);
      return res.status(500).json({
        error: 'Unable to send OTP email. Configure SMTP credentials in the environment to enable this feature.'
      });
    }

    res.json({ success: true, expiresAt });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedOtp = (otp || '').trim();

    if (!normalizedEmail || !normalizedOtp) {
      return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    const record = otpStore.get(normalizedEmail);
    if (!record) {
      return res.status(404).json({ error: 'OTP not found. Request a new one.' });
    }

    if (isOtpExpired(record.expiresAt)) {
      otpStore.delete(normalizedEmail);
      return res.status(410).json({ error: 'OTP has expired. Request a new one.' });
    }

    if (record.otp !== normalizedOtp) {
      return res.status(401).json({ error: 'Invalid OTP.' });
    }

    record.verified = true;
    otpStore.set(normalizedEmail, record);
    res.json({ success: true });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP.' });
  }
});

app.post(['/api/notifications/student-selection', '/api/notifications/student-selection.php'], async (req, res) => {
  try {
    if (!firebaseAdmin || !db) {
      return res.status(503).json({ error: 'Firebase is not configured for selection notifications.' });
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(503).json({ error: 'Email delivery is not configured on the server.' });
    }

    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'Sign in to send a selection notification.' });
    }

    const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
    const { submissionId } = req.body || {};
    if (typeof submissionId !== 'string' || !submissionId.trim()) {
      return res.status(400).json({ error: 'A submission ID is required.' });
    }

    const submissionSnapshot = await db.collection('submissions').doc(submissionId).get();
    if (!submissionSnapshot.exists) {
      return res.status(404).json({ error: 'The selected submission could not be found.' });
    }

    const submission = submissionSnapshot.data();
    if (!submission.taskId || !submission.studentId) {
      return res.status(400).json({ error: 'The selected submission is missing task or student details.' });
    }

    const taskSnapshot = await db.collection('tasks').doc(submission.taskId).get();
    if (!taskSnapshot.exists) {
      return res.status(404).json({ error: 'The task for this submission could not be found.' });
    }

    const task = taskSnapshot.data();
    if (task.companyId !== decodedToken.uid) {
      return res.status(403).json({ error: 'You can only notify students about your own task submissions.' });
    }

    const studentName = submission.studentName || 'Student';
    const startupName = task.startupName || task.companyName || 'A startup';
    const taskTitle = task.title || submission.taskTitle || 'your submitted work';
    const rewardTypes = Array.isArray(task.rewardTypes) ? task.rewardTypes : [];
    const rewardAmount = task.prize || '';

    const companyName = task.startupName || task.companyName || decodedToken.name || 'A startup';
    const supportText = [
      'A company selected a student submission on SkillStreet.',
      '',
      `Company: ${companyName}`,
      `Company email: ${decodedToken.email || 'N/A'}`,
      `Company ID: ${decodedToken.uid}`,
      '',
      `Student: ${studentName}`,
      `Student email: ${submission.studentEmail || 'N/A'}`,
      `Student ID: ${submission.studentId}`,
      '',
      `Task: ${taskTitle}`,
      `Task ID: ${submission.taskId}`,
      `Reward amount: ${rewardAmount || 'N/A'}`,
      `Reward types: ${rewardTypes.length ? rewardTypes.join(', ') : 'N/A'}`,
      '',
      `Submission ID: ${submissionId}`,
      `Selected at: ${submission.selectedAt || new Date().toISOString()}`
    ].join('\n');

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: 'support.skillstreet@gmail.com',
      subject: `SkillStreet selection: ${studentName} - ${taskTitle.replace(/[\r\n]+/g, ' ').trim()}`,
      text: supportText
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Student selection notification error:', error);
    res.status(500).json({ error: 'Unable to send the student selection notification.' });
  }
});

// Upload file to local storage
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
      });
    }

    const username = req.body.username || 'user';
    const sanitizedUsername = username.replace(/[^a-zA-Z0-9]/g, '_');
    
    // Insert user if not exists
    sqliteDb.run(
      `INSERT OR IGNORE INTO users (username, email) VALUES (?, ?)`,
      [sanitizedUsername, `${sanitizedUsername}@example.com`],
      (err) => {
        if (err && err.message.includes('UNIQUE constraint')) {
          // User already exists, ignore
        }
      }
    );

    // Insert upload record
    const fileData = {
      username: sanitizedUsername,
      original_filename: req.file.originalname,
      stored_filename: req.file.filename,
      file_path: `/uploads/${req.file.filename}`,
      file_size: req.file.size,
      mime_type: req.file.mimetype
    };

    sqliteDb.run(
      `INSERT INTO uploads (username, original_filename, stored_filename, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?)`,
      [fileData.username, fileData.original_filename, fileData.stored_filename, fileData.file_path, fileData.file_size, fileData.mime_type],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({
            error: 'Failed to save upload record',
            details: err.message
          });
        }

        res.json({
          success: true,
          fileId: this.lastID,
          username: fileData.username,
          fileName: fileData.stored_filename,
          path: fileData.file_path,
          originalFilename: fileData.original_filename
        });
      }
    );

  } catch (error) {
    console.error('UPLOAD ERROR:', error);
    res.status(500).json({
      error: 'Upload failed',
      details: error.message,
    });
  }
});

// Get file info by ID
app.get('/api/file/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    
    sqliteDb.get(
      `SELECT * FROM uploads WHERE id = ?`,
      [fileId],
      (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (!row) {
          return res.status(404).json({ error: 'File not found' });
        }

        res.json({
          success: true,
          file: row
        });
      }
    );
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to get file info' });
  }
});

// Delete file from local storage
app.delete('/api/delete/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    
    sqliteDb.get(
      `SELECT * FROM uploads WHERE id = ?`,
      [fileId],
      (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (!row) {
          return res.status(404).json({ error: 'File not found' });
        }

        // Delete file from filesystem
        const filePath = path.join(__dirname, row.file_path);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        // Delete record from database
        sqliteDb.run(
          `DELETE FROM uploads WHERE id = ?`,
          [fileId],
          (err) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Failed to delete record' });
            }

            res.json({ success: true });
          }
        );
      }
    );
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Payment API Endpoints

// Create payment intent for task approval
app.post('/api/payments/create-intent', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Firebase not configured - payment features unavailable' });
    }

    const { submissionId, taskId, companyId, studentId, amount } = req.body;

    if (!submissionId || !taskId || !companyId || !studentId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Convert amount to cents for Stripe
    const amountInCents = Math.round(parseFloat(amount) * 100);

    // Calculate commission
    const platformCommission = Math.round(amountInCents * (COMMISSION_RATE / 100));
    const studentAmount = amountInCents - platformCommission;

    // Create Stripe Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'inr',
      metadata: {
        submissionId,
        taskId,
        companyId,
        studentId,
        platformCommission: platformCommission.toString(),
        studentAmount: studentAmount.toString()
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountInCents,
      platformCommission,
      studentAmount
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Confirm payment and create payment record
app.post('/api/payments/confirm', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Firebase not configured - payment features unavailable' });
    }

    const { paymentIntentId, submissionId, taskId, companyId, studentId, studentName, studentEmail, companyName, taskTitle, totalAmount, platformCommission, studentAmount } = req.body;

    // Verify payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment not successful' });
    }

    // Create payment record in Firebase
    const paymentData = {
      taskId,
      taskTitle,
      submissionId,
      companyId,
      companyName,
      studentId,
      studentName,
      studentEmail,
      totalAmount: parseInt(totalAmount),
      platformCommission: parseInt(platformCommission),
      studentAmount: parseInt(studentAmount),
      status: 'completed',
      stripePaymentIntentId: paymentIntentId,
      commissionRate: COMMISSION_RATE,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    const paymentRef = await addDoc(collection(db, 'payments'), paymentData);

    // Update submission with payment info
    await updateDoc(doc(db, 'submissions', submissionId), {
      paymentId: paymentRef.id,
      paymentStatus: 'completed',
      paidAt: new Date().toISOString()
    });

    // Create approval record
    const approvalData = {
      taskId,
      submissionId,
      companyId,
      studentId,
      approved: true,
      approvedAt: new Date().toISOString(),
      approvedBy: companyId,
      paymentTriggered: true,
      paymentId: paymentRef.id,
      createdAt: new Date().toISOString()
    };

    await addDoc(collection(db, 'task_approvals'), approvalData);

    res.json({
      success: true,
      paymentId: paymentRef.id,
      message: 'Payment processed successfully'
    });
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get payment history for a user
app.get('/api/payments/history/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Firebase not configured - payment features unavailable' });
    }

    const { userId } = req.params;
    const { userType } = req.query; // 'student' or 'company'

    let paymentsQuery;
    if (userType === 'student') {
      paymentsQuery = query(collection(db, 'payments'), where('studentId', '==', userId));
    } else if (userType === 'company') {
      paymentsQuery = query(collection(db, 'payments'), where('companyId', '==', userId));
    } else {
      return res.status(400).json({ error: 'Invalid user type' });
    }

    const querySnapshot = await getDocs(paymentsQuery);
    const payments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json({ payments });
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get approval status for a submission
app.get('/api/approvals/submission/:submissionId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Firebase not configured - payment features unavailable' });
    }

    const { submissionId } = req.params;

    const approvalQuery = query(collection(db, 'task_approvals'), where('submissionId', '==', submissionId));
    const querySnapshot = await getDocs(approvalQuery);

    if (querySnapshot.empty) {
      return res.json({ approved: false });
    }

    const approval = querySnapshot.docs[0].data();
    res.json({ approved: approval.approved, approval });
  } catch (error) {
    console.error('Approval status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files from uploads directory
app.use('/uploads', express.static(UPLOADS_DIR));

// Serve React app from dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Serve React app for all non-API routes
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// API fallback for unmatched routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.originalUrl });
});

// Global error handler for API responses
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (req.originalUrl.startsWith('/api')) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  next(err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Uploads directory: ${UPLOADS_DIR}`);
  console.log(`Database: ${DB_PATH}`);
});
