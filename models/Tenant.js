const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    suffix: { type: String, default: '', trim: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
    contactNo: { type: String, required: true, trim: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
    status: { type: String, default: 'Active' },
    isArchived: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Tenant', TenantSchema);