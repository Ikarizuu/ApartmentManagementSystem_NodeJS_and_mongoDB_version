const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    roomName: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['deposit', 'rent', 'utilities'],
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['gcash', 'bank', 'cash'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'completed'
    }
}, { timestamps: true });   

module.exports = mongoose.model('Transaction', TransactionSchema);