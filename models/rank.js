var mongoose = require('mongoose')
    , Schema = mongoose.Schema;

var RankSchema = mongoose.Schema({
    username: String,
    won: Number,
    lost: Number,
    earn: Number,
});

mongoose.model('Rank', RankSchema);