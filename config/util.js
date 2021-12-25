var crypto = require('crypto');

module.exports = {

    encrypt: function (plainText) {
        return crypto.createHash('md5').update(plainText).digest('hex');
    },

    randomString: function (length) {
        var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghiklmnopqrstuvwxyz';

        var string = '';

        for (var i = 0; i < length; i++) {
            var randomNumber = Math.floor(Math.random() * chars.length);
            string += chars.substring(randomNumber, randomNumber + 1);
        }

        return string;
    },

    getRandomVal: (range) => Math.ceil(Math.random() * 100000000) % range,

    getMatrixIndexFromFen: (val) => {
        const alphaBet = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

        return ({
            rowIndex: val[1] - 1,
            colIndex: alphaBet.indexOf(val[0])
        });
    },
    
    getFenFromMatrixIndex: (rowIndex, colIndex) => alphaBet[ colIndex ] + ( rowIndex + 1 ),
};