const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const RentApplication = require('../models/RentApplication');
const Announcement = require('../models/Announcement');
const Transaction = require('../models/Transaction');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/applications/'),
    filename: (req, file, cb) => {
        const lName = (req.body.lastName || 'User').replace(/[^a-zA-Z]/g, '');
        const fName = (req.body.firstName || 'Resident').replace(/[^a-zA-Z]/g, '');
        cb(null, `${lName}-${fName}_${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

const isTenant = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard');
    next();
};

// Core Mathematical Engine for Dynamic Rent Limits
async function getTenantBillingContext(userId) {
    const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
    const activeTenant = await Tenant.findOne({ user: userId });
    
    const allRentPayments = await Transaction.find({ user: userId, type: { $in: ['deposit', 'rent'] }, status: 'completed' }).sort({ createdAt: 1 });
    const pendingPayments = await Transaction.find({ user: userId, type: { $in: ['deposit', 'rent'] }, status: 'pending' });
    const totalPaidMonths = allRentPayments.length + pendingPayments.length;

    let startD = application ? new Date(application.createdAt) : new Date();
    if (allRentPayments.length > 0) startD = new Date(allRentPayments[0].createdAt);
    
    const billingDay = startD.getDate();
    const paidUpToDate = new Date(startD.getFullYear(), startD.getMonth() + totalPaidMonths, billingDay);
    const rentDueDateLabel = paidUpToDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const currentCycleStart = new Date(startD.getFullYear(), startD.getMonth() + (totalPaidMonths > 0 ? totalPaidMonths - 1 : 0), billingDay).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    let contractMaxMonths = application ? application.monthsOfRent : 0;
    if (activeTenant && activeTenant.contactNo.includes("EXT:")) {
        const rawSavedMonth = activeTenant.contactNo.split("EXT:")[1];
        const [extYear, extMonth] = rawSavedMonth.split("-");
        if (extYear && extMonth) contractMaxMonths = (parseInt(extYear) - startD.getFullYear()) * 12 + (parseInt(extMonth) - startD.getMonth()) + 1;
    }

    const today = new Date();
    let monthsPassed = (today.getFullYear() - startD.getFullYear()) * 12 + (today.getMonth() - startD.getMonth());
    if (today.getDate() < billingDay) monthsPassed--;
    if (monthsPassed < 0) monthsPassed = 0;

    let canPayRent = true;
    let rentLockReason = "";

    if (totalPaidMonths >= contractMaxMonths) {
        canPayRent = false;
        rentLockReason = `Contract fully paid up to ${rentDueDateLabel}. Max contract term reached.`;
    } else if (totalPaidMonths > monthsPassed + 1) {
        canPayRent = false;
        rentLockReason = `You have paid in advance up to ${rentDueDateLabel}. Maximum 1-month advance payment limit reached.`;
    }

    return { application, activeTenant, totalPaidMonths, contractMaxMonths, rentDueDateLabel, currentCycleStart, canPayRent, rentLockReason };
}

// ==================================================
// NOTIFICATION SYSTEM & ARCHIVE
// ==================================================
router.post('/notifications/:id/read', isTenant, async (req, res) => {
    await User.findByIdAndUpdate(req.session.user._id || req.session.user.id, { $addToSet: { readAnnouncements: req.params.id } });
    res.json({ success: true });
});

router.post('/notifications/:id/clear', isTenant, async (req, res) => {
    await User.findByIdAndUpdate(req.session.user._id || req.session.user.id, { $addToSet: { clearedAnnouncements: req.params.id } });
    res.json({ success: true });
});

router.post('/notifications/read-all', isTenant, async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const userDoc = await User.findById(userId);
        const hasApp = await RentApplication.findOne({ user: userId, status: { $in: ['accepted', 'active'] } });
        let filter = ['All']; if (hasApp) filter.push('Tenants'); else filter.push('Non-Tenants');

        const activeNotifs = await Announcement.find({
            status: 'sent', createdAt: { $gte: userDoc.createdAt },
            $or: [{ sendTo: { $in: filter } }, { sendTo: 'Specific', targetUser: userId }],
            _id: { $nin: userDoc.clearedAnnouncements || [] }
        });
        
        await User.findByIdAndUpdate(userId, { $addToSet: { readAnnouncements: { $each: activeNotifs.map(a => a._id) } } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/notifications/clear-all', isTenant, async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const userDoc = await User.findById(userId);
        const hasApp = await RentApplication.findOne({ user: userId, status: { $in: ['accepted', 'active'] } });
        let filter = ['All']; if (hasApp) filter.push('Tenants'); else filter.push('Non-Tenants');

        const activeNotifs = await Announcement.find({
            status: 'sent', createdAt: { $gte: userDoc.createdAt },
            $or: [{ sendTo: { $in: filter } }, { sendTo: 'Specific', targetUser: userId }],
            _id: { $nin: userDoc.clearedAnnouncements || [] }
        });

        await User.findByIdAndUpdate(userId, { $addToSet: { clearedAnnouncements: { $each: activeNotifs.map(a => a._id) } } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/notifications/archived', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const userDoc = await User.findById(userId);
    const archivedAnnouncements = await Announcement.find({ _id: { $in: userDoc.clearedAnnouncements || [] } }).sort({ createdAt: -1 });
    res.render('archivedNotifications', { archivedAnnouncements, hasRentedRoom: !!(await RentApplication.findOne({ user: userId })), user: req.session.user });
});

// ==================================================
// TRANSACTION HISTORY (TENANT SIDE)
// ==================================================
router.get('/transaction-history', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    if (!(await Tenant.findOne({ user: userId }))) return res.redirect('/home');
    const transactions = await Transaction.find({ user: userId }).sort({ createdAt: -1 });
    res.render('transactionHistory', { transactions, hasRentedRoom: !!(await RentApplication.findOne({ user: userId })), user: req.session.user });
});

// ==================================================
// GENERAL TENANT ROUTES
// ==================================================
router.get('/home', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
    if (application && (application.status === 'accepted' || application.status === 'pending' || application.status === 'active')) return res.redirect('/my-room');
    const Room = require('../models/Room');
    res.render('home', { availableRoomsCount: await Room.countDocuments({ isAvailable: true }), hasRentedRoom: false, user: req.session.user });
});

router.get('/preview', isTenant, async (req, res) => {
    const Room = require('../models/Room');
    const rooms = await Room.find({ isAvailable: true }).sort({ roomName: 1 });
    res.render('preview', { rooms, hasRentedRoom: !!(await RentApplication.findOne({ user: req.session.user._id || req.session.user.id })), user: req.session.user });
});

router.get('/rent-application', isTenant, async (req, res) => {
    if (await RentApplication.findOne({ user: req.session.user._id || req.session.user.id })) return res.redirect('/my-room');
    res.render('rentApplication', { roomSelection: req.query.room || 'Room A', user: req.session.user, hasRentedRoom: false });
});

router.post('/rent-application', isTenant, upload.fields([{ name: 'validIdFrontFile', maxCount: 1 }, { name: 'validIdBackFile', maxCount: 1 }, { name: 'nbiFile', maxCount: 1 }]), async (req, res) => {
    const { firstName, lastName, suffix, gender, contactNo, occupants, monthsOfRent, roomRequested } = req.body;
    await new RentApplication({
        user: req.session.user._id || req.session.user.id,
        firstName: firstName.trim(), lastName: lastName.trim(), suffix: suffix.trim(), gender, contactNo: contactNo.trim(), occupants: parseInt(occupants), monthsOfRent: parseInt(monthsOfRent), roomRequested,
        documents: { validIdFrontPath: req.files['validIdFrontFile'][0].path.replace(/\\/g, '/'), validIdBackPath: req.files['validIdBackFile'][0].path.replace(/\\/g, '/'), nbiClearancePath: req.files['nbiFile'][0].path.replace(/\\/g, '/') }
    }).save();
    res.redirect('/my-room');
});

router.get('/my-room', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const ctx = await getTenantBillingContext(userId);
    if (!ctx.application) return res.redirect('/preview');

    res.render('myRoom', { 
        application: ctx.application, hasRentedRoom: true, user: req.session.user,
        isPaid: !!(await Transaction.findOne({ user: userId, type: 'deposit', status: 'completed' })),
        isWaitingConfirmation: !!(await Transaction.findOne({ user: userId, type: 'deposit', status: 'pending' })),
        currentCycleStart: ctx.currentCycleStart, rentDueDateLabel: ctx.rentDueDateLabel,
        totalPaidMonths: ctx.totalPaidMonths, contractMaxMonths: ctx.contractMaxMonths
    });
});

router.get('/view-contract', isTenant, async (req, res) => {
    const application = await RentApplication.findOne({ user: req.session.user._id || req.session.user.id }).sort({ createdAt: -1 });
    if (!application) return res.redirect('/home');
    const baseRent = application.roomRequested.match(/Room [I-N]/) ? 3500 : 4000;
    res.render('viewContract', { application: { ...application._doc, monthlyRent: baseRent }, hasRentedRoom: true, user: req.session.user });
});

router.post('/extend-lease', isTenant, async (req, res) => {
    const tenantProfile = await Tenant.findOne({ user: req.session.user._id || req.session.user.id });
    if (tenantProfile) {
        tenantProfile.contactNo = `${tenantProfile.contactNo.split("EXT:")[0].trim()} EXT:${req.body.extendEndMonth}`;
        await tenantProfile.save();
    }
    res.redirect('/my-room');
});

router.post('/terminate-lease', isTenant, async (req, res) => {
    await Tenant.findOneAndUpdate({ user: req.session.user._id || req.session.user.id }, { status: 'Pending Moveout' });
    res.redirect('/my-room');
});

router.get('/pay-bills', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const ctx = await getTenantBillingContext(userId);
    if (!ctx.application) return res.redirect('/home');

    const baseRent = ctx.application.roomRequested.match(/Room [I-N]/) ? 3500 : 4000;
    const actualBaseRent = ctx.canPayRent ? baseRent : 0;
    const utilityBills = await Transaction.find({ user: userId, status: 'pending', type: 'utilities' });
    
    res.render('payBills', { 
        application: ctx.application, actualBaseRent, canPayRent: ctx.canPayRent, rentLockReason: ctx.rentLockReason, 
        isFullyBoarded: !!ctx.activeTenant, hasRentedRoom: true, user: req.session.user, 
        isWaitingConfirmation: !!(await Transaction.findOne({ user: userId, status: 'pending', type: { $in: ['deposit', 'rent'] } })),
        utilityBills, currentPeriodLabel: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        rentDueDateLabel: ctx.rentDueDateLabel
    });
});

router.post('/pay-bills', isTenant, async (req, res) => {
    const { amount, paymentMethod } = req.body;
    const userId = req.session.user._id || req.session.user.id;
    const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
    const initialTxStatus = paymentMethod === 'cash' ? 'pending' : 'completed';

    const utilityBills = await Transaction.find({ user: userId, status: 'pending', type: 'utilities' });
    let utilsTotal = 0; utilityBills.forEach(b => utilsTotal += b.amount);
    
    if (parseFloat(amount) > utilsTotal) {
        const activeTenant = await Tenant.findOne({ user: userId });
        await new Transaction({
            user: userId, roomName: application.roomRequested, amount: parseFloat(amount) - utilsTotal, 
            type: activeTenant ? 'rent' : 'deposit', paymentMethod: paymentMethod, status: initialTxStatus
        }).save();
    }

    for (let bill of utilityBills) {
        if (initialTxStatus === 'completed') { bill.status = 'completed'; await bill.save(); }
    }

    if (initialTxStatus === 'completed') {
        const Room = require('../models/Room');
        const room = await Room.findOne({ roomName: application.roomRequested });
        if (!(await Tenant.findOne({ user: userId }))) {
            let sanitizedGender = 'Other';
            if (application.gender && application.gender.trim().toLowerCase() === 'male') sanitizedGender = 'Male';
            if (application.gender && application.gender.trim().toLowerCase() === 'female') sanitizedGender = 'Female';
            await new Tenant({ user: userId, suffix: application.suffix || '', gender: sanitizedGender, contactNo: application.contactNo, room: room ? room._id : null }).save();
        }
    }
    return res.json({ status: initialTxStatus, amount, method: paymentMethod });
});

router.get('/profile-settings', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const dbUser = await User.findById(userId);
    const tenantData = await Tenant.findOne({ user: userId });
    res.render('profileSettings', { dbUser: { ...dbUser._doc, contactNo: (tenantData?.contactNo || '').split("EXT:")[0].trim(), suffix: tenantData?.suffix || '', gender: tenantData?.gender || '' }, successMessage: null, errorMessage: null, hasRentedRoom: !!(await RentApplication.findOne({ user: userId })), user: req.session.user });
});

router.post('/profile-settings/update', isTenant, async (req, res) => {
    const { firstName, lastName, suffix, gender, contactNo } = req.body;
    const userId = req.session.user._id || req.session.user.id;
    const updatedUser = await User.findByIdAndUpdate(userId, { firstName: firstName.trim(), lastName: lastName.trim() }, { returnDocument: 'after' });
    req.session.user.first_name = updatedUser.firstName; req.session.user.last_name = updatedUser.lastName;
    const tenantData = await Tenant.findOne({ user: userId });
    if (tenantData) {
        tenantData.contactNo = contactNo.trim() + (tenantData.contactNo.includes("EXT:") ? " EXT:" + tenantData.contactNo.split("EXT:")[1] : "");
        tenantData.suffix = suffix.trim(); tenantData.gender = gender;
        await tenantData.save();
    }
    res.redirect('/profile-settings');
});

router.post('/profile-settings/password', isTenant, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const dbUser = await User.findById(req.session.user._id || req.session.user.id);
    const bcrypt = require('bcryptjs');
    if (newPassword.length >= 8 && newPassword === confirmPassword && (await bcrypt.compare(currentPassword, dbUser.password))) {
        dbUser.password = newPassword; await dbUser.save();
    }
    res.redirect('/profile-settings');
});

module.exports = router;