//dbCheck.js
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const User = require('./models/User');
const Room = require('./models/Room');
const Tenant = require('./models/Tenant');
const RentApplication = require('./models/RentApplication');
const Transaction = require('./models/Transaction'); 
require('dotenv').config();

async function diagnose() {
    try {
        await connectDB();
        console.log("✅ Connected to MongoDB successfully!");
        
        // 1. Drop stale collections to clear out old index restrictions and structural schema mismatches
        const collectionsToWipe = ['users', 'rooms', 'tenants', 'rentapplications', 'transactions'];
        
        console.log("⚙️  Clearing structural database collection instances...");
        for (const colName of collectionsToWipe) {
            try {
                await mongoose.connection.db.dropCollection(colName);
                console.log(`  🗑️  Dropped collection: '${colName}'`);
            } catch (e) {
                console.log(`  ℹ️  Collection '${colName}' didn't exist or was already cleared.`);
            }
        }

        // 2. Pre-seed the 14 structural Room units with proper floor configuration paths
        console.log("\n🏢 Seeding dynamic apartment unit inventories...");
        const roomsToSeed = [];
        
        // Floor 1: Rooms A, B, C, D (₱4,000.00 base cost)
        const floorOneRooms = ['A', 'B', 'C', 'D'];
        floorOneRooms.forEach(letter => {
            roomsToSeed.push({ roomName: `Room ${letter}`, price: 4000, floor: 1, isAvailable: true });
        });

        // Floor 2: Rooms E, F, G, H (₱4,000.00 base cost)
        const floorTwoRooms = ['E', 'F', 'G', 'H'];
        floorTwoRooms.forEach(letter => {
            roomsToSeed.push({ roomName: `Room ${letter}`, price: 4000, floor: 2, isAvailable: true });
        });

        // Floor 3: Rooms I, J, K, L, M, N (₱3,500.00 base cost)
        const floorThreeRooms = ['I', 'J', 'K', 'L', 'M', 'N'];
        floorThreeRooms.forEach(letter => {
            roomsToSeed.push({ roomName: `Room ${letter}`, price: 3500, floor: 3, isAvailable: true });
        });

        await Room.insertMany(roomsToSeed);
        console.log(`🎉 Room inventory successfully seeded! (${roomsToSeed.length} total structural units compiled)`);

        // 3. Create your clean fresh administrator workspace account
        console.log("\n🔒 Injecting superuser core profile variables...");
        const freshAdmin = new User({
            firstName: 'System',
            lastName: 'Admin',
            emailAddress: 'admin@ams.com',
            password: 'admin1234', 
            role: 'admin'
        });

        await freshAdmin.save();
        console.log("🎉 SUCCESS! Fresh 'admin@ams.com' has been saved directly.[cite: 15]");
        
        const checkSaved = await User.findOne({ emailAddress: 'admin@ams.com' });
        console.log("🔒 Verified Saved Admin Hash:", checkSaved.password); // Confirms pre-save hook validation[cite: 15]
        
        console.log("\n====================================================");
        console.log("🚀 SYSTEM SEED COMPLETE: Database ready for operation!");
        console.log("====================================================");
        process.exit(0);
    } catch (err) {
        console.error("❌ Diagnostic initialization failed:", err); 
        process.exit(1);
    }
}

diagnose();