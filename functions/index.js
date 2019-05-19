'use strict';
const stWorkoutDownloadAsFit = require('./stWorkoutDownloadAsFit');
const auth = require('./auth');

// Note do below initialization tasks in index.js and
// NOT in child functions:
const functions = require('firebase-functions');

exports.stWorkoutDownloadAsFit = functions.https.onRequest((req, res) => {
  stWorkoutDownloadAsFit.handler(req, res);
});

exports.authRedirect = functions.https.onRequest((req, res) => {
  auth.redirect(req, res);
});

exports.authToken = functions.https.onRequest((req, res) => {
  auth.token(req, res);
});
