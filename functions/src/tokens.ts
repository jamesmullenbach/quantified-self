'use strict';

import * as functions from "firebase-functions";
//
export const scheduledFunction = functions.pubsub.schedule('every 1 minutes').onRun((context) => {
  console.log('This will be run every 1 minutes!');

  // admin.firestore().collection('userAccessTokens')

});
