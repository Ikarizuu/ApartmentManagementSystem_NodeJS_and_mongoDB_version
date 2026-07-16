const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomName: { type: String, required: true, unique: true }, // e.g. "Room A", "Room B"
    floor: { type: Number, required: true }, // 1, 2, or 3
    type: { type: String, default: 'Studio Type' },
    price: { type: Number, required: true }, // 4000 for 1st/2nd, 3500 for 3rd
    isAvailable: { type: Boolean, default: true },
    currentTenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

module.exports = mongoose.model('Room', RoomSchema);