const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const RentApplication = require('../models/RentApplication');
const Announcement = require('../models/Announcement');

//Configure multer local disc storage allocations
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/applications/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'));
    }
});
const upload = multer({ storage: storage });

//Authentication gateway middleware barrier
const isTenant = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

//Render primary welcome portal
router.get('/home', async (req, res) => {
    res.render('home');
});

//Render public available available layout catalog tracker grid
router.get('/preview', async (req, res) => {
    //Static placeholder units mimicking system database parameters
    const rooms = [
        { id: 'C', floor: '1F', price: 4000 },
        { id: 'F', floor: '2F', price: 4000 },
        { id: 'D', floor: '1F', price: 4000 },
        { id: 'M', floor: '3F', price: 3500 }
    ];
    res.render('preview', { rooms });
});

//Render lease digital onboarding parameters form
router.get('/rent-application', isTenant, (req, res) => {
    const roomSelection = req.query.room || 'C';
    res.render('rentApplication', { roomSelection });
});

//Process multipart files documentation verification submissions
router.post('/rent-application', isTenant, upload.fields([
    { name: 'validIdFrontFile', maxCount: 1 },
    { name: 'validIdBackFile', maxCount: 1 },
    { name: 'nbiFile', maxCount: 1 }
]), async (req, res) => {
    const { occupants, monthsOfRent, roomName } = req.body;
    const baseRent = roomName.includes('M') ? 3500 : 4000;
    try {
        const newApplication = new RentApplication({
            user: req.session.user.id,
            contactNo: req.session.user.email_address, //Fallback string field assignment
            gender: 'Other', //Fallback option assignment
            occupants: parseInt(occupants),
            monthsOfRent: parseInt(monthsOfRent),
            roomName: roomName,
            monthlyRent: baseRent,
            documents: {
                validIdFrontPath: req.files['validIdFrontFile'][0].path,
                validIdBackPath: req.files['validIdBackFile'][0].path,
                nbiClearancePath: req.files['nbiFile'][0].path
            }
        });
        await newApplication.save();
        res.redirect('/my-room');
    } catch (err) {
        res.status(500).send('Error filing application');
    }
});

//Render individual active tenant tracking dashboard workspace
router.get('/my-room', isTenant, async (req, res) => {
    try {
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        if (!application) {
            return res.send('No active room assignment found. Please file an application first.');
        }
        res.render('myRoom', { application });
    } catch (err) {
        res.status(500).send('Server error');
    }
});

//Render printed legal document templates reviewed in Filipino
router.get('/view-contract', isTenant, async (req, res) => {
    try {
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        res.render('viewContract', { application });
    } catch (err) {
        res.status(500).send('Server error');
    }
});

//Render personal configuration details modifier panel
router.get('/profile-settings', isTenant, (req, res) => {
    res.render('profileSettings');
});

//Render system broadcast notification logs feed
router.get('/notifications', isTenant, async (req, res) => {
    try {
        const announcements = await Announcement.find({ status: 'sent' }).sort({ createdAt: -1 });
        res.render('notifications', { announcements });
    } catch (err) {
        res.status(500).send('Server error');
    }
});

module.exports = router;