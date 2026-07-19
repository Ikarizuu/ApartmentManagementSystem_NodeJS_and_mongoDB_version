const express = require('express');
const session = require('express-session');
const path = require('path');
const connectDB = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'AMS_Maguyam_Elizabeth_Angcanan_Secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

// Global Context for Notifications, Audience Targeting & History Status
app.use(async (req, res, next) => {
    res.locals.user = req.session.user || null;
    
    if (req.session.user && req.session.user.role !== 'admin') {
        try {
            const Announcement = require('./models/Announcement');
            const User = require('./models/User');
            const RentApplication = require('./models/RentApplication');
            const Tenant = require('./models/Tenant');

            const userDoc = await User.findById(req.session.user.id || req.session.user._id);
            const hasApp = await RentApplication.findOne({ user: userDoc._id, status: { $in: ['accepted', 'active'] } });
            const pastOrActiveTenant = await Tenant.findOne({ user: userDoc._id }); 
            
            res.locals.hasHistory = !!pastOrActiveTenant; 

            let audienceFilter = ['All'];
            if (hasApp) audienceFilter.push('Tenants');
            else audienceFilter.push('Non-Tenants');

            const rawAnnouncements = await Announcement.find({ 
                status: 'sent', 
                createdAt: { $gte: userDoc.createdAt }, 
                $or: [
                    { sendTo: { $in: audienceFilter } },
                    { sendTo: 'Specific', targetUser: userDoc._id }
                ],
                _id: { $nin: userDoc.clearedAnnouncements || [] } 
            }).sort({ createdAt: -1 }).limit(15);

            res.locals.announcements = rawAnnouncements.map(ann => {
                const annObj = ann.toObject();
                annObj.isRead = (userDoc.readAnnouncements || []).includes(ann._id);
                return annObj;
            });
            
            res.locals.unreadCount = res.locals.announcements.filter(a => !a.isRead).length;
        } catch (err) {
            res.locals.announcements = [];
            res.locals.unreadCount = 0;
            res.locals.hasHistory = false;
        }
    } else {
        res.locals.announcements = [];
        res.locals.unreadCount = 0;
        res.locals.hasHistory = false;
    }
    next();
});

// Automated Personalized Rent Reminder Subsystem
setInterval(async () => {
    try {
        const Announcement = require('./models/Announcement');
        const Transaction = require('./models/Transaction');
        const Tenant = require('./models/Tenant');
        
        const today = new Date();
        const activeTenants = await Tenant.find({ isArchived: false, status: 'Active' });

        for (let tenant of activeTenants) {
            const firstPay = await Transaction.findOne({ user: tenant.user, type: 'deposit', status: 'completed' }).sort({ createdAt: 1 });
            if (!firstPay) continue;

            const bDay = firstPay.createdAt.getDate(); 
            
            let nextDue = new Date(today.getFullYear(), today.getMonth(), bDay);
            if (today.getTime() > nextDue.getTime()) {
                nextDue.setMonth(nextDue.getMonth() + 1); 
            }
            
            const diffTime = nextDue - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            const reminderMap = { 14: "2 Weeks", 7: "1 Week", 3: "3 Days", 2: "2 Days", 1: "1 Day" };
            
            if (reminderMap[diffDays]) {
                const title = `Rent Due Reminder: ${reminderMap[diffDays]} Left`;
                const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                
                const existing = await Announcement.findOne({
                    targetUser: tenant.user,
                    title: title,
                    createdAt: { $gte: startOfMonth }
                });

                if (!existing) {
                    await new Announcement({
                        title: title,
                        body: `Friendly reminder: Your next rent cycle is due on ${nextDue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Please ensure your balance is settled to avoid issues.`,
                        tag: 'Reminder',
                        sendTo: 'Specific',
                        targetUser: tenant.user,
                        status: 'sent'
                    }).save();
                }
            }
        }
    } catch (err) {
        console.error("Auto-reminder error tracking:", err);
    }
}, 1000 * 60 * 60 * 6);

const authRoutes = require('./routes/authRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/', authRoutes);
app.use('/', tenantRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => res.redirect('/home'));

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 AMS NODE.JS SERVER INITIALIZED SUCCESSFULLY`);
    console.log(`📡 Access Portal Workspace: http://localhost:${PORT}`);
    console.log(`====================================================`);
});