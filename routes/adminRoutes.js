const express = require('express');
const router = express.Router();
const RentApplication = require('../models/RentApplication');
const Tenant = require('../models/Tenant');
const Room = require('../models/Room');
const User = require('../models/User');
const Announcement = require('../models/Announcement');
const Transaction = require('../models/Transaction');

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.redirect('/login');
};

// Global Middleware for Sidebar Badges
router.use(async (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        res.locals.pendingMoveoutCount = await Tenant.countDocuments({ status: 'Pending Moveout', isArchived: false });
        res.locals.pendingAppsCount = await RentApplication.countDocuments({ status: 'pending' });
        res.locals.pendingPaymentsCount = await Transaction.countDocuments({ status: 'pending', tenantPaid: true });
    }
    next();
});

// ==================================================
// DASHBOARD
// ==================================================
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const { timeframe, filterYear, filterMonth } = req.query;
        let txMatchQuery = { status: 'completed' };

        if (timeframe === 'month' && filterYear && filterMonth) {
            txMatchQuery.createdAt = { 
                $gte: new Date(filterYear, filterMonth - 1, 1), 
                $lte: new Date(filterYear, filterMonth, 0, 23, 59, 59) 
            };
        } else if (timeframe === 'year' && filterYear) {
            txMatchQuery.createdAt = { 
                $gte: new Date(filterYear, 0, 1), 
                $lte: new Date(filterYear, 11, 31, 23, 59, 59) 
            };
        }

        const filteredTransactions = await Transaction.find(txMatchQuery);
        const totalRevenue = filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0);

        const totalRooms = await Room.countDocuments();
        const occupiedRooms = await Room.countDocuments({ isAvailable: false });
        const vacantRooms = await Room.countDocuments({ isAvailable: true });
        
        const stats = {
            totalRevenue,
            activeTenants: await Tenant.countDocuments({ isArchived: false }),
            occupancyRate: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
            occupiedUnits: occupiedRooms,
            vacantUnits: vacantRooms,
            pendingApps: res.locals.pendingAppsCount,
            acceptedApps: await RentApplication.countDocuments({ status: 'accepted' }),
            rejectedApps: await RentApplication.countDocuments({ status: 'rejected' }),
            pendingPayments: res.locals.pendingPaymentsCount,
            completedPayments: await Transaction.countDocuments({ status: 'completed' })
        };

        const currentYear = (timeframe === 'year' && filterYear) ? parseInt(filterYear) : new Date().getFullYear();
        const yearTransactions = await Transaction.find({ 
            status: 'completed', 
            createdAt: { $gte: new Date(currentYear, 0, 1), $lte: new Date(currentYear, 11, 31, 23, 59, 59) } 
        });
        
        const monthlyTotals = Array(12).fill(0);
        yearTransactions.forEach(tx => monthlyTotals[tx.createdAt.getMonth()] += tx.amount);

        res.render('admin/dashboard', { stats, monthlyTotals, timeframe, filterYear, filterMonth, currentYear });
    } catch (err) { res.status(500).send('Server error'); }
});

// ==================================================
// PAYMENTS & LEDGER
// ==================================================
router.get('/payments', isAdmin, async (req, res) => {
    try {
        const { timeframe, filterYear, filterMonth, sortOrder } = req.query;
        let query = {};
        if (timeframe === 'month' && filterYear && filterMonth) {
            query.createdAt = { $gte: new Date(filterYear, filterMonth - 1, 1), $lte: new Date(filterYear, filterMonth, 0, 23, 59, 59) };
        } else if (timeframe === 'year' && filterYear) {
            query.createdAt = { $gte: new Date(filterYear, 0, 1), $lte: new Date(filterYear, 11, 31, 23, 59, 59) };
        }

        const historyLogs = await Transaction.find(query).populate('user').sort({ createdAt: sortOrder === 'asc' ? 1 : -1 });
        const payments = historyLogs.map(tx => ({
            id: tx._id, user: tx.user || { firstName: 'System', lastName: 'Record' }, roomName: tx.roomName.replace('Room ', ''),
            amountPaid: tx.amount, billingType: tx.type, method: tx.paymentMethod.toUpperCase(), status: tx.status,
            tenantPaid: tx.tenantPaid, date: tx.createdAt.toLocaleDateString()
        }));
        res.render('admin/payments', { payments, timeframe, filterYear, filterMonth, sortOrder });
    } catch (err) { res.status(500).send('Error'); }
});

router.post('/payments/:id/confirm', isAdmin, async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id);
        if (transaction) {
            transaction.status = 'completed'; 
            transaction.tenantPaid = true;
            await transaction.save();
            
            let notificationTitle = "Payment Confirmed! 💰";
            let notificationBody = `Your payment of ₱${transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} for ${transaction.type} has been successfully received and verified by management. Thank you!`;

            if (transaction.type === 'utilities') {
                // FIXED: Keep the electricity and water digits stored so they don't reset to 0 in uneditable state
                await Room.findOneAndUpdate(
                    { roomName: transaction.roomName },
                    { $set: { "utilities.isBilled": false } }
                );
                notificationTitle = "Utility Settlement Confirmed! ⚡";
                notificationBody = `Your utility bills for ${transaction.roomName} have been cleared and confirmed by administration.`;
            }

            await new Announcement({
                title: notificationTitle,
                body: notificationBody,
                tag: 'General',
                sendTo: 'Specific',
                targetUser: transaction.user,
                status: 'sent'
            }).save();

            const application = await RentApplication.findOne({ user: transaction.user }).sort({ createdAt: -1 });
            if (application) {
                application.status = 'accepted'; await application.save();
                let room = await Room.findOne({ roomName: application.roomRequested }) || await Room.findOne({ roomName: `Room ${application.roomRequested}` });
                if (!(await Tenant.findOne({ user: transaction.user }))) {
                    await new Tenant({ user: transaction.user, suffix: application.suffix || '', gender: application.gender || 'Other', contactNo: application.contactNo, room: room ? room._id : null }).save();
                }
            }
        }
        res.redirect('/admin/payments');
    } catch (err) { res.status(500).send('Error'); }
});

// ==================================================
// UNITS & ROOMS
// ==================================================
router.get('/rooms', isAdmin, async (req, res) => {
    try {
        const rooms = await Room.find().sort({ roomName: 1 });
        const units = await Promise.all(rooms.map(async (r) => {
            let nextDeadline = "N/A";
            let tenantName = "Vacant";
            let occupantsCount = 0;
            let isUtilityPaidThisMonth = false;

            if (!r.isAvailable && r.currentTenant) {
                const tenantUser = await User.findById(r.currentTenant);
                if (tenantUser) tenantName = `${tenantUser.firstName} ${tenantUser.lastName}`;

                const rentApp = await RentApplication.findOne({ user: r.currentTenant }).sort({ createdAt: -1 });
                if (rentApp) occupantsCount = rentApp.occupants;
                
                const firstPay = await Transaction.findOne({ user: r.currentTenant, type: 'deposit', status: 'completed' }).sort({ createdAt: 1 });
                if (firstPay) {
                    const bDay = firstPay.createdAt.getDate();
                    const today = new Date();
                    let nextDue = new Date(today.getFullYear(), today.getMonth(), bDay);
                    if (today.getTime() > nextDue.getTime()) nextDue.setMonth(nextDue.getMonth() + 1);
                    nextDeadline = nextDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                }

                const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
                const completeUtilityTx = await Transaction.findOne({
                    user: r.currentTenant,
                    roomName: r.roomName,
                    type: 'utilities',
                    status: 'completed',
                    createdAt: { $gte: startOfMonth }
                });
                if (completeUtilityTx) isUtilityPaidThisMonth = true;
            }
            return { 
                roomName: r.roomName.replace('Room ', ''), 
                status: r.isAvailable ? 'vacant' : 'active', 
                monthlyRent: r.price, 
                electricity: r.utilities?.electricity || 0, 
                water: r.utilities?.water || 0, 
                isBilled: r.utilities?.isBilled || false,
                isPaidThisMonth: isUtilityPaidThisMonth,
                deadline: nextDeadline,
                tenantName,
                occupants: occupantsCount
            };
        }));
        res.render('admin/units', { units });
    } catch (err) { res.status(500).send('Error'); }
});

router.post('/rooms/update-price', isAdmin, async (req, res) => {
    const { roomName, baseRent } = req.body;
    try {
        await Room.findOneAndUpdate({ roomName: `Room ${roomName}` }, { price: parseFloat(baseRent) });
        res.redirect('/admin/rooms');
    } catch (err) { res.status(500).send('Error'); }
});

router.post('/rooms/send-utility-invoice', isAdmin, async (req, res) => {
    const { roomName, electricity, water } = req.body;
    try {
        const room = await Room.findOne({ roomName: `Room ${roomName}` });
        if (room && room.currentTenant) {
            room.utilities = {
                electricity: parseFloat(electricity || 0),
                water: parseFloat(water || 0),
                isBilled: true
            };
            await room.save();

            await new Announcement({
                title: "New Utility Statement Issued ⚡",
                body: `Your utility details for Room ${roomName} have been processed. Electricity: ₱${parseFloat(electricity).toLocaleString()} | Water: ₱${parseFloat(water).toLocaleString()}. Please settle your balances on your statement ledger tab.`,
                tag: 'Reminder',
                sendTo: 'Specific',
                targetUser: room.currentTenant,
                status: 'sent'
            }).save();
        }
        res.redirect('/admin/rooms');
    } catch (err) { res.status(500).send('Error'); }
});

// ==================================================
// ANNOUNCEMENTS
// ==================================================
router.get('/announcements', isAdmin, async (req, res) => {
    const { targetFilter } = req.query;
    const announcements = await Announcement.find(targetFilter && targetFilter !== 'All' ? { sendTo: targetFilter } : {}).sort({ createdAt: -1 });
    res.render('admin/announcements', { announcements, targetFilter });
});

router.post('/announcements', isAdmin, async (req, res) => {
    await new Announcement({ ...req.body, status: 'sent', sendTo: req.body.sendTo || 'All' }).save();
    res.redirect('/admin/announcements');
});

router.post('/announcements/:id/edit', isAdmin, async (req, res) => {
    await Announcement.findByIdAndUpdate(req.params.id, { ...req.body, sendTo: req.body.sendTo || 'All' });
    res.redirect('/admin/announcements');
});

router.post('/announcements/:id/delete', isAdmin, async (req, res) => {
    await Announcement.findByIdAndDelete(req.params.id);
    res.redirect('/admin/announcements');
});

// ==================================================
// TENANTS, PAST TENANTS, AND SPECIFIC HISTORY
// ==================================================
router.get('/tenants', isAdmin, async (req, res) => {
    const activeProfiles = await Tenant.find({ isArchived: false }).populate('user').populate('room');
    const tenants = activeProfiles.map(t => ({
        id: t._id, 
        userId: t.user ? t.user._id : null,
        user: t.user || { firstName: 'Incomplete', lastName: 'Record' },
        roomName: t.room ? t.room.roomName.replace('Room ', '') : 'N/A',
        contactNo: t.contactNo, status: t.status
    }));
    res.render('admin/tenants', { tenants });
});

router.post('/tenants/:id/archive', isAdmin, async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (tenant) {
        if (tenant.room) await Room.findByIdAndUpdate(tenant.room, { isAvailable: true, currentTenant: null });
        tenant.isArchived = true; tenant.status = 'Archived'; tenant.room = null;
        await tenant.save();
    }
    res.redirect('/admin/tenants');
});

router.get('/past-tenants', isAdmin, async (req, res) => {
    const archivedProfiles = await Tenant.find({ isArchived: true }).populate('user');
    const pastTenants = await Promise.all(archivedProfiles.map(async (t) => {
        const userHistory = await Transaction.find({ user: t.user._id, status: 'completed' });
        const totalPaid = userHistory.reduce((sum, tx) => sum + tx.amount, 0);
        return { 
            userId: t.user ? t.user._id : null,
            user: t.user || { firstName: 'Deleted', lastName: 'User' }, 
            contactNo: t.contactNo.split("EXT:")[0].trim(), 
            totalPaid: totalPaid, 
            archivedDate: t.createdAt.toLocaleDateString() 
        };
    }));
    res.render('admin/pastTenants', { pastTenants });
});

router.get('/tenants/:userId/history', isAdmin, async (req, res) => {
    try {
        const tenantUser = await User.findById(req.params.userId);
        if (!tenantUser) return res.status(404).send('User not found');
        
        const historyLogs = await Transaction.find({ user: req.params.userId }).sort({ createdAt: -1 });
        const payments = historyLogs.map(tx => ({
            id: tx._id,
            roomName: tx.roomName.replace('Room ', ''),
            amountPaid: tx.amount,
            billingType: tx.type,
            method: tx.paymentMethod.toUpperCase(),
            status: tx.status,
            date: tx.createdAt ? tx.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'
        }));

        res.render('admin/tenantHistory', { tenantUser, payments });
    } catch (err) { res.status(500).send('Error'); }
});

// ==================================================
// APPLICATIONS
// ==================================================
router.get('/applications', isAdmin, async (req, res) => {
    const applications = await RentApplication.find({ status: 'pending' }).sort({ createdAt: -1 });
    res.render('admin/applications', { applications });
});

router.post('/applications/:id/accept', isAdmin, async (req, res) => {
    try {
        const appRecord = await RentApplication.findById(req.params.id);
        if (appRecord) {
            const room = await Room.findOne({ roomName: appRecord.roomRequested });
            if (room && room.isAvailable) {
                room.isAvailable = false; 
                room.currentTenant = appRecord.user; 
                await room.save();
                
                appRecord.status = 'accepted'; 
                await appRecord.save();
                
                await new Announcement({
                    title: "Application Approved! 🎉",
                    body: `Congratulations! Your rental application for ${appRecord.roomRequested} has been successfully validated. Please proceed to your dashboard to settle your advance deposit and unlock your room parameters.`,
                    tag: 'Urgent', sendTo: 'Specific', targetUser: appRecord.user, status: 'sent'
                }).save();

                const conflictingApplications = await RentApplication.find({
                    _id: { $ne: appRecord._id },
                    roomRequested: appRecord.roomRequested,
                    status: 'pending'
                });

                for (let conflictApp of conflictingApplications) {
                    conflictApp.status = 'rejected';
                    await conflictApp.save();

                    await new Announcement({
                        title: "Application Status Update ℹ️",
                        body: `Thank you for your interest in ${conflictApp.roomRequested}. We regret to inform you that another applicant has been accepted for this space. Please review our available listings grid to submit a fresh request for another unit.`,
                        tag: 'General',
                        sendTo: 'Specific',
                        targetUser: conflictApp.user,
                        status: 'sent'
                    }).save();
                }
            }
        }
        res.redirect('/admin/applications');
    } catch (err) { res.status(500).send('Error'); }
});

router.post('/applications/:id/reject', isAdmin, async (req, res) => {
    try {
        const { rejectionReason } = req.body;
        const appRecord = await RentApplication.findById(req.params.id);
        
        if (appRecord) {
            appRecord.status = 'rejected';
            await appRecord.save();

            const finalReasonMessage = rejectionReason && rejectionReason.trim() ? rejectionReason.trim() : "We regret to inform you that your rental application details could not be validated at this time. Please check your identification papers and submit a new request if needed.";

            await new Announcement({
                title: "Application Not Approved ❌",
                body: `Update for your ${appRecord.roomRequested} application: ${finalReasonMessage}`,
                tag: 'General',
                sendTo: 'Specific',
                targetUser: appRecord.user,
                status: 'sent'
            }).save();
        }
        res.redirect('/admin/applications');
    } catch (err) { res.status(500).send('Error rejecting application'); }
});

module.exports = router;