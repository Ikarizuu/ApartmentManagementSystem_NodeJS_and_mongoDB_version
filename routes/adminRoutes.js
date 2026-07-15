const express = require('express');
const router = express.Router();
const RentApplication = require('../models/RentApplication');
const Announcement = require('../models/Announcement');

//Admin session checkpoint validation middleware
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    res.redirect('/login');
};

//Render operational tracking dashboards and total calculations
router.get('/dashboard', isAdmin, async (req, res) => {
    try {
        const activeLeases = await RentApplication.find({ status: 'active' });
        const totalRevenue = activeLeases.reduce((sum, app) => sum + app.monthlyRent, 0);
        
        const stats = {
            totalRevenue,
            activeTenants: activeLeases.length,
            occupiedUnits: activeLeases.length,
            vacantUnits: Math.max(0, 15 - activeLeases.length),
            occupancyRate: Math.round((activeLeases.length / 15) * 100),
            openMaintenance: 2 //Mock metric parameter assignment
        };

        const chartData = [
            { month: 'Mar', percentage: 70 },
            { month: 'Apr', percentage: 85 },
            { month: 'May', percentage: stats.occupancyRate }
        ];

        res.render('admin/dashboard', { stats, chartData });
    } catch (err) {
        res.status(500).send('Server dashboard execution fault');
    }
});

//Render unit metrics inventory properties
router.get('/units', isAdmin, async (req, res) => {
    try {
        const applications = await RentApplication.find().populate('user');
        res.render('admin/units', { units: applications });
    } catch (err) {
        res.status(500).send('Server units loading fault');
    }
});

//Render active tenant profiles directory registries
router.get('/tenants', isAdmin, async (req, res) => {
    try {
        const tenants = await RentApplication.find({ status: 'active' }).populate('user');
        res.render('admin/tenants', { tenants });
    } catch (err) {
        res.status(500).send('Server tenants tracking failure');
    }
});

//Render financial dues validation records logs
router.get('/payments', isAdmin, async (req, res) => {
    try {
        const payments = await RentApplication.find().populate('user');
        res.render('admin/payments', { payments });
    } catch (err) {
        res.status(500).send('Server payments tracking failure');
    }
});

//Render maintenance tasks groupings
router.get('/maintenance', isAdmin, async (req, res) => {
    //Static task documents matching system parameters mapping
    const tickets = [
        { issueCategory: 'Plumbing', urgency: 'High', description: 'Leaking faucet in bathroom sink causing puddles.', roomName: 'C' },
        { issueCategory: 'Electrical', urgency: 'Medium', description: 'Ceiling light flickered and died in bedroom.', roomName: 'F' }
    ];
    res.render('admin/maintenance', { tickets });
});

//Render announcement histories list
router.get('/announcements', isAdmin, async (req, res) => {
    res.render('admin/announcements');
});

//Process new management message broadcast creations
router.post('/announcements', isAdmin, async (req, res) => {
    const { title, body } = req.body;
    try {
        const newNotice = new Announcement({
            title,
            body,
            tag: 'General',
            status: 'sent',
            channels: ['in-app']
        });
        await newNotice.save();
        res.redirect('/admin/dashboard');
    } catch (err) {
        res.status(500).send('Broadcast tracking processing failure');
    }
});

//Render financial performance synthesis records
router.get('/reports', isAdmin, async (req, res) => {
    try {
        const activeLeases = await RentApplication.find({ status: 'active' });
        const totalRevenue = activeLeases.reduce((sum, app) => sum + app.monthlyRent, 0);
        const stats = { totalRevenue };
        res.render('admin/reports', { stats });
    } catch (err) {
        res.status(500).send('Server reports tracking failure');
    }
});

module.exports = router;