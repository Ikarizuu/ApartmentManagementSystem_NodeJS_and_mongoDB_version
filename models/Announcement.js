const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    tag: { type: String, enum: ['General', 'Urgent', 'Reminder'], default: 'General' },
    sendTo: { type: String, default: 'All tenants' },
    channels: [{ type: String, enum: ['in-app', 'sms', 'email'] }],
    status: { type: String, enum: ['sent', 'scheduled', 'draft'], default: 'sent' },
    scheduledDate: { type: Date, default: null },
    recipientsCount: { type: Number, default: 24 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Announcement', AnnouncementSchema);