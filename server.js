const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- CONFIGURATION (FILL THESE MANUALLY) ---
const CONFIG = {
    EMAIL: "moddy2232@gmail.com",
    APP_PASSWORD: "kdtx ovfm zzkc yndr",
    SITE_URL: "https://nexushoster.onrender.com"
};

// In-memory store for OTPs (In production, use Redis or a DB)
const otpStore = new Map();

// Email Transporter Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: CONFIG.EMAIL,
        pass: CONFIG.APP_PASSWORD
    }
});

/**
 * AUTH: Request OTP
 */
app.post('/api/auth/request-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).send('Email required');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email, { otp, expires: Date.now() + 600000 }); // 10 min expiry

    const mailOptions = {
        from: `"Nexus Hoster" <${CONFIG.EMAIL}>`,
        to: email,
        subject: 'Your Nexus Hoster Verification Code',
        text: `Hey welcome to Nexus Hoster\nthis is an automated message from nexushoster\n\nYour code is\n\n${otp}\n\nfrom nexushoster\n-qetoo`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'OTP Sent' });
    } catch (error) {
        console.error("Email Error:", error);
        res.status(500).send('Failed to send email');
    }
});

/**
 * SERVER MANAGEMENT (Simulated Logic)
 */
app.post('/api/server/create', (req, res) => {
    // Generate a secure random password for the Pterodactyl account
    const panelPassword = crypto.randomBytes(10).toString('hex'); // 20 chars
    
    // Logic would normally interface with Pterodactyl API here
    // application.createUser(...)
    // application.createServer(...)
    
    res.json({
        success: true,
        password: panelPassword,
        panelUrl: "https://panel.nexushoster.onrender.com" // Placeholder
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Nexus Hoster running at ${CONFIG.SITE_URL}`);
});
