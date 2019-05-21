import * as functions from 'firebase-functions'
import * as admin from "firebase-admin";


export const insertToQueue = functions.https.onRequest(async (req, res) => {
  const userName = req.query.username ||  req.body.username;
  const workoutID = req.query.workoutid ||  req.body.workoutid;

  try {
    // Important -> keep the key based on username and workoutid to get updates on activity I suppose ....
    // @todo ask about this
    await admin.firestore().collection('suuntoAppWorkoutQueue').doc(`${userName}${workoutID}`).set({
      userName: userName,
      workoutID: workoutID,
      retryCount: 0,
    })
  }catch (e) {
    throw e;
  }
  res.send()
});
