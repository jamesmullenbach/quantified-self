import * as functions from "firebase-functions";
import {create} from "simple-oauth2";

/**
 * Creates a configured simple-oauth2 client for Suunto app.
 */
export function suuntoAppOAuthClient() {
  // Suunto app OAuth 2 setup
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
  return create(credentials);
}
