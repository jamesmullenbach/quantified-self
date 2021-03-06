export const environment = {
  production: true,
  beta: false,
  localhost: false,
  firebase: {
    apiKey: 'AIzaSyBdR4jbTKmm_P4L7t26IFAgFn6Eoo02aU0',
    authDomain: 'quantified-self.io',
    databaseURL: 'https://quantified-self-io.firebaseio.com',
    projectId: 'quantified-self-io',
    storageBucket: 'quantified-self-io.appspot.com',
    messagingSenderId: '242713487388',
    appId: '1:242713487388:web:af0b3e931f2e96ed',
    measurementId: 'G-F8YB8P8091'
  },
  functions: {
    deauthorizeSuuntoAppURI: 'https://europe-west2-quantified-self-io.cloudfunctions.net/deauthorizeSuuntoApp',
    uploadRoute: 'https://europe-west2-quantified-self-io.cloudfunctions.net/importRouteToSuuntoApp',
    getSuuntoFITFile: 'https://europe-west2-quantified-self-io.cloudfunctions.net/getSuuntoFITFile',
    historyImportURI: 'https://europe-west2-quantified-self-io.cloudfunctions.net/addSuuntoAppHistoryToQueue',
    stWorkoutDownloadAsFit: 'https://europe-west2-quantified-self-io.cloudfunctions.net/stWorkoutDownloadAsFit',
    getGarminHealthAPIAuthRequestTokenRedirectURI: 'https://europe-west2-quantified-self-io.cloudfunctions.net/getGarminHealthAPIAuthRequestTokenRedirectURI',
    requestAndSetGarminHealthAPIAccessToken: 'https://europe-west2-quantified-self-io.cloudfunctions.net/requestAndSetGarminHealthAPIAccessToken',
    backfillHealthAPIActivities: 'https://europe-west2-quantified-self-io.cloudfunctions.net/backfillHealthAPIActivities',
    deauthorizeGarminHealthAPI: 'https://europe-west2-quantified-self-io.cloudfunctions.net/deauthorizeGarminHealthAPI',
  }
};
