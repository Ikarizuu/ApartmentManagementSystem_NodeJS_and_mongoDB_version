const express = require('express');
const session = require('express-session');
const path = require('path');
const connectDB = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

//Establish database connection
connectDB();

//View engine layout configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

//Global static assets folder integration
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//Request body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//Server-side session management configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'AMS_Maguyam_Elizabeth_Angcanan_Secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, //Set to true if using HTTPS in production
        maxAge: 1000 * 60 * 60 * 24 //24-hour expiration duration limit
    }
}));

//Global context middleware for topbar notifications and user session
app.use(async (req, res, next) => {
    res.locals.user = req.session.user || null;
    
    //Pre-load active announcements dynamically for the topbar popover
    if (req.session.user) {
        try {
            const Announcement = require('./models/Announcement');
            res.locals.announcements = await Announcement.find({ status: 'sent' }).sort({ createdAt: -1 }).limit(10);
        } catch (err) {
            res.locals.announcements = [];
        }
    } else {
        res.locals.announcements = [];
    }
    next();
});

//Route module mappings
const authRoutes = require('./routes/authRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/', authRoutes);
app.use('/', tenantRoutes); //Mounts tenant features (including updated /pay-bills and /my-room)
app.use('/admin', adminRoutes);

//Baseline redirect context
app.get('/', (req, res) => {
    res.redirect('/home');
});

//Centralized operational server listener activation
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 AMS NODE.JS SERVER INITIALIZED SUCCESSFULLY`);
    console.log(`📡 Access Portal Workspace: http://localhost:${PORT}`);
    console.log(`====================================================`);
});