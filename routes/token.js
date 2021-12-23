const express = require("express");
const router = express.Router();

const util = require("../config/util");

router.get("/token", function (req, res, next) {
    res.send(util.randomString(20)); 
});

module.exports = router;
