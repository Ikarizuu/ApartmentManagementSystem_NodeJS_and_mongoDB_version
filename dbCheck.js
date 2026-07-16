//dbCheck.js
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const User = require('./models/User');
require('dotenv').config();

async function diagnose() {
    try {
        await connectDB();
        console.log("✅ Connected to MongoDB successfully!");
        
        //1. Drop the users collection completely to clear all stale indices and conflicting schemas
        try {
            await mongoose.connection.db.dropCollection('users');
            console.log("🗑️ Dropped stale 'users' collection to clear old schema indexes.");
        } catch (e) {
            console.log("ℹ️ No 'users' collection to drop, or already dropped.");
        }

        //2. Create a fresh admin account using our clean pre-save hook
        const freshAdmin = new User({
            firstName: 'System',
            lastName: 'Admin',
            emailAddress: 'admin@ams.com',
            password: 'admin1234', //Auto-hashed by schema pre-save hook
            role: 'admin'
        });

        await freshAdmin.save();
        console.log("🎉 SUCCESS! Fresh 'admin@ams.com' has been saved directly.");
        
        const checkSaved = await User.findOne({ emailAddress: 'admin@ams.com' });
        console.log("🔒 Verified Saved Admin Hash:", checkSaved.password);
        
        process.exit(0);
    } catch (err) {
        console.error("❌ Diagnostic failed:", err);
        process.exit(1);
    }
}

diagnose();