const express = require('express');
const session = require('express-session');
const path = require('path');
const connectDB = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Establish Core MongoDB Connection
connectDB();

// 2. View Engine Layout Configuration (Embedded JavaScript)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 3. Global Static Assets Folder Integration
app.use(express.static(path.join(__dirname, 'public')));
// Expose the upload folder paths so images/IDs display properly on frontend templates
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 4. Request Body Parsers (Handles URL-encoded data & JSON blocks)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 5. Server-Side Session Management Configuration
// Replaces PHP's $_SESSION framework to securely cache tenant/admin states
app.use(session({
    secret: process.env.SESSION_SECRET || 'AMS_Maguyam_Elizabeth_Angcanan_Secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if deploying over production HTTPS servers
        maxAge: 1000 * 60 * 60 * 24 // Cookie lifecycle stays active for 24 Hours
    }
}));

// 6. Global Context Middleware
// Automatically passes logged-in user session records to all EJS templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// 7. Route Module Mappings
// These match the pathways configured in your React single-page routing tree
// (We will build these file vectors step-by-step next)
const authRoutes = require('./routes/authRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/', authRoutes);
app.use('/', tenantRoutes);
app.use('/admin', adminRoutes);

// 8. Baseline Redirect Context
app.get('/', (req, res) => {
    res.redirect('/home');
});

// 9. Centralized Operational Server Listener Node Activation
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 AMS NODE.JS SERVER INITIALIZED SUCCESSFULLY`);
    console.log(`📡 Access Portal Workspace: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
