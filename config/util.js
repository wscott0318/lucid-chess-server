var crypto = require('crypto');
var { alphaBet } = require('./packet');

module.exports = {

    encrypt: function (plainText) {
        return crypto.createHash('md5').update(plainText).digest('hex');
    },

    randomString: function (length) {
        // var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghiklmnopqrstuvwxyz';
        var chars = '0123456789';

        var string = '';

        for (var i = 0; i < length; i++) {
            var randomNumber = Math.floor(Math.random() * chars.length);
            string += chars.substring(randomNumber, randomNumber + 1);
        }

        return string + Date.now();
    },

    getRandomVal: (range) => Math.ceil(Math.random() * 100000000) % range,

    getMatrixIndexFromFen: (val) => {
        return ({
            rowIndex: val[1] - 1,
            colIndex: alphaBet.indexOf(val[0])
        });
    },
    
    getFenFromMatrixIndex: (rowIndex, colIndex) => alphaBet[ colIndex ] + ( rowIndex + 1 ),
};