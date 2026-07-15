const express = require('express');
const session = require('express-session');
const path = require('path');
const connectDB = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

//Establish Core MongoDB Connection
connectDB();

//View Engine Layout Configuration (Embedded JavaScript)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

//Global Static Assets Folder Integration
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//Request Body Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//Server-Side Session Management Configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'AMS_Maguyam_Elizabeth_Angcanan_Secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

//Global Context Middleware
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

//Route Module Mappings
const authRoutes = require('./routes/authRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/', authRoutes);
app.use('/', tenantRoutes);
app.use('/admin', adminRoutes);

//Baseline Redirect Context
app.get('/', (req, res) => {
    res.redirect('/home');
});

//Centralized Operational Server Listener Node Activation
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 AMS NODE.JS SERVER INITIALIZED SUCCESSFULLY`);
    console.log(`📡 Access Portal Workspace: http://localhost:${PORT}`);
    console.log(`====================================================`);
});