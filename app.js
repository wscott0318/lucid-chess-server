var fs = require('fs');
var express = require('express');
var session = require('express-session');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var passport = require('passport');
var flash = require('connect-flash');

var env = process.env.NODE_ENV || 'default';
var config = require('config');

var app = express();

// configure database
require('./config/database')(app, mongoose);

// Bootstrap models
fs.readdirSync(__dirname + '/models').forEach(function (file) {
    if (~file.indexOf('.js')) require(__dirname + '/models/' + file);
});

// implement routes
var routes = require('./routes/index');
var account = require('./routes/account');
var api = require('./routes/api');
var play = require('./routes/play');
var login = require('./routes/login');
var register = require('./routes/register');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser('S3CRE7'));
app.use(flash());

app.use(session(
    {
        secret: 'S3CRE7-S3SSI0N',
        saveUninitialized: true,
        resave: true
    }
));

app.use(express.static(path.join(__dirname, 'public')));
require('./config/passport')(app, passport);
app.use(passport.initialize());
app.use(passport.session());

/* Route implementation */
// app.use('/', routes);
// app.use('/login', login);
// app.use('/register', register);
// app.use('/account', account);
// app.use('/play', play);
// app.use('/api', api);

require('./config/errorHandlers.js')(app);

var server = require('http').createServer(app).listen(8050, function() {
    console.log("server is listening on port 8050")
});

require('./config/socket.js')(server);

module.exports = app;
