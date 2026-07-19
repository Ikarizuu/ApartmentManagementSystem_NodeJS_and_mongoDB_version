const mongoose = require('mongoose');
const connectDB = require('./config/database');
const User = require('./models/User');
const Room = require('./models/Room');
const Tenant = require('./models/Tenant');
const RentApplication = require('./models/RentApplication');
const Transaction = require('./models/Transaction');
const Announcement = require('./models/Announcement');
require('dotenv').config();

// Helper array pools for randomized text parsing arrays
const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Elizabeth', 'William', 'Linda', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'];
const roomsPool = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']; // Excludes Room A entirely

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seedData() {
    try {
        await connectDB();
        console.log("✅ Database link checked. Preparing mock dataset sequence...");

        // 1. Reset dynamic tracking tables 
        console.log("⚙️  Clearing active dynamic operational variables...");
        await User.deleteMany({ role: { $ne: 'admin' } }); // Clear all non-admin users
        await Tenant.deleteMany({});
        await RentApplication.deleteMany({});
        await Transaction.deleteMany({});
        await Announcement.deleteMany({});

        // FIXED: Completely reset the room parameters AND clear out any old utility billing records
        await Room.updateMany({}, { 
            $set: { 
                isAvailable: true, 
                currentTenant: null,
                utilities: {
                    electricity: 0,
                    water: 0,
                    isBilled: false
                }
            } 
        });
        console.log("  🧹 Room utilities and tracking configurations wiped completely clean.");

        console.log("\n👥 Initializing profile creation sequences (30 Users)...");
        const generatedUsers = [];
        for (let i = 0; i < 30; i++) {
            const fName = firstNames[i % firstNames.length];
            const lName = lastNames[i % lastNames.length];
            const email = `${fName.toLowerCase()}.${lName.toLowerCase()}${i}@ams-tenant.com`;
            
            const user = new User({
                firstName: fName,
                lastName: lName,
                emailAddress: email,
                password: 'password1234', // Pre-save hook automatically parses hash verification
                role: 'tenant'
            });
            await user.save();
            generatedUsers.push(user);
        }
        console.log(`  🎉 30 dynamic User entries compiled.`);

        console.log("\n📄 Generating Application logs (30 Lease Requests)...");
        const applications = [];
        for (let i = 0; i < 30; i++) {
            const targetUser = generatedUsers[i];
            const chosenRoomLetter = i < 13 ? roomsPool[i] : getRandomElement(roomsPool); // Room A remains explicitly shielded
            const appDate = getRandomDate(new Date(2025, 0, 1), new Date(2026, 5, 30));

            const app = new RentApplication({
                user: targetUser._id,
                firstName: targetUser.firstName,
                lastName: targetUser.lastName,
                suffix: Math.random() > 0.8 ? 'Jr.' : '',
                gender: getRandomElement(['Male', 'Female', 'Other']),
                contactNo: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
                occupants: Math.floor(Math.random() * 4) + 1,
                monthsOfRent: getRandomElement([3, 6, 12]),
                roomRequested: `Room ${chosenRoomLetter}`,
                status: 'accepted',
                documents: {
                    validIdFrontPath: 'uploads/applications/mock-front.png',
                    validIdBackPath: 'uploads/applications/mock-back.png',
                    nbiClearancePath: 'uploads/applications/mock-nbi.png'
                },
                createdAt: appDate
            });
            await app.save();
            applications.push(app);
        }
        console.log(`  🎉 30 RentApplication parameters verified.`);

        console.log("\n🏢 Splitting entities into 15 Active Tenants and 15 Archived Past Tenants...");
        for (let i = 0; i < 30; i++) {
            const targetUser = generatedUsers[i];
            const appDetails = applications[i];
            
            if (i < 15) {
                // ACTIVE TENANTS
                let assignedRoom = await Room.findOne({ roomName: appDetails.roomRequested, isAvailable: true });
                
                // Fallback catch to verify no edge case overlaps with structural rooms
                if (!assignedRoom && appDetails.roomRequested !== 'Room A') {
                    assignedRoom = await Room.findOne({ roomName: `Room ${getRandomElement(roomsPool)}`, isAvailable: true });
                }

                if (assignedRoom && assignedRoom.roomName !== 'Room A') {
                    assignedRoom.isAvailable = false;
                    assignedRoom.currentTenant = targetUser._id;
                    await assignedRoom.save();
                }

                await new Tenant({
                    user: targetUser._id,
                    suffix: appDetails.suffix,
                    gender: appDetails.gender,
                    contactNo: appDetails.contactNo,
                    room: assignedRoom ? assignedRoom._id : null,
                    status: 'Active',
                    isArchived: false,
                    createdAt: appDetails.createdAt
                }).save();
            } else {
                // ARCHIVED PAST TENANTS
                await new Tenant({
                    user: targetUser._id,
                    suffix: appDetails.suffix,
                    gender: appDetails.gender,
                    contactNo: `${appDetails.contactNo} EXT:2025-12`, 
                    room: null, 
                    status: 'Archived',
                    isArchived: true,
                    createdAt: appDetails.createdAt
                }).save();
            }
        }
        console.log(`  🎉 Active and Archived tenancy maps linked.`);

        console.log("\n💰 Building accounting records (30 Transaction Entries)...");
        for (let i = 0; i < 30; i++) {
            const targetUser = generatedUsers[i];
            const appDetails = applications[i];
            const baseCost = appDetails.roomRequested.match(/Room [I-N]/) ? 3500 : 4000;

            // Generate initial onboarding down payment setup
            await new Transaction({
                user: targetUser._id,
                roomName: appDetails.roomRequested,
                amount: baseCost,
                type: 'deposit',
                paymentMethod: getRandomElement(['gcash', 'bank', 'cash']),
                status: 'completed',
                tenantPaid: true,
                createdAt: appDetails.createdAt
            }).save();
        }
        console.log(`  🎉 30 structural Transaction ledgers seeded.`);

        // Double check validation matrix to ensure Room A was not modified
        const roomA = await Room.findOne({ roomName: 'Room A' });
        console.log("\n====================================================");
        console.log(`🔍 STATUS CHECK [Room A Availability]: ${roomA.isAvailable ? '✅ VACANT & RESET' : '❌ OCCUPIED'}`);
        console.log("🚀 MOCK DATA INJECTION SEQUENCE COMPLETE!");
        console.log("====================================================");
        process.exit(0);

    } catch (err) {
        console.error("❌ Seeding runtime context failed:", err);
        process.exit(1);
    }
}

seedData();