var express         = require('express'),
    expressValidator = require('express-validator'),
    flash           = require('connect-flash'),
    session         = require('express-session'),
    breadcrumbs     = require('express-breadcrumbs'),
    MongoStore      = require('connect-mongo')(session),
    port            = process.env.PORT || 3000,
    mongoose        = require('mongodb'),
    mongoose        = require('mongoose'),
    passport        = require('passport'),
    LocalStrategy   = require('passport-local').Strategy,
    nunjucks        = require('nunjucks'),
    path            = require('path'),
    logger          = require('morgan'),
    cookieParser    = require('cookie-parser'),
    bodyParser      = require('body-parser'),
    dotenv          = require('dotenv').config(),
    Routes          = require("./routes"), routes,
    Models          = require("./models"),
    app             = express();

// Socket IO Server
var server  = require('http').Server(app);
var io      = require('socket.io')(server);

// Mongoose
mongoose.connect(process.env.MONGO_URI);
var db = mongoose.connection;

// Create the asset paths
app.set('assets_path', (process.env.NODE_ENV === 'production') ? 'dist' : 'build');
app.set('views', path.join(__dirname, app.get('assets_path') + '/views'));

// Middleware & the like to make our lives easier
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// Set up our Asset Path
app.use(express.static(path.join(__dirname, app.get('assets_path'))));

// Nunjucks Initialization
nunjucks.configure(app.get('views'), {
    autoescape: true,
    noCache: true,
    watch: true,
    express: app
});

// Initialize Breadcrumbs
app.use(breadcrumbs.init());

// Set Breadcrumbs home information
app.use(breadcrumbs.setHome());

// Mount the breadcrumbs at `/admin`
app.use('/', breadcrumbs.setHome({
  name: 'Books',
  url: '/'
}));

// Express Session
app.use(session({
    secret: 'secret',
    maxAge: new Date(Date.now() + 3600000),
    store: new MongoStore({
        mongooseConnection: mongoose.connection
    }),
    saveUninitialized: true,
    resave: true
}));

// Initialize Passport for Authentication
app.use(passport.initialize());
app.use(passport.session());

// Express Validator
app.use(expressValidator({
    errorFormatter: function(param, msg, value) {
        var namespace = param.split('.')
        , root    = namespace.shift()
        , formParam = root;

        while(namespace.length) {
            formParam += '[' + namespace.shift() + ']';
        }
        return {
            param : formParam,
            msg   : msg,
            value : value
        };
    },
    customValidators: {
       isArray: function(value) {
           return Array.isArray(value);
       }
    }
}));

// Connect Flash
app.use(flash());

// Pass request messages to the view
app.use(function (req, res, next) {
    // View level variables successMessages and errorMessages are being assigned the global req.flash message arrays for this request
    res.locals.successMessages = req.flash('successMessages');
    res.locals.errorMessages = req.flash('errorMessages');
    res.locals.user = req.user || null;
    res.locals.config = process.env;
    next();
});

// Check if current user is authenticated
function ensureAuthented(req, res, next){
    if(req.isAuthenticated()){
        return next();
    } else {
        req.flash('errorMessages', 'You must be logged in to do that!');
        res.redirect('/users/login');
    }
}

function alreadyAuthenticated(req, res, next){
    if(req.isAuthenticated()){
        req.flash('errorMessages', 'You\'re already signed in!');
        res.redirect('/');
    } else {
        return next();
    }
}

/* -- Socket IO Routes -- */
var connections = [];
io.on('connection', function (socket) {
    // Track New Connections
    connections.push(socket);
    console.log('Connected: %s active connections', connections.length);

    // Track Disconnections
    socket.on('disconnect', function (data){
        connections.splice(connections.indexOf(data), 1);
        console.log('Disconnected: %s active connections', connections.length);
    });
});

// Initialize Routes
models = new Models();
routes = new Routes(models, io);

/* -- User Routes -- */
app.get('/users/register', alreadyAuthenticated, routes.users.register);
app.post('/users/register', routes.users.createUser);
app.get('/users/login', alreadyAuthenticated, routes.users.login);
app.post('/users/login', passport.authenticate('local', {successRedirect:'/', failureRedirect:'/users/login', failureFlash: {type: 'errorMessages'}}), routes.users.authenticate);
app.get('/users/update', ensureAuthented, routes.users.edit);
app.post('/users/update', routes.users.update);
app.get('/users/:userId/books', routes.books.getBooksByUserId);
app.get('/users/logout', routes.users.logout);

/* -- Book Routes -- */
app.get('/', routes.books.index);
app.delete('/books/:id', routes.books.removeBookById);
app.post('/books/create', ensureAuthented, routes.books.create);

/* -- Trade Routes -- */

app.post('/trades/create/:id', ensureAuthented, routes.trades.create);
app.patch('/trades/:id', ensureAuthented, routes.trades.updateTrade);
app.delete('/trades/:id', ensureAuthented, routes.trades.cancelTrade);
app.get('/incoming_trades', ensureAuthented, routes.trades.getIncomingTrades);
app.get('/outgoing_trades', ensureAuthented, routes.trades.getOutgoingTrades);
app.get('/trades/counts/:userId', ensureAuthented, routes.trades.getTradeCounts);

// Catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// No stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    if(err.status === 404){
        res.render('404.html');
    } else {
        console.error(err);
        res.render('500.html');
    }
});

// Start our application
server.listen(port);
console.log('Server running on port ' + port);

module.exports = app;
