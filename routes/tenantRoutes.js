const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const RentApplication = require('../models/RentApplication');
const Announcement = require('../models/Announcement');
const Transaction = require('../models/Transaction');
const Room = require('../models/Room');

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

async function getTenantBillingContext(userId) {
    const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
    const activeTenant = await Tenant.findOne({ user: userId, isArchived: false });
    
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

    let utilityBills = [];
    let hasPendingUtilities = false;
    if (application) {
        const roomDoc = await Room.findOne({ roomName: application.roomRequested });
        if (roomDoc && roomDoc.utilities && roomDoc.utilities.isBilled) {
            const pendingUtilTx = await Transaction.findOne({ user: userId, type: 'utilities', status: 'pending', tenantPaid: true });
            if (!pendingUtilTx) {
                hasPendingUtilities = true;
                if (roomDoc.utilities.electricity > 0) {
                    utilityBills.push({ type: 'electricity', amount: roomDoc.utilities.electricity });
                }
                if (roomDoc.utilities.water > 0) {
                    utilityBills.push({ type: 'water', amount: roomDoc.utilities.water });
                }
            }
        }
    }

    const showRedPing = canPayRent || hasPendingUtilities;

    let baseEnd = new Date(startD.getFullYear(), startD.getMonth() + contractMaxMonths, 1);
    let validExtensions = [];
    for (let i = 1; i <= 6; i++) {
        let d = new Date(baseEnd.getFullYear(), baseEnd.getMonth() + i, 1);
        validExtensions.push({
            val: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        });
    }

    return { application, activeTenant, totalPaidMonths, contractMaxMonths, rentDueDateLabel, currentCycleStart, canPayRent, rentLockReason, utilityBills, showRedPing, validExtensions };
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
    const hasRentedRoom = !!(await RentApplication.findOne({ user: userId, status: { $in: ['accepted', 'pending', 'active'] } }));
    res.render('archivedNotifications', { archivedAnnouncements, hasRentedRoom, user: req.session.user });
});

// ==================================================
// TRANSACTION HISTORY (TENANT SIDE)
// ==================================================
router.get('/transaction-history', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const transactions = await Transaction.find({ user: userId }).sort({ createdAt: -1 });
    const hasRentedRoom = !!(await RentApplication.findOne({ user: userId, status: { $in: ['accepted', 'pending', 'active'] } }));
    res.render('transactionHistory', { transactions, hasRentedRoom, user: req.session.user });
});

// ==================================================
// GENERAL TENANT ROUTES
// ==================================================
router.get('/home', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
    if (application && (application.status === 'accepted' || application.status === 'pending' || application.status === 'active')) return res.redirect('/my-room');
    res.render('home', { availableRoomsCount: await Room.countDocuments({ isAvailable: true }), hasRentedRoom: false, user: req.session.user });
});

router.get('/preview', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const rooms = await Room.find({ isAvailable: true }).sort({ roomName: 1 });
    const hasRentedRoom = !!(await RentApplication.findOne({ user: userId, status: { $in: ['accepted', 'pending', 'active'] } }));
    res.render('preview', { rooms, hasRentedRoom, user: req.session.user });
});

router.get('/rent-application', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const existingApp = await RentApplication.findOne({ user: userId, status: { $in: ['accepted', 'pending', 'active'] } });
    if (existingApp) return res.redirect('/my-room');
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
    
    // Automatically evict access securely if the application status marks as concluded/archived or missing
    if (!ctx.application || ctx.application.status === 'archived' || ctx.application.status === 'rejected') {
        return res.redirect('/preview');
    }

    res.render('myRoom', { 
        application: ctx.application, 
        activeTenant: ctx.activeTenant,
        hasRentedRoom: true, user: req.session.user,
        isPaid: !!(await Transaction.findOne({ user: userId, type: 'deposit', status: 'completed' })),
        isWaitingConfirmation: !!(await Transaction.findOne({ user: userId, type: 'deposit', status: 'pending', tenantPaid: true })),
        currentCycleStart: ctx.currentCycleStart, rentDueDateLabel: ctx.rentDueDateLabel,
        totalPaidMonths: ctx.totalPaidMonths, contractMaxMonths: ctx.contractMaxMonths,
        showRedPing: ctx.showRedPing, validExtensions: ctx.validExtensions
    });
});

router.post('/update-occupants', isTenant, async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const parsedOccupants = parseInt(req.body.occupants);

        if (isNaN(parsedOccupants) || parsedOccupants < 1 || parsedOccupants > 4) {
            return res.redirect('/my-room');
        }

        await RentApplication.findOneAndUpdate(
            { user: userId },
            { $set: { occupants: parsedOccupants } },
            { sort: { createdAt: -1 } }
        );

        res.redirect('/my-room');
    } catch (err) { res.status(500).send('Error'); }
});

router.get('/view-contract', isTenant, async (req, res) => {
    const application = await RentApplication.findOne({ user: req.session.user._id || req.session.user.id }).sort({ createdAt: -1 });
    if (!application) return res.redirect('/home');
    const baseRent = application.roomRequested.match(/Room [I-N]/) ? 3500 : 4000;
    res.render('viewContract', { application: { ...application._doc, monthlyRent: baseRent }, hasRentedRoom: true, user: req.session.user });
});

router.post('/extend-lease', isTenant, async (req, res) => {
    const tenantProfile = await Tenant.findOne({ user: req.session.user._id || req.session.user.id, isArchived: false });
    if (tenantProfile) {
        tenantProfile.contactNo = `${tenantProfile.contactNo.split("EXT:")[0].trim()} EXT:${req.body.extendEndMonth}`;
        await tenantProfile.save();
    }
    res.redirect('/my-room');
});

router.post('/terminate-lease', isTenant, async (req, res) => {
    await Tenant.findOneAndUpdate({ user: req.session.user._id || req.session.user.id, isArchived: false }, { status: 'Pending Moveout' });
    res.redirect('/my-room');
});

router.get('/pay-bills', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const ctx = await getTenantBillingContext(userId);
    if (!ctx.application || ctx.application.status === 'archived' || ctx.application.status === 'rejected') return res.redirect('/home');

    const baseRent = ctx.application.roomRequested.match(/Room [I-N]/) ? 3500 : 4000;
    const actualBaseRent = ctx.canPayRent ? baseRent : 0;
    
    const isWaitingRentConfirmation = !!(await Transaction.findOne({ user: userId, type: 'rent', status: 'pending', tenantPaid: true }));
    const isWaitingUtilityConfirmation = !!(await Transaction.findOne({ user: userId, type: 'utilities', status: 'pending', tenantPaid: true }));

    res.render('payBills', { 
        application: ctx.application, 
        activeTenant: ctx.activeTenant,
        actualBaseRent, canPayRent: ctx.canPayRent, rentLockReason: ctx.rentLockReason, 
        isFullyBoarded: !!ctx.activeTenant, hasRentedRoom: true, user: req.session.user, 
        isWaitingConfirmation: !!(await Transaction.findOne({ user: userId, type: 'deposit', status: 'pending', tenantPaid: true })),
        isWaitingRentConfirmation,
        isWaitingUtilityConfirmation,
        utilityBills: ctx.utilityBills, currentPeriodLabel: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        rentDueDateLabel: ctx.rentDueDateLabel
    });
});

router.post('/pay-bills', isTenant, async (req, res) => {
    const { amount, paymentMethod } = req.body;
    const userId = req.session.user._id || req.session.user.id;
    const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });

    const ctx = await getTenantBillingContext(userId);
    let utilsTotal = ctx.utilityBills.reduce((sum, b) => sum + b.amount, 0);
    let inputAmount = parseFloat(amount);
    
    const calculatedStatus = paymentMethod === 'cash' ? 'pending' : 'completed';

    if (utilsTotal > 0 && inputAmount >= utilsTotal) {
        await new Transaction({
            user: userId, roomName: application.roomRequested, amount: utilsTotal,
            type: 'utilities', paymentMethod: paymentMethod, status: calculatedStatus, tenantPaid: true
        }).save();
        
        if (calculatedStatus === 'completed') {
            await Room.findOneAndUpdate(
                { roomName: application.roomRequested },
                { $set: { "utilities.isBilled": false } }
            );
            
            await new Announcement({
                title: "Utility Payment Successful! 🎉",
                body: `Your utility parameter payment of ₱${utilsTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} has been captured and validated seamlessly via ${paymentMethod.toUpperCase()}.`,
                tag: 'General', sendTo: 'Specific', targetUser: userId, status: 'sent'
            }).save();
        }
        inputAmount -= utilsTotal;
    }

    if (inputAmount > 0) {
        const activeTenant = await Tenant.findOne({ user: userId });
        const targetType = activeTenant ? 'rent' : 'deposit';

        await new Transaction({
            user: userId, roomName: application.roomRequested, amount: inputAmount, 
            type: targetType, paymentMethod: paymentMethod, status: calculatedStatus, tenantPaid: true
        }).save();

        if (calculatedStatus === 'completed') {
            await new Announcement({
                title: "Payment Completed Successfully! 🎉",
                body: `Your transaction of ₱${inputAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} for room ${targetType} was authorized and fully processed via ${paymentMethod.toUpperCase()}.`,
                tag: 'General', sendTo: 'Specific', targetUser: userId, status: 'sent'
            }).save();
        }

        if (targetType === 'deposit' && calculatedStatus === 'completed') {
            let room = await Room.findOne({ roomName: application.roomRequested });
            if (room) {
                room.isAvailable = false;
                room.currentTenant = userId;
                await room.save();
            }
            
            let sanitizedGender = 'Other';
            if (application.gender && application.gender.trim().toLowerCase() === 'male') sanitizedGender = 'Male';
            if (application.gender && application.gender.trim().toLowerCase() === 'female') sanitizedGender = 'Female';

            if (!activeTenant) {
                await new Tenant({ 
                    user: userId, suffix: application.suffix || '', gender: sanitizedGender, contactNo: application.contactNo, room: room ? room._id : null, status: 'Active', isArchived: false
                }).save();
            }
            application.status = 'accepted';
            await application.save();
        }
    }

    return res.json({ status: calculatedStatus, amount, method: paymentMethod });
});

router.get('/profile-settings', isTenant, async (req, res) => {
    const userId = req.session.user._id || req.session.user.id;
    const dbUser = await User.findById(userId);
    const tenantData = await Tenant.findOne({ user: userId, isArchived: false });
    const appData = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
    
    const isRealTenant = !!tenantData;
    const hasRentedRoom = !!(await RentApplication.findOne({ user: userId, status: { $in: ['accepted', 'pending', 'active'] } }));

    res.render('profileSettings', { 
        dbUser: { 
            ...dbUser._doc, 
            contactNo: isRealTenant ? (tenantData?.contactNo || '').split("EXT:")[0].trim() : (appData?.contactNo || ''), 
            suffix: isRealTenant ? (tenantData?.suffix || '') : (appData?.suffix || ''), 
            gender: isRealTenant ? (tenantData?.gender || '') : (appData?.gender || ''),
            documents: appData ? appData.documents : null
        }, 
        isRealTenant,
        successMessage: null, 
        errorMessage: null, 
        hasRentedRoom, 
        user: req.session.user 
    });
});

router.post('/profile-settings/update', isTenant, async (req, res) => {
    const { firstName, lastName, suffix, gender, contactNo } = req.body;
    const userId = req.session.user._id || req.session.user.id;
    
    const updatedUser = await User.findByIdAndUpdate(userId, { firstName: firstName.trim(), lastName: lastName.trim() }, { returnDocument: 'after' });
    req.session.user.first_name = updatedUser.firstName; 
    req.session.user.last_name = updatedUser.lastName;
    
    const tenantData = await Tenant.findOne({ user: userId, isArchived: false });
    if (tenantData) {
        tenantData.contactNo = contactNo.trim() + (tenantData.contactNo.includes("EXT:") ? " EXT:" + tenantData.contactNo.split("EXT:")[1] : "");
        tenantData.suffix = suffix.trim(); 
        tenantData.gender = gender;
        await tenantData.save();
    }
    res.redirect('/profile-settings');
});

router.post('/profile-settings/password', isTenant, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.user._id || req.session.user.id;
    const dbUser = await User.findById(userId);
    const bcrypt = require('bcryptjs');
    
    if (newPassword.length >= 8 && newPassword === confirmPassword && (await bcrypt.compare(currentPassword, dbUser.password))) {
        dbUser.password = newPassword; 
        await dbUser.save();
    }
    res.redirect('/profile-settings');
});

module.exports = router;