//config/database.js
const mongoose = require('mongoose');
const Room = require('../models/Room');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ApartmentManagementSystem');
        console.log(`🍃 MongoDB Connected: ${conn.connection.host}`);
        
        // Seed Rooms if Database is empty
        const roomCount = await Room.countDocuments();
        if (roomCount === 0) {
            console.log("⚙️ Seeding default rooms catalog alphabetically...");
            const roomsData = [];
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            
            let letterIndex = 0;
            // Floor 1 (4 rooms: A, B, C, D)
            for (let i = 0; i < 4; i++) {
                roomsData.push({ roomName: `Room ${alphabet[letterIndex++]}`, floor: 1, price: 4000 });
            }
            // Floor 2 (4 rooms: E, F, G, H)
            for (let i = 0; i < 4; i++) {
                roomsData.push({ roomName: `Room ${alphabet[letterIndex++]}`, floor: 2, price: 4000 });
            }
            // Floor 3 (6 rooms: I, J, K, L, M, N)
            for (let i = 0; i < 6; i++) {
                roomsData.push({ roomName: `Room ${alphabet[letterIndex++]}`, floor: 3, price: 3500 });
            }
            
            await Room.insertMany(roomsData);
            console.log("🎉 Seeding complete! 14 studio rooms generated.");
        }
    } catch (err) {
        console.error(`Database Connection Failure: ${err.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;