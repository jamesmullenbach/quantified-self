'use strict';

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {suuntoAppOAuthClient} from "./suuntoAppOAuthClient";
//
export const refreshTheRefreshTokens = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
  console.log('This will be run every 1 minutes!');
  const oauth2 = suuntoAppOAuthClient();

  // Suunto app refresh tokens should be refreshed every 180days we target at 15 days before 165 days
  const querySnapshot = await admin.firestore().collection('userAccessTokens').where("Suunto App.date", "<=", (new Date()).getTime() - (165 * 24 * 60 * 60 * 1000)).get();
  querySnapshot.forEach(async (doc) => {
    // doc.data() is never undefined for query doc snapshots
    const token = oauth2.accessToken.create({
      access_token: doc.data()['Suunto App'].access_token,
      refresh_token: doc.data()['Suunto App'].refresh_token,
    });
    let responseToken;
    const date = new Date();
    try {
      responseToken = await token.refresh();
    } catch (e) {
      console.log(`Could not refresh token for user ${doc.id}`);
      if (e.code === 1) {
        console.log(`Error with code 1 deleting token ${doc.id}`);
        try {
          await doc.ref.delete();
        }catch (e) {
          console.error(`Could not delete token ${doc.id}`);
        }
      }
      return;
    }
    await doc.ref.update({
      'Suunto App': {
        access_token: responseToken.token.access_token,
        refresh_token: responseToken.token.refresh_token,
        expires_at: responseToken.token.expires_at.getTime(),
        expires_in: responseToken.token.expires_in,
        scope: responseToken.token.scope,
        token_type: responseToken.token.token_type,
        user: responseToken.token.user,
        date: date.getTime(),
      }
    });
  });
});
