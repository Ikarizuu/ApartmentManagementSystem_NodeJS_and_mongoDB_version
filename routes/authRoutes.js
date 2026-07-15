const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

//Render login page
router.get('/login', (req, res) => {
    res.render('login', { message: null });
});

//Process account log in credentials
router.post('/login', async (req, res) => {
    const { email_address, password } = req.body;
    try {
        const user = await User.findOne({ emailAddress: email_address.trim().toLowerCase() });
        if (!user) {
            return res.render('login', { message: 'Incorrect email or password' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', { message: 'Incorrect email or password' });
        }
        //Store structural session variables for EJS context injection
        req.session.user = {
            id: user._id,
            first_name: user.firstName,
            last_name: user.lastName,
            email_address: user.emailAddress,
            role: user.role
        };
        if (user.role === 'admin') {
            return res.redirect('/admin/dashboard');
        }
        res.redirect('/home');
    } catch (err) {
        res.render('login', { message: 'Unable to log in. Please try again.' });
    }
});

//Render account registration window
router.get('/register', (req, res) => {
    res.render('register', { message: null });
});

//Process tenant registration form submissions
router.post('/register', async (req, res) => {
    const { first_name, last_name, email_address, password, conPassword } = req.body;
    if (password.length < 8) {
        return res.render('register', { message: 'Password length must be at least 8 characters' });
    }
    if (password !== conPassword) {
        return res.render('register', { message: 'Confirmed password does not match' });
    }
    try {
        const existingUser = await User.findOne({ emailAddress: email_address.trim().toLowerCase() });
        if (existingUser) {
            return res.render('register', { message: 'Email address is already registered' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            firstName: first_name.trim(),
            lastName: last_name.trim(),
            emailAddress: email_address.trim().toLowerCase(),
            password: hashedPassword,
            role: 'tenant'
        });
        await newUser.save();
        res.redirect('/login');
    } catch (err) {
        res.render('register', { message: 'Failed to create account. Please try again.' });
    }
});

//Process server session log outs
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

module.exports = router;