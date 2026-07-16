const mongoose = require('mongoose');

const RentApplicationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    suffix: { type: String, default: '' },
    gender: { type: String, required: true },
    contactNo: { type: String, required: true },
    occupants: { type: Number, required: true },
    monthsOfRent: { type: Number, required: true },
    roomRequested: { type: String, required: true }, // Matches e.g., "Room A"
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    documents: {
        validIdFrontPath: { type: String, required: true },
        validIdBackPath: { type: String, required: true },
        nbiClearancePath: { type: String, required: true }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RentApplication', RentApplicationSchema);