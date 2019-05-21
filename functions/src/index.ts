'use strict';

// Firebase Setup
import * as admin from "firebase-admin";

const serviceAccount = require('../../quantified-self-io-firebase-adminsdk.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`,
});

export * from "./stWorkoutDownloadAsFit"
export * from "./auth"
export * from "./tokens"

