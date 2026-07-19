const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');

router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/home');
    res.render('login', { errorMessage: null });
});

router.post('/login', async (req, res) => {
    const { email_address, password } = req.body;
    try {
        const user = await User.findOne({ emailAddress: email_address.trim().toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.render('login', { errorMessage: 'Invalid email address or password.' });
        }

        req.session.user = {
            id: user._id, first_name: user.firstName, last_name: user.lastName, email_address: user.emailAddress, role: user.role
        };

        if (user.role === 'admin') return res.redirect('/admin/dashboard');
        return res.redirect('/home');
    } catch (err) {
        res.render('login', { errorMessage: 'An error occurred during authentication.' });
    }
});

router.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/home');
    res.render('register', { errorMessage: null });
});

router.post('/register', async (req, res) => {
    const { first_name, last_name, email_address, password, confirm_password } = req.body;
    try {
        if (password !== confirm_password) return res.render('register', { errorMessage: 'Passwords do not match.' });
        
        const existingUser = await User.findOne({ emailAddress: email_address.trim().toLowerCase() });
        if (existingUser) return res.render('register', { errorMessage: 'Email address is already registered.' });

        const newUser = new User({
            firstName: first_name.trim(), lastName: last_name.trim(), emailAddress: email_address.trim().toLowerCase(), password: password, role: 'tenant'
        });
        await newUser.save();
        res.redirect('/login');
    } catch (err) {
        res.render('register', { errorMessage: 'Failed to create user account.' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;