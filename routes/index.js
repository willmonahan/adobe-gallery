var express = require('express');
var router = express.Router();
var controller = require('../controller');

router.get('/login', controller.login);

router.get('/logout', controller.logout);

router.get('/oauthredirect', controller.oauthredirect);

// add a route to deal with all gallery pages (if we haven't matched any of the auth-related paths above, we must be trying to access a gallery page)
router.get('/*', controller.gallery);

module.exports = router;
