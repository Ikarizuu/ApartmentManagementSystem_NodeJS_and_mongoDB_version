const mongoose = require('mongoose');

const RentApplicationSchema = new mongoose.Schema({
    //Establishes relationship back to the master user account record
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    contactNo: { type: String, required: true },
    gender: { type: String, required: true },
    occupants: { type: Number, required: true, min: 1, max: 4 },
    monthsOfRent: { type: Number, required: true, min: 1 },
    roomName: { type: String, required: true },
    monthlyRent: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['Pending Review', 'active', 'pending-move-out', 'moved-out', 'archived', 'rejected'], 
        default: 'Pending Review' 
    },
    documents: {
        validIdFrontPath: { type: String, required: true },
        validIdBackPath: { type: String, required: true },
        nbiClearancePath: { type: String, required: true }
    },
    archive: {
        date: { type: Date, default: null },
        reason: { type: String, default: null },
        notes: { type: String, default: '' }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RentApplication', RentApplicationSchema);