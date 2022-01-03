var express = require('express');
var mongoose = require('mongoose');
var router = express.Router();

/* display game. */
router.get('/game/:id', function(req, res) {
    var id = req.params.id;
    mongoose.model('Game').findById(id, function(err, game) {
        if(err) {
            res.status(500).end();
        }
        if (game == null){
            res.status(404).end();
        } else {
            res.send(game);
        }
    });
});

/* display user. */
router.get('/user/:name', function(req, res) {
    var name = req.params.name;
    mongoose.model('User').findOne({name: name}, function(err, user) {
        if(err) {
            res.status(500).end();
        }
        if (user == null){
            res.status(404).end();
        } else {
            res.send(user);
        }
    });
});

router.post('/rankAll', async (req, res) => {
    var RankModel = mongoose.model('Rank');
    const rankData = await RankModel.find().exec();

    return res.status(200).send({ rankData });
});

/* api status, for monitor */
router.get('/', function(req, res) {
    res.status(200).end();
});

module.exports = router;