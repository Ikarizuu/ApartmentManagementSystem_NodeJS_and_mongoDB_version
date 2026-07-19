const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomName: { type: String, required: true, unique: true }, 
    floor: { type: Number, required: true }, 
    type: { type: String, default: 'Studio Type' },
    price: { type: Number, required: true }, 
    isAvailable: { type: Boolean, default: true },
    currentTenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    utilities: {
        electricity: { type: Number, default: 0 },
        water: { type: Number, default: 0 },
        isBilled: { type: Boolean, default: false } // Becomes true when admin sends invoice
    }
});

module.exports = mongoose.model('Room', RoomSchema);