'use strict';

const functions = require('firebase-functions');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

// Firebase Setup
const admin = require('firebase-admin');
const serviceAccount = require('../quantified-self-io-firebase-adminsdk.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`,
});

// console.log(process.env)


// const OAUTH_REDIRECT_PATH = `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/popup.html`;
const OAUTH_SCOPES = 'workout';


// Path to the OAuth handlers.
const OAUTH_REDIRECT_PATH = '/authRedirect';
const OAUTH_CALLBACK_PATH = '/authToken';

/**
 * Creates a configured simple-oauth2 client for Suunto app.
 */
function suuntoAppOAuthClient() {
  // Instagram OAuth 2 setup
  // TODO: Configure the `suunto-app.client_id` and `suunto-app.client_secret` Google Cloud environment variables.
  const credentials = {
    client: {
      id: functions.config().suuntoapp.client_id,
      secret: functions.config().suuntoapp.client_secret,
    },
    auth: {
      tokenHost: 'https://cloudapi-oauth.suunto.com/',
      // tokenPath: '/oauth/token',
    },
  };
  return require('simple-oauth2').create(credentials);
}

/**
 * Redirects the User to the authentication consent screen. Also the 'state' cookie is set for later state
 * verification.
 */
exports.redirect = functions.https.onRequest((req, res) => {
  const oauth2 = suuntoAppOAuthClient();
  const state = req.cookies ? req.cookies.state : crypto.randomBytes(20).toString('hex');
  console.log('Setting state cookie for verification:', state);
  const secureCookie = req.get('host').indexOf('localhost:') !== 0;
  console.log('Need a secure cookie (i.e. not on localhost)?', secureCookie);
  res.cookie('state', state, {maxAge: 3600000, secure: secureCookie, httpOnly: true});
  const redirectUri = oauth2.authorizationCode.authorizeURL({
    redirect_uri: `${req.protocol}://localhost:5001/quantified-self-io/us-central1${OAUTH_CALLBACK_PATH}`, // @todo fix
    scope: OAUTH_SCOPES,
    state: state
  });
  console.log('Redirecting to:', redirectUri);
  res.redirect(redirectUri);
});

/**
 * Exchanges a given auth code passed in the 'code' URL query parameter for a Firebase auth token.
 * The request also needs to specify a 'state' query parameter which will be checked against the 'state' cookie.
 * The Firebase custom auth token, display name, photo URL and Instagram acces token are sent back in a JSONP callback
 * function with function name defined by the 'callback' query parameter.
 */
exports.token = functions.https.onRequest(async (req, res) => {
  const oauth2 = suuntoAppOAuthClient();
  try {
    return cookieParser()(req, res, async () => {
      console.log('Received verification state:', req.cookies.state);
      console.log('Received state:', req.query.state);
      if (!req.cookies.state) {
        throw new Error('State cookie not set or expired. Maybe you took too long to authorize. Please try again.');
      } else if (req.cookies.state !== req.query.state) {
        throw new Error('State validation failed');
      }
      console.log('Received auth code:', req.query.code);
      const results = await oauth2.authorizationCode.getToken({
        code: req.query.code,
        redirect_uri: `${req.protocol}://localhost:5001/quantified-self-io/us-central1${OAUTH_CALLBACK_PATH}`, // @todo fix,
        // redirect_uri: `${req.protocol}://${req.get('host')}${OAUTH_CALLBACK_PATH}`
      });
      console.log('Auth code exchange result received:', results);

      // We have an access token and the user identity now.
      const accessToken = results.access_token;
      const suuntoAppUserID = results.user;

      // Create a Firebase account and get the Custom Auth Token.
      const firebaseToken = await createFirebaseAccount(suuntoAppUserID, accessToken);
      // Serve an HTML page that signs the user in and updates the user profile.
      // res.send(signInFirebaseTemplate(firebaseToken));
      return res.jsonp({ token: firebaseToken});
    });
  } catch(error) {
    return res.jsonp({
      error: error.toString(),
    });
  }
});

/**
 * Creates a Firebase account with the given user profile and returns a custom auth token allowing
 * signing-in this account.
 * Also saves the accessToken to the datastore at /instagramAccessToken/$uid
 *
 * @returns {Promise<string>} The Firebase custom auth token in a promise.
 */
async function createFirebaseAccount(suuntoappUser, accessToken) {
  // The UID we'll assign to the user.
  const uid = `suunto-app:${suuntoappUser}`;

  // Save the access token to the Firebase Realtime Database.
  const databaseTask  = admin.firestore().collection('suuntoAppAccessTokens').doc(`${uid}`).set({accessToken: accessToken});

  // Create or update the user account.
  const userCreationTask = admin.auth().updateUser(uid, {
    displayName: suuntoappUser,
    // photoURL: photoURL,
  }).catch((error) => {
    // If user does not exists we create it.
    if (error.code === 'auth/user-not-found') {
      return admin.auth().createUser({
        uid: uid,
        displayName: suuntoappUser,
        // photoURL: photoURL,
      });
    }
    throw error;
  });

  // Wait for all async task to complete then generate and return a custom auth token.
  await Promise.all([userCreationTask, databaseTask]);

  // Create a Firebase custom auth token.
  const token = await admin.auth().createCustomToken(uid);
  console.log('Created Custom token for UID "', uid, '" Token:', token);
  return token;
}


/**
 * Generates the HTML template that signs the user in Firebase using the given token and closes the
 * popup.
 */
function signInFirebaseTemplate(token) {
  return `
    <script src="https://www.gstatic.com/firebasejs/3.6.0/firebase.js"></script>
    <script>
      var token = '${token}';
      var config = {
        apiKey: 'AIzaSyBdR4jbTKmm_P4L7t26IFAgFn6Eoo02aU0'
      };
      var app = firebase.initializeApp(config);
      app.auth().signInWithCustomToken(token).then(function(user) {
        window.opener.dispatchEvent(new Event('socialSuccess'));
        // window.close();
      });
    </script>`;
}
