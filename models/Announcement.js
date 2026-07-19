const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    tag: { type: String, enum: ['General', 'Urgent', 'Reminder'], default: 'General' },
    sendTo: { type: String, enum: ['All', 'Tenants', 'Non-Tenants', 'Specific'], default: 'All' },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // Allows private notifications
    channels: [{ type: String, enum: ['in-app', 'sms', 'email'] }],
    status: { type: String, enum: ['sent', 'scheduled', 'draft'], default: 'sent' },
    scheduledDate: { type: Date, default: null },
    recipientsCount: { type: Number, default: 24 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Announcement', AnnouncementSchema);