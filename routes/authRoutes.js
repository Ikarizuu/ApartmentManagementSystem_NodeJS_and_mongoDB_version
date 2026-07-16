const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');

//Render the login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/home');
    }
    res.render('login', { errorMessage: null });
});

//Handle login submission
router.post('/login', async (req, res) => {
    const { email_address, password } = req.body;

    try {
        //Look up user using emailAddress
        const user = await User.findOne({ emailAddress: email_address.trim().toLowerCase() });

        if (!user) {
            return res.render('login', { errorMessage: 'Invalid email address or password.' });
        }

        //Verify password against database hash
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', { errorMessage: 'Invalid email address or password.' });
        }

        //Set up session parameters to match EJS views precisely
        req.session.user = {
            id: user._id,
            first_name: user.firstName,
            last_name: user.lastName,
            email_address: user.emailAddress,
            role: user.role
        };

        //Redirect based on system authorization roles
        if (user.role === 'admin') {
            return res.redirect('/admin/dashboard');
        } else {
            return res.redirect('/home');
        }

    } catch (err) {
        console.error('Login system error:', err);
        res.render('login', { errorMessage: 'An error occurred during authentication.' });
    }
});

//Render the registration page
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/home');
    }
    res.render('register', { errorMessage: null });
});

//Handle registration submission
router.post('/register', async (req, res) => {
    const { first_name, last_name, email_address, password, confirm_password } = req.body;

    try {
        if (password !== confirm_password) {
            return res.render('register', { errorMessage: 'Passwords do not match.' });
        }

        //Check if email is already taken
        const existingUser = await User.findOne({ emailAddress: email_address.trim().toLowerCase() });
        if (existingUser) {
            return res.render('register', { errorMessage: 'Email address is already registered.' });
        }

        //Create new user (pre-save hook in User.js handles hashing)
        const newUser = new User({
            firstName: first_name.trim(),
            lastName: last_name.trim(),
            emailAddress: email_address.trim().toLowerCase(),
            password: password,
            role: 'tenant'
        });

        await newUser.save();
        res.redirect('/login');

    } catch (err) {
        console.error('Registration system error:', err);
        res.render('register', { errorMessage: 'Failed to create user account.' });
    }
});

//Handle user logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

module.exports = router;