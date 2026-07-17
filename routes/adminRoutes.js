const express = require('express');
const router = express.Router();
const RentApplication = require('../models/RentApplication');
const Tenant = require('../models/Tenant');
const Room = require('../models/Room');
const User = require('../models/User');
const Announcement = require('../models/Announcement');
const Transaction = require('../models/Transaction');

//Authentication gateway middleware barrier for administrators
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.redirect('/login');
};

//Render admin dashboard metrics
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const totalRooms = await Room.countDocuments();
        const occupiedRooms = await Room.countDocuments({ isAvailable: false });
        const vacantRooms = await Room.countDocuments({ isAvailable: true });
        const activeTenants = await Tenant.countDocuments();

        const occupiedRoomDetails = await Room.find({ isAvailable: false });
        const totalRevenue = occupiedRoomDetails.reduce((sum, room) => sum + room.price, 0);
        const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

        const stats = {
            totalRevenue,
            activeTenants,
            occupancyRate,
            openMaintenance: 0,
            occupiedUnits: occupiedRooms,
            vacantUnits: vacantRooms
        };

        const chartData = [
            { month: 'Jan', percentage: 45 }, { month: 'Feb', percentage: 60 },
            { month: 'Mar', percentage: 75 }, { month: 'Apr', percentage: 90 },
            { month: 'May', percentage: 80 }, { month: 'Jun', percentage: 95 }
        ];

        res.render('admin/dashboard', { stats, chartData });
    } catch (err) {
        res.status(500).send('Server error');
    }
});

//Render admin application management portal
router.get('/applications', isAdmin, async (req, res) => {
    try {
        const applications = await RentApplication.find({ status: 'pending' }).sort({ createdAt: -1 });
        res.render('admin/applications', { applications });
    } catch (err) {
        res.status(500).send('Error');
    }
});

//Dynamic room inventory setup pulling existing utility payments to pre-fill editor forms
router.get('/rooms', isAdmin, async (req, res) => {
    try {
        const rooms = await Room.find().sort({ roomName: 1 });
        
        const units = await Promise.all(rooms.map(async (r) => {
            const isThirdFloor = r.roomName.includes('Room I') || r.roomName.includes('Room J') || 
                                r.roomName.includes('Room K') || r.roomName.includes('Room L') || 
                                r.roomName.includes('Room M') || r.roomName.includes('Room N');
            
            let electricityCost = 0;
            let waterCost = 0;
            
            if (!r.isAvailable && r.currentTenant) {
                const existingElectricity = await Transaction.findOne({ user: r.currentTenant, roomName: r.roomName, status: 'pending', type: 'utilities', paymentMethod: 'bank' });
                const existingWater = await Transaction.findOne({ user: r.currentTenant, roomName: r.roomName, status: 'pending', type: 'utilities', paymentMethod: 'gcash' });
                
                if (existingElectricity) electricityCost = existingElectricity.amount;
                if (existingWater) waterCost = existingWater.amount;
            }

            return {
                roomName: r.roomName.replace('Room ', ''),
                status: r.isAvailable ? 'vacant' : 'active',
                monthlyRent: isThirdFloor ? 3500 : 4000,
                electricity: electricityCost,
                water: waterCost
            };
        }));

        res.render('admin/units', { units });
    } catch (err) {
        res.status(500).send('Error');
    }
});

router.get('/units', isAdmin, async (req, res) => {
    res.redirect('/admin/rooms');
});

//UPDATES OR CREATES UTILITY RECOGNITIONS CLEANLY PREVENTING COLLECTION DUPLICATIONS
router.post('/rooms/setup-utilities', isAdmin, async (req, res) => {
    const { roomName, electricity, water } = req.body;
    try {
        const room = await Room.findOne({ roomName: `Room ${roomName}` });
        if (room && room.currentTenant) {
            // Check and update existing electricity parameters cleanly using returnDocument to avoid warnings
            await Transaction.findOneAndUpdate(
                { user: room.currentTenant, roomName: `Room ${roomName}`, status: 'pending', type: 'utilities', paymentMethod: 'bank' },
                { amount: parseFloat(electricity) },
                { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
            );

            // Check and update existing water parameters cleanly using returnDocument to avoid warnings
            await Transaction.findOneAndUpdate(
                { user: room.currentTenant, roomName: `Room ${roomName}`, status: 'pending', type: 'utilities', paymentMethod: 'gcash' },
                { amount: parseFloat(water) },
                { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
            );
        }
        res.redirect('/admin/rooms');
    } catch (err) {
        console.error("Utility updates process tracking crash:", err);
        res.status(500).send('Error setting utilities');
    }
});

//Load transaction histories inside the payment ledger
router.get('/payments', isAdmin, async (req, res) => {
    try {
        const historyLogs = await Transaction.find().populate('user').sort({ createdAt: -1 });
        const payments = historyLogs.map(tx => ({
            id: tx._id,
            user: tx.user || { firstName: 'System', lastName: 'Record' },
            roomName: tx.roomName.replace('Room ', ''),
            amountPaid: tx.amount,
            billingType: tx.type,
            method: tx.paymentMethod === 'cash' ? 'Cash on Hand' : tx.paymentMethod.toUpperCase(),
            status: tx.status,
            date: tx.createdAt ? tx.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'
        }));
        res.render('admin/payments', { payments });
    } catch (err) {
        res.status(500).send('Error');
    }
});

//FIXED CRASH-PROOFED ADMINISTRATIVE MANUAL SIGN OFF VALIDATION LOGIC FOR CASH DEPOSITS
router.post('/payments/:id/confirm', isAdmin, async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).send('Transaction record not found.');

        transaction.status = 'completed';
        await transaction.save();

        const application = await RentApplication.findOne({ user: transaction.user }).sort({ createdAt: -1 });

        if (application) {
            application.status = 'accepted'; 
            await application.save();

            let room = await Room.findOne({ roomName: application.roomRequested });
            if (!room) {
                room = await Room.findOne({ roomName: `Room ${application.roomRequested}` });
            }

            const tenantExists = await Tenant.findOne({ user: transaction.user });
            if (!tenantExists) {
                const newTenantProfile = new Tenant({
                    user: transaction.user,
                    suffix: application.suffix || '',
                    gender: application.gender || 'Other',
                    contactNo: application.contactNo,
                    room: room ? room._id : null
                });
                await newTenantProfile.save();
            }
        }

        res.redirect('/admin/payments');
    } catch (err) {
        res.status(500).send('Error');
    }
});

//Render announcement broadcasting compose interface
router.get('/announcements', isAdmin, (req, res) => {
    res.render('admin/announcements');
});

//Process notice creation broadcasts to all tenant applications
router.post('/announcements', isAdmin, async (req, res) => {
    const { title, body } = req.body;
    try {
        const newAnnouncement = new Announcement({
            title: title.trim(),
            body: body.trim(),
            status: 'sent'
        });
        await newAnnouncement.save();
        res.redirect('/admin/announcements');
    } catch (err) {
        res.status(500).send('Error');
    }
});

//Render maintenance tickets dashboard view
router.get('/tickets', isAdmin, (req, res) => {
    res.render('admin/tickets', { tickets: [] });
});

//Render financial report summaries page
router.get('/reports', isAdmin, async (req, res) => {
    try {
        const occupiedRoomDetails = await Room.find({ isAvailable: false });
        const totalRevenue = occupiedRoomDetails.reduce((sum, room) => sum + room.price, 0);
        res.render('admin/reports', { stats: { totalRevenue } });
    } catch (err) {
        res.status(500).send('Error');
    }
});

//Render active tenant roster
router.get('/tenants', isAdmin, async (req, res) => {
    try {
        const activeProfiles = await Tenant.find().populate('user').populate('room');
        const tenants = activeProfiles.map(t => ({
            user: t.user || { firstName: 'Incomplete', lastName: 'Record' },
            roomName: t.room ? t.room.roomName.replace('Room ', '') : 'N/A',
            contactNo: t.contactNo,
            status: 'Active'
        }));
        res.render('admin/tenants', { tenants });
    } catch (err) {
        res.status(500).send('Error');
    }
});

//Process acceptance of pending rental applications
router.post('/applications/:id/accept', isAdmin, async (req, res) => {
    try {
        const appRecord = await RentApplication.findById(req.params.id);
        if (!appRecord) return res.status(404).send('Not found');

        const room = await Room.findOne({ roomName: appRecord.roomRequested });
        if (!room || !room.isAvailable) return res.status(400).send('Unavailable');

        room.isAvailable = false;
        room.currentTenant = appRecord.user;
        await room.save();

        appRecord.status = 'accepted';
        await appRecord.save();

        res.redirect('/admin/applications');
    } catch (err) {
        res.status(500).send('Error');
    }
});

module.exports = router;