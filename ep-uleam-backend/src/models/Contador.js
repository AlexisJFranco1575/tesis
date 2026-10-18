const mongoose = require('mongoose');

// Un contador por año: _id = "documento-2026"
const contadorSchema = new mongoose.Schema({
    _id: { type: String },
    valor: { type: Number, default: 0 }
}, {
    versionKey: false
});

module.exports = mongoose.model('Contador', contadorSchema);