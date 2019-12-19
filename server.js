/*
 * Copyright 2019 Jack Henry & Associates, Inc.®
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const fs = require('fs')
const https = require('https')
const fetch = require('node-fetch')
const { Strategy, Issuer } = require('openid-client')
const passport = require('passport')
const express = require('express')
const session = require('express-session')
const config = require('./config')

const env = process.env.ENVIRONMENT
console.log("Environment: " + env)

// Configure the OpenID Connect client based on the issuer.
const issuer = new Issuer(config.issuer[`silverlake-${env}`]);
const client = new issuer.Client(config.client[`silverlake-${env}`]);

client.CLOCK_TOLERANCE = 300; // to allow a 5 minute clock skew for verification

// This example project doesn't include any storage mechanism(e.g. a database) for access tokens.
// Therefore, we use this as our 'storage' for the purposes of this example.
// This method is NOT recommended for use in production systems.
let accessToken;

// Configure the Passport strategy for OpenID Connect.
const passportStrategy = new Strategy({
  client: client,
  params: {
    redirect_uri: config.client[`silverlake-${env}`].redirect_uris[0],
    scope: 'openid profile banno', // These are the OpenID Connect scopes that you'll need.
  },
}, (tokenSet, done) => {
  console.log(tokenSet)
  accessToken = tokenSet.access_token;
  return done(null, tokenSet.claims);
});

const port = process.env.PORT || 8080

const app = express();
app.use(session({
  secret: 'foo',
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use('openidconnect', passportStrategy);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.get('/', (req, res, next) => {
  res.redirect('/hello');
});

// This routing path handles the start of an authentication request.
// This is the path used in '/login.html' when you click the 'Sign in with Banno' button.
app.get('/auth', (req, res, next) => {
  const options = {
    // Random string for state
    state: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  };
  req.session.oAuthState = req.session.oAuthState || {};
  req.session.oAuthState[options.state] = {};
  // If we have a deep link path query parameter, save it in a state parameter
  // so that we can redirect to the correct page when the OAuth flow completes
  // See https://auth0.com/docs/protocols/oauth2/redirect-users
  if (req.query.returnPath && req.query.returnPath[0] === '/') {
    req.session.oAuthState[options.state].returnPath = req.query.returnPath;
  }
  return passport.authenticate('openidconnect', options)(req, res, next);
}
);

// This routing path handles the authentication callback.
// This path (including the host information) must be configured in Banno SSO settings.
app.get('/auth/cb', (req, res, next) =>
  passport.authenticate('openidconnect', (err, user, info) => {
    console.log(err, user, info);
    if (err || !user) {
      return res.redirect('/login.html');
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      let nextPath = '/me';
      // If a state parameter is present and has a matching local state, lookup the value
      if (req.query.state) {
        if (req.session.oAuthState && req.session.oAuthState[req.query.state]) {
          if (req.session.oAuthState[req.query.state].returnPath) {
            nextPath = req.session.oAuthState[req.query.state].returnPath;
          }

          delete req.session.oAuthState[req.query.state];
        } else {
          console.error('State parameter not found in store');
          return res.redirect('/login.html');
        }
      }
      return res.redirect(nextPath);
    });
  })(req, res, next)
);

// This routing path shows the OpenID Connect claims for the authenticated user.
// This path is where you'll be redirected once you sign in.
app.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    res.redirect('/login.html?returnPath=/me');
    return;
  }
  res.set('Content-Type', 'application/json').send(JSON.stringify(req.session.passport.user, undefined, 2));
});

app.get('/hello', (req, res) => {
  if (!req.isAuthenticated()) {
    res.redirect('/login.html?returnPath=/hello');
    return;
  }
  res.set('Content-Type', 'text/plain').send(`Hello ${req.session.passport.user.name}`);
});

// This routing path shows the Accounts and Transactions for the authenticated user.
app.get('/accountsAndTransactions', (req, res) => {
  if (!req.isAuthenticated()) {
    res.redirect('/login.html?returnPath=/accountsAndTransactions');
    return;
  }

  const userId = req.session.passport.user.sub;

  getAccountsAndTransactions(userId, res);
});

app.use(express.static('public'));

if (env === 'local') {
  // Running the server locally requires a cert due to HTTPS requirement for the authentication callback.
  const server = https.createServer({
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert')
  }, app)
  server.listen(port, () => console.log(`Server listening on https://localhost:${port}...`))
} else {
  app.listen(port, () => console.log(`Server listening on http://localhost:${port}...`))
}

async function getAccountsAndTransactions(userId, res) {
  // Set up
  const consumerApiEnvironment = 'https://silverlake.banno-production.com'
  const consumerApiUsersBase = '/a/consumer/api/users/'
  const consumerApiPath = consumerApiEnvironment + consumerApiUsersBase;
  
  let output = '';

  // PUT Fetch
  const taskId = await putFetch(consumerApiPath, userId, accessToken);

  // GET Tasks
  await getTasksUntilTaskEndedEventIsReceived(consumerApiPath, userId, taskId, accessToken);

  // GET Accounts
  const accounts = await getAccounts(consumerApiPath, userId, accessToken);

  accounts.forEach(account => {
    const accountId = account.id;
    const accountBalance = account.balance;

    output += 'Account ID: ' + accountId + '\n';
    output += '  ' + 'Balance: ' + accountBalance + '\n\n';
  });

  // GET Transactions
  const transactions = await getTransactions(consumerApiPath, userId, accessToken);

  transactions.forEach(transaction => {
    const transactionId = transaction.id;
    const transactionAccountId = transaction.accountId;
    const transactionAmount = transaction.amount;
    const transactionMemo = transaction.memo;

    output += 'Transaction ID: ' + transactionId + '\n';
    output += '  ' + 'Account ID: ' + transactionAccountId + '\n';
    output += '  ' + 'Amount: ' + transactionAmount + '\n';
    output += '  ' + 'Memo: ' + transactionMemo + '\n\n';
  });

  res.set('Content-Type', 'text/plain').send(output);
}

async function getTasksUntilTaskEndedEventIsReceived(consumerApiPath, userId, taskId, accessToken) {
  
  let taskEndedEventReceived = false;
  
  while (taskEndedEventReceived != true) {
    const events = await getTasks(consumerApiPath, userId, taskId, accessToken);

    events.forEach(event => {
      const eventType = event.type;
      
      if (eventType == 'TaskEnded') {
        taskEndedEventReceived = true;
      }
    });
  }
}

async function getTransactions(consumerApiPath, userId, accessToken) {
  const transactionsApiResponse = await fetch(consumerApiPath + userId + '/transactions', {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  const transactionsApiJson = await transactionsApiResponse.json();
  const transactions = transactionsApiJson.transactions;
  return transactions;
}

async function getAccounts(consumerApiPath, userId, accessToken) {
  const accountsApiResponse = await fetch(consumerApiPath + userId + '/accounts', {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  const accountsApiJson = await accountsApiResponse.json();
  const accounts = accountsApiJson.accounts;
  return accounts;
}

async function getTasks(consumerApiPath, userId, taskId, accessToken) {
  const tasksApiResponse = await fetch(consumerApiPath + userId + '/tasks/' + taskId, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  const tasksApiJson = await tasksApiResponse.json();
  const events = tasksApiJson.events;
  return events;
}

async function putFetch(consumerApiPath, userId, accessToken) {
  const fetchApiResponse = await fetch(consumerApiPath + userId + '/fetch', {
    method: 'put',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  const fetchApiJson = await fetchApiResponse.json();
  const taskId = fetchApiJson.taskId;
  return taskId;
}
