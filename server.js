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

// Configure the Passport strategy for OpenID Connect.
const passportStrategy = new Strategy({
  client: client,
  params: {
    redirect_uri: config.client[`silverlake-${env}`].redirect_uris[0],
    scope: 'openid profile banno', // These are the OpenID Connect scopes that you'll need.
  },
}, (tokenSet, done) => {
  console.log(tokenSet)
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

app.get('/allthedata', (req, res) => {
  if (!req.isAuthenticated()) {
    res.redirect('/login.html?returnPath=/allthedata');
    return;
  }

  console.log('<=========================================================================================>');

  getAccountsAndTransactions(req.session.passport.user.sub);
  
  res.set('Content-Type', 'text/plain').send(`allthedata ${req.session.passport.user.name}`);
});


async function getAccountsAndTransactions(userId) {
  // Set up
  const bearerToken = ''
  const consumerApiEnvironment = 'https://silverlake.banno-production.com'
  const consumerApiUsersBase = '/a/consumer/api/users/'
  
  // PUT Fetch
  const fetchApiResponse = await fetch(consumerApiEnvironment + consumerApiUsersBase + userId + '/fetch', {
    method: 'put',
    headers: { 'Authorization': 'Bearer ' + bearerToken }
  });
  
  const fetchApiJson = await fetchApiResponse.json();
  const taskId = fetchApiJson.taskId;

  console.log('Task ID: ' + taskId);
  sleep(2000);

  // GET Tasks
  const tasksApiResponse = await fetch(consumerApiEnvironment + consumerApiUsersBase + userId + '/tasks/' + taskId, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + bearerToken }
  });

  const tasksApiJson = await tasksApiResponse.json();

  const events = tasksApiJson.events;

  events.forEach(event => {
    const eventType = event.type;

    console.log(eventType);
  });

  // GET Accounts
  const accountsApiResponse = await fetch(consumerApiEnvironment + consumerApiUsersBase + userId + '/accounts', {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + bearerToken }
  });

  const accountsApiJson = await accountsApiResponse.json();

  const accounts = accountsApiJson.accounts;

  accounts.forEach(account => {
    const accountId = account.id;
    const accountBalance = account.balance;

    console.log('Account -> ID: ' + accountId + ' , Balance: ' + accountBalance);
  });

  // GET Transactions
  const transactionsApiResponse = await fetch(consumerApiEnvironment + consumerApiUsersBase + userId + '/transactions', {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + bearerToken }
  });

  const transactionsApiJson = await transactionsApiResponse.json();

  const transactions = transactionsApiJson.transactions;

  transactions.forEach(transaction => {
    const transactionId = transaction.id;
    const transactionAmount = transaction.amount;
    const transactionMemo = transaction.memo;

    console.log('Transaction -> ID: ' + transactionId + ' , Amount: ' + transactionAmount + ' , Memo: ' + transactionMemo);
  });
}

function sleep(milliseconds) {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
}

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
