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
    destination: (req, file, cb) => {
        cb(null, './uploads/applications/');
    },
    filename: (req, file, cb) => {
        const lName = (req.body.lastName || 'User').replace(/[^a-zA-Z]/g, '');
        const fName = (req.body.firstName || 'Resident').replace(/[^a-zA-Z]/g, '');
        
        let documentType = 'Document';
        if (file.fieldname === 'validIdFrontFile') documentType = 'Front_ID';
        if (file.fieldname === 'validIdBackFile') documentType = 'Back_ID';
        if (file.fieldname === 'nbiFile') documentType = 'NBI_Clearance';
        
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${lName}-${fName}_${documentType}${ext}`);
    }
});
const upload = multer({ storage: storage });

const isTenant = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    next();
};

router.get('/home', isTenant, async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
        if (application && (application.status === 'accepted' || application.status === 'pending' || application.status === 'active')) {
            return res.redirect('/my-room');
        }

        const Room = require('../models/Room');
        const availableRoomsCount = await Room.countDocuments({ isAvailable: true });
        res.render('home', { availableRoomsCount, hasRentedRoom: false, user: req.session.user });
    } catch (err) {
        res.render('home', { availableRoomsCount: 0, hasRentedRoom: false, user: req.session.user });
    }
});

router.get('/preview', isTenant, async (req, res) => {
    try {
        const Room = require('../models/Room');
        const rooms = await Room.find({ isAvailable: true }).sort({ roomName: 1 });
        const userId = req.session.user._id || req.session.user.id;
        const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
        const hasRentedRoom = !!application;

        res.render('preview', { rooms, hasRentedRoom, user: req.session.user });
    } catch (err) {
        res.status(500).send('Error');
    }
});

router.get('/rent-application', isTenant, async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const existingApp = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
        if (existingApp) {
            return res.redirect('/my-room');
        }
        const roomSelection = req.query.room || 'Room A';
        res.render('rentApplication', { roomSelection, user: req.session.user, hasRentedRoom: false });
    } catch (err) {
        res.redirect('/home');
    }
});

router.post('/rent-application', isTenant, upload.fields([
    { name: 'validIdFrontFile', maxCount: 1 },
    { name: 'validIdBackFile', maxCount: 1 },
    { name: 'nbiFile', maxCount: 1 }
]), async (req, res) => {
    const { firstName, lastName, suffix, gender, contactNo, occupants, monthsOfRent, roomRequested } = req.body;
    try {
        const userId = req.session.user._id || req.session.user.id;
        const newApplication = new RentApplication({
            user: userId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            suffix: suffix.trim(),
            gender,
            contactNo: contactNo.trim(),
            occupants: parseInt(occupants),
            monthsOfRent: parseInt(monthsOfRent),
            roomRequested: roomRequested,
            documents: {
                validIdFrontPath: req.files['validIdFrontFile'][0].path.replace(/\\/g, '/'),
                validIdBackPath: req.files['validIdBackFile'][0].path.replace(/\\/g, '/'),
                nbiClearancePath: req.files['nbiFile'][0].path.replace(/\\/g, '/')
            }
        });
        await newApplication.save();
        res.redirect('/my-room');
    } catch (err) {
        res.status(500).send('Error');
    }
});

// PARSES MONTH LABELS DYNAMICALLY AND INJECTS THE ENFORCED 17TH BINDING DAY
router.get('/my-room', isTenant, async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
        if (!application) return res.redirect('/preview');
        
        const completedTx = await Transaction.findOne({ user: userId, type: 'deposit', status: 'completed' });
        const pendingTx = await Transaction.findOne({ user: userId, type: 'deposit', status: 'pending' });

        const tenantProfile = await Tenant.findOne({ user: userId });
        
        let contractEndDateLabel = "02 / 16 / 2027";
        if (tenantProfile && tenantProfile.contactNo && tenantProfile.contactNo.includes("EXT:")) {
            const rawSavedMonth = tenantProfile.contactNo.split("EXT:")[1]; // returns "YYYY-MM"
            const monthParts = rawSavedMonth.split("-");
            if (monthParts.length === 2) {
                // Pin the display output cleanly to the 17th day threshold of that month
                contractEndDateLabel = `${monthParts[1]} / 17 / ${monthParts[0]}`;
            }
        }

        res.render('myRoom', { 
            application, 
            hasRentedRoom: true, 
            user: req.session.user,
            isPaid: !!completedTx,
            isWaitingConfirmation: !!pendingTx,
            contractEndDateLabel
        });
    } catch (err) {
        res.status(500).send('Server error');
    }
});

router.get('/view-contract', isTenant, async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
        if (!application) return res.redirect('/home');

        const baseRent = application.roomRequested.includes('Room I') || application.roomRequested.includes('Room J') || 
                         application.roomRequested.includes('Room K') || application.roomRequested.includes('Room L') || 
                         application.roomRequested.includes('Room M') || application.roomRequested.includes('Room N') ? 3500 : 4000;

        const safeApplicationObj = { ...application._doc, monthlyRent: baseRent };
        res.render('viewContract', { application: safeApplicationObj, hasRentedRoom: true, user: req.session.user });
    } catch (err) {
        res.status(500).send('Error');
    }
});

router.get('/pay-bills', isTenant, async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
        if (!application) return res.redirect('/home');

        const baseRent = application.roomRequested.includes('Room I') || application.roomRequested.includes('Room J') || 
                         application.roomRequested.includes('Room K') || application.roomRequested.includes('Room L') || 
                         application.roomRequested.includes('Room M') || application.roomRequested.includes('Room N') ? 3500 : 4000;

        const pendingTx = await Transaction.findOne({ user: userId, status: 'pending', type: 'deposit' });
        const isWaitingConfirmation = !!pendingTx;

        const activeTenant = await Tenant.findOne({ user: userId });
        const utilityBills = await Transaction.find({ user: userId, status: 'pending', type: 'utilities' });
        
        const today = new Date();
        const currentPeriodLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        const targetDue = new Date(today.getFullYear(), today.getMonth() + 1, 17);
        const rentDueDateLabel = targetDue.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        res.render('payBills', { 
            application, 
            baseRent, 
            isFullyBoarded: !!activeTenant, 
            hasRentedRoom: true, 
            user: req.session.user, 
            isWaitingConfirmation,
            utilityBills,
            currentPeriodLabel,
            rentDueDateLabel
        });
    } catch (err) {
        res.status(500).send('Error');
    }
});

router.post('/pay-bills', isTenant, async (req, res) => {
    const { amount, paymentMethod } = req.body;
    try {
        const userId = req.session.user._id || req.session.user.id;
        const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
        if (!application) return res.status(404).json({ error: 'Application not found' });

        const initialTxStatus = paymentMethod === 'cash' ? 'pending' : 'completed';

        const newPaymentTx = new Transaction({
            user: userId,
            roomName: application.roomRequested,
            amount: parseFloat(amount),
            type: 'deposit',
            paymentMethod: paymentMethod,
            status: initialTxStatus
        });
        await newPaymentTx.save();

        if (initialTxStatus === 'completed') {
            const Room = require('../models/Room');
            const room = await Room.findOne({ roomName: application.roomRequested });
            
            const tenantExists = await Tenant.findOne({ user: userId });
            if (!tenantExists) {
                const newTenantProfile = new Tenant({
                    user: userId,
                    suffix: application.suffix || '',
                    gender: application.gender || 'Other',
                    contactNo: application.contactNo,
                    room: room ? room._id : null
                });
                await newTenantProfile.save();
            }
        }

        return res.json({ status: initialTxStatus, amount: amount, method: paymentMethod });
    } catch (err) {
        console.error("Payment registration failure detail log:", err);
        return res.status(500).json({ error: 'Failed execution due to mapping issues.' });
    }
});

// CAPTURES THE YYYY-MM SELECTION PAYLOAD AND SAFELY WRITES IT TO THE LEASE ACCOUNT PROFILE
router.post('/extend-lease', isTenant, async (req, res) => {
    const { extendEndMonth } = req.body; // Receives selected string: "YYYY-MM"
    try {
        const userId = req.session.user._id || req.session.user.id;
        
        const tenantProfile = await Tenant.findOne({ user: userId });
        if (tenantProfile) {
            const baseContact = tenantProfile.contactNo.split("EXT:")[0].trim();
            tenantProfile.contactNo = `${baseContact} EXT:${extendEndMonth}`;
            await tenantProfile.save();
        }
        
        res.redirect('/my-room');
    } catch (err) {
        console.error("Lease extension month submission error:", err);
        res.redirect('/my-room');
    }
});

router.post('/terminate-lease', isTenant, async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        
        await Tenant.findOneAndUpdate(
            { user: userId },
            { $set: { status: 'Pending Moveout' } },
            { returnDocument: 'after' }
        );
        
        res.redirect('/my-room');
    } catch (err) {
        console.error("Tenancy termination dispatch fault:", err);
        res.redirect('/my-room');
    }
});

//==================================================
// USER PROFILE SETTINGS MANAGEMENT
//==================================================
router.get('/profile-settings', isTenant, async (req, res) => {
    try {
        const userId = req.session.user._id || req.session.user.id;
        const dbUser = await User.findById(userId);
        if (!dbUser) return res.render('profileSettings', { dbUser: {}, successMessage: null, errorMessage: 'Error', hasRentedRoom: false, user: req.session.user });
        const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
        const tenantData = await Tenant.findOne({ user: userId });
        res.render('profileSettings', { dbUser: { ...dbUser._doc, suffix: tenantData?.suffix || '', gender: tenantData?.gender || '', contactNo: (tenantData?.contactNo || '').split("EXT:")[0].trim() }, successMessage: null, errorMessage: null, hasRentedRoom: !!application, user: req.session.user });
    } catch (err) {
        res.render('profileSettings', { dbUser: {}, successMessage: null, errorMessage: 'Error', hasRentedRoom: false, user: req.session.user });
    }
});

router.post('/profile-settings/update', isTenant, async (req, res) => {
    const { firstName, lastName, suffix, gender, contactNo } = req.body;
    try {
        const userId = req.session.user._id || req.session.user.id;
        const updatedUser = await User.findByIdAndUpdate(userId, { firstName: firstName.trim(), lastName: lastName.trim() }, { returnDocument: 'after' });
        req.session.user.first_name = updatedUser.firstName;
        req.session.user.last_name = updatedUser.lastName;
        const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
        
        const tenantData = await Tenant.findOne({ user: userId });
        if (tenantData) {
            const currentExt = tenantData.contactNo.includes("EXT:") ? " EXT:" + tenantData.contactNo.split("EXT:")[1] : "";
            tenantData.suffix = suffix.trim();
            tenantData.gender = gender;
            tenantData.contactNo = contactNo.trim() + currentExt;
            await tenantData.save();
        }
        res.render('profileSettings', { dbUser: { ...updatedUser._doc, suffix: suffix.trim(), gender, contactNo: contactNo.trim() }, successMessage: 'Success!', errorMessage: null, hasRentedRoom: !!application, user: req.session.user });
    } catch (err) {
        res.redirect('/profile-settings');
    }
});

router.post('/profile-settings/password', isTenant, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    try {
        const userId = req.session.user._id || req.session.user.id;
        const dbUser = await User.findById(userId);
        const application = await RentApplication.findOne({ user: userId }).sort({ createdAt: -1 });
        const bcrypt = require('bcryptjs');

        if (newPassword.length < 8 || newPassword !== confirmPassword || !(await bcrypt.compare(currentPassword, dbUser.password))) {
            return res.render('profileSettings', { dbUser, successMessage: null, errorMessage: 'Validation failure issues.', hasRentedRoom: !!application, user: req.session.user });
        }

        dbUser.password = newPassword;
        await dbUser.save();
        res.render('profileSettings', { dbUser, successMessage: 'Password updated successfully!', errorMessage: null, hasRentedRoom: !!application, user: req.session.user });
    } catch (err) {
        res.redirect('/profile-settings');
    }
});

module.exports = router;