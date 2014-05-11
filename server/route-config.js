var messages = require('./routes/messages'),
 chat = require('./routes/chat'),
 pages = require('./routes/pages'),
 passport = require('passport');

exports.configureRoutes = function(app){

	app.get('/', pages.index);
	app.get('/messages', messages.list);
	app.post('/messages', messages.add);

	app.get('/chat', chat.list);
	app.post('/chat', chat.add);

	app.get('/login', passport.authenticate('wsfed-saml2', { failureRedirect: '/', failureFlash: true }), function (req, res) {
		res.redirect('/');
	});
	app.get('/logout', function (req, res) {
		// clear the passport session cookies
		req.logout();

		// We need to redirect the user to the WSFED logout endpoint so the
		// auth token will be revoked
		wsfedStrategy.logout({}, function (err, url) {
			if (err) {
				res.redirect('/');
			} else {
				res.redirect(url);
			}
		});
	});
	app.post('/login/callback', passport.authenticate('wsfed-saml2', { failureRedirect: '/', failureFlash: true }),
    function (req, res) {
    	res.redirect('/');
    });
};