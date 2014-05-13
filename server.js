var express = require('express'),
    settings = require('./settings'),
    http = require('http'),
    path = require('path'),
    SocketHandler = require('./server/socket-handler'),
    routeConfig = require('./server/route-config'),
    passport = require('passport'),
    wsfedsaml2 = require('passport-azure-ad').WsfedStrategy; // This gives you WebSSO capability for Azure AD;

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/server/views');
app.set('view engine', 'ejs');
app.use(express.favicon(__dirname + '/client/images/favicon.ico'));

//app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser('your secret here'));
app.use(express.session());
app.use(passport.initialize());
app.use(passport.session());

// load liveReload script only in development mode
// load before app.router
app.configure('development', function() {
  // live reload script
  var liveReloadPort = settings.liveReload.port || 35729;
  var excludeList = ['.woff', '.flv'];
  
  app.use(require('connect-livereload')({
    port: liveReloadPort,
    excludeList: excludeList
  }));
});

app.use(app.router);
  app.use(require('less-middleware')(__dirname + '/client'));
app.use(express.static(path.join(__dirname, 'client')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

routeConfig.configureRoutes(app);



// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
	if (req.isAuthenticated()) { return next(); }
	res.redirect('/login');
}

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.
passport.serializeUser(function (user, done) {
	done(null, user.email);
});
passport.deserializeUser(function (id, done) {
	findByEmail(id, function (err, user) {
		done(err, user);
	});
});


var wsfedStrategy = new wsfedsaml2({
		realm: process.env.ActiveDirectoryRealm,
		identityProviderUrl: process.env.ActiveDirectoryIdentityProviderUrl,
		identityMetadata: process.env.ActiveDirectoryIdentityMetadata,
		logoutUrl: process.env.ActiveDirectoryLogoutUrl
	},
    function(profile, done) {
        if (!profile.email) {
        	return done(new Error("No email found"), null);
        }
        // asynchronous verification, for effect...
        process.nextTick(function () {
        	findByEmail(profile.email, function(err, user) {
        		if (err) {
        			return done(err);
        		}
        		if (!user) {
        			// "Auto-registration"
        			users.push(profile);
        			return done(null, profile);
        		}
        		return done(null, user);
        	});
        });
    });

passport.use(wsfedStrategy);

var users = [];

function findByEmail(email, fn) {
	for (var i = 0, len = users.length; i < len; i++) {
		var user = users[i];
		if (user.email === email) {
			return fn(null, user);
		}
	}
	return fn(null, null);
}


var server = http.createServer(app).listen(app.get('port'), function () {
	//console.log('Express server listening on port ' + app.get('port'));
});

var socketHandler = new SocketHandler(server);


