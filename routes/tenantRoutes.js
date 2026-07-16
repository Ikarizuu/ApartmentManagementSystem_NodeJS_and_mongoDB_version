const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const RentApplication = require('../models/RentApplication');
const Announcement = require('../models/Announcement');

//Configure multer local disc storage allocations with dynamic file renaming supporting PDFs and images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/applications/');
    },
    filename: (req, file, cb) => {
        //Retrieve client variables safely from the parsed body object
        const lName = (req.body.lastName || 'User').replace(/[^a-zA-Z]/g, '');
        const fName = (req.body.firstName || 'Resident').replace(/[^a-zA-Z]/g, '');
        
        //Match standard format patterns based on input field names
        let documentType = 'Document';
        if (file.fieldname === 'validIdFrontFile') documentType = 'Front_ID';
        if (file.fieldname === 'validIdBackFile') documentType = 'Back_ID';
        if (file.fieldname === 'nbiFile') documentType = 'NBI_Clearance';
        
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${lName}-${fName}_${documentType}${ext}`);
    }
});
const upload = multer({ storage: storage });

//Authentication gateway middleware barrier restricting route access strictly to non-admin tenants
const isTenant = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    //Force-redirect administrators out of user-facing views back into the management dashboard
    if (req.session.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    next();
};

//Render primary welcome portal with real-time available room statistics
router.get('/home', isTenant, async (req, res) => {
    try {
        //If the user is an active tenant (with an accepted or pending application), override home to display their My Room hub directly
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        if (application && (application.status === 'accepted' || application.status === 'pending')) {
            return res.redirect('/my-room');
        }

        const Room = require('../models/Room');
        const availableRoomsCount = await Room.countDocuments({ isAvailable: true });
        res.render('home', { 
            availableRoomsCount,
            hasRentedRoom: false, //They do not have an active application if they reached this page
            user: req.session.user
        });
    } catch (err) {
        res.render('home', { 
            availableRoomsCount: 0,
            hasRentedRoom: false,
            user: req.session.user
        });
    }
});

//Render available layout catalog tracker grid showing ONLY vacant rooms (isAvailable: true)
router.get('/preview', isTenant, async (req, res) => {
    try {
        const Room = require('../models/Room');
        // Filter the database query to only fetch rooms that are currently vacant
        const rooms = await Room.find({ isAvailable: true }).sort({ roomName: 1 });
        
        //Check if they have an active application
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        const hasRentedRoom = !!application;

        res.render('preview', { 
            rooms,
            hasRentedRoom,
            user: req.session.user
        });
    } catch (err) {
        res.status(500).send('Error fetching room statuses');
    }
});

//Render lease digital onboarding parameters form passing dynamic session context
router.get('/rent-application', isTenant, async (req, res) => {
    try {
        //If they already have an active application process under review, push them to the tracker page
        const existingApp = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        if (existingApp) {
            return res.redirect('/my-room');
        }

        const roomSelection = req.query.room || 'Room A';
        res.render('rentApplication', { 
            roomSelection,
            user: req.session.user,
            hasRentedRoom: false //False because they are in the middle of applying
        });
    } catch (err) {
        res.redirect('/home');
    }
});

//Process multipart files documentation verification submissions with safe database storage
router.post('/rent-application', isTenant, upload.fields([
    { name: 'validIdFrontFile', maxCount: 1 },
    { name: 'validIdBackFile', maxCount: 1 },
    { name: 'nbiFile', maxCount: 1 }
]), async (req, res) => {
    const { firstName, lastName, suffix, gender, contactNo, occupants, monthsOfRent, roomRequested } = req.body;
    try {
        const newApplication = new RentApplication({
            user: req.session.user.id,
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
        res.status(500).send('Error filing application');
    }
});

//Render individual active tenant tracking dashboard workspace showing status and docs
router.get('/my-room', isTenant, async (req, res) => {
    try {
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        if (!application) {
            //If no application has been initialized, redirect back to application flow
            return res.redirect('/preview');
        }
        res.render('myRoom', { 
            application,
            hasRentedRoom: true,
            user: req.session.user
        });
    } catch (err) {
        res.status(500).send('Server error');
    }
});

//Render printed legal document templates reviewed in Filipino
router.get('/view-contract', isTenant, async (req, res) => {
    try {
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        if (!application) {
            return res.redirect('/home');
        }

        //Calculate monthlyRent dynamically based on the requested room name
        const baseRent = application.roomRequested.includes('Room I') || 
                         application.roomRequested.includes('Room J') || 
                         application.roomRequested.includes('Room K') || 
                         application.roomRequested.includes('Room L') || 
                         application.roomRequested.includes('Room M') || 
                         application.roomRequested.includes('Room N') ? 3500 : 4000;

        //Merge Base Rent directly inside our application data wrapper
        const safeApplicationObj = {
            ...application._doc,
            monthlyRent: baseRent
        };

        res.render('viewContract', { 
            application: safeApplicationObj,
            hasRentedRoom: true,
            user: req.session.user
        });
    } catch (err) {
        res.status(500).send('Server error loading contract preview template');
    }
});

//Render Pay Bills module for checking out deposits and balances
router.get('/pay-bills', isTenant, async (req, res) => {
    try {
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        if (!application) {
            return res.redirect('/home');
        }

        //Calculate dynamically based on the requested room name pricing parameters
        const baseRent = application.roomRequested.includes('Room I') || application.roomRequested.includes('Room J') || application.roomRequested.includes('Room K') || application.roomRequested.includes('Room L') || application.roomRequested.includes('Room M') || application.roomRequested.includes('Room N') ? 3500 : 4000;

        //Check if user is a fully set up tenant (has a tenant profile record in db)
        const activeTenant = await Tenant.findOne({ user: req.session.user.id });

        res.render('payBills', { 
            application,
            baseRent,
            isFullyBoarded: !!activeTenant,
            hasRentedRoom: true,
            user: req.session.user
        });
    } catch (err) {
        res.status(500).send('Server error rendering bills payment page');
    }
});

//==================================================
//USER PROFILE & ACCOUNT SETTINGS ROUTES
//==================================================

//Render profile settings page
router.get('/profile-settings', isTenant, async (req, res) => {
    try {
        const dbUser = await User.findById(req.session.user.id);
        if (!dbUser) {
            return res.render('profileSettings', { 
                dbUser: {}, 
                successMessage: null, 
                errorMessage: 'Profile data not found in the database.',
                hasRentedRoom: false,
                user: req.session.user
            });
        }

        //Check if they have an active application
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        const hasRentedRoom = !!application;

        const tenantData = await Tenant.findOne({ user: req.session.user.id });

        res.render('profileSettings', { 
            dbUser: {
                ...dbUser._doc,
                suffix: tenantData ? tenantData.suffix : '',
                gender: tenantData ? tenantData.gender : '',
                contactNo: tenantData ? tenantData.contactNo : ''
            }, 
            successMessage: null, 
            errorMessage: null,
            hasRentedRoom,
            user: req.session.user
        });
    } catch (err) {
        res.render('profileSettings', {
            dbUser: {},
            successMessage: null,
            errorMessage: 'Server error rendering profile settings',
            hasRentedRoom: false,
            user: req.session.user
        });
    }
});

//Handle profile details update
router.post('/profile-settings/update', isTenant, async (req, res) => {
    const { firstName, lastName, suffix, gender, contactNo } = req.body;
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.session.user.id,
            { 
                firstName: firstName.trim(), 
                lastName: lastName.trim()
            },
            { new: true }
        );

        req.session.user.first_name = updatedUser.firstName;
        req.session.user.last_name = updatedUser.lastName;

        //Check if they have an active application
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        const hasRentedRoom = !!application;

        let updatedTenant = null;
        const tenantExists = await Tenant.findOne({ user: req.session.user.id });
        if (tenantExists) {
            updatedTenant = await Tenant.findOneAndUpdate(
                { user: req.session.user.id },
                { 
                    suffix: suffix.trim(), 
                    gender, 
                    contactNo: contactNo.trim() 
                },
                { new: true }
            );
        }

        res.render('profileSettings', { 
            dbUser: { 
                ...updatedUser._doc, 
                suffix: suffix.trim(), 
                gender, 
                contactNo: contactNo.trim() 
            }, 
            successMessage: 'Profile information updated successfully!', 
            errorMessage: null,
            hasRentedRoom,
            user: req.session.user
        });
    } catch (err) {
        const dbUser = await User.findById(req.session.user.id);
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        const hasRentedRoom = !!application;
        res.render('profileSettings', { 
            dbUser: dbUser || {}, 
            successMessage: null, 
            errorMessage: 'Failed to update profile records.',
            hasRentedRoom,
            user: req.session.user
        });
    }
});

//Handle password update
router.post('/profile-settings/password', isTenant, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    try {
        const dbUser = await User.findById(req.session.user.id);
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        const hasRentedRoom = !!application;

        if (!dbUser) {
            return res.render('profileSettings', { 
                dbUser: {}, 
                successMessage: null, 
                errorMessage: 'User not found.',
                hasRentedRoom,
                user: req.session.user
            });
        }

        const bcrypt = require('bcryptjs');

        if (newPassword.length < 8) {
            return res.render('profileSettings', { 
                dbUser, 
                successMessage: null, 
                errorMessage: 'New password must be at least 8 characters long.',
                hasRentedRoom,
                user: req.session.user
            });
        }

        if (newPassword !== confirmPassword) {
            return res.render('profileSettings', { 
                dbUser, 
                successMessage: null, 
                errorMessage: 'Confirmed password does not match.',
                hasRentedRoom,
                user: req.session.user
            });
        }

        const isMatch = await bcrypt.compare(currentPassword, dbUser.password);
        if (!isMatch) {
            return res.render('profileSettings', { 
                dbUser, 
                successMessage: null, 
                errorMessage: 'Incorrect current password.',
                hasRentedRoom,
                user: req.session.user
            });
        }

        dbUser.password = newPassword;
        await dbUser.save();

        res.render('profileSettings', { 
            dbUser, 
            successMessage: 'Password updated successfully!', 
            errorMessage: null,
            hasRentedRoom,
            user: req.session.user
        });
    } catch (err) {
        const dbUser = await User.findById(req.session.user.id);
        const application = await RentApplication.findOne({ user: req.session.user.id }).sort({ createdAt: -1 });
        const hasRentedRoom = !!application;
        res.render('profileSettings', { 
            dbUser: dbUser || {}, 
            successMessage: null, 
            errorMessage: 'An error occurred during password change.',
            hasRentedRoom,
            user: req.session.user
        });
    }
});

module.exports = router;