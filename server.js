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

const fs = require('fs');
const https = require('https');
const fetch = require('node-fetch');
const { Strategy, Issuer, custom } = require('openid-client');
const passport = require('passport');
const express = require('express');
const session = require('express-session');
const config = require('./config');

const env = process.env.ENVIRONMENT;
console.log(`Environment: ${env}`);

(async () => {
// Configure the OpenID Connect client based on the issuer.
const issuer = await Issuer.discover(config.issuer[`garden-${env}`]);
const client = new issuer.Client(config.client[`garden-${env}`]);

client[custom.clock_tolerance] = 300; // to allow a 5 minute clock skew for verification

// This example project doesn't include any storage mechanism(e.g. a database) for access tokens.
// Therefore, we use this as our 'storage' for the purposes of this example.
// This method is NOT recommended for use in production systems.
let accessToken;

const claims = {
  given_name: null,
  family_name: null,
  name: null,
  address: null,
  phone: null,
  email: null,
  'https://api.banno.com/consumer/claim/institution_id': null
};

// Configure the Passport strategy for OpenID Connect.
const passportStrategy = new Strategy({
  client: client,
  params: {
    redirect_uri: config.client[`garden-${env}`].redirect_uris[0],
    scope: 'openid https://api.banno.com/consumer/auth/offline_access', // These are the OpenID Connect scopes that you'll need.
    claims: JSON.stringify({
      // Authenticated information about the user can be returned in these ways:
      // - as Claims in the Identity Token,
      // - as Claims returned from the UserInfo endpoint,
      // - as Claims in both the Identity Token and from the UserInfo Endpoint.
      //
      // See https://openid.net/specs/openid-connect-core-1_0.html#ClaimsParameter
      id_token: claims,
      userinfo: claims
    })
  },
  usePKCE: true
}, (tokenSet, done) => {
  console.log(tokenSet);
  accessToken = tokenSet.access_token;
  return done(null, tokenSet.claims());
});

const port = process.env.PORT || 8080

const app = express();
app.use(session({
  secret: 'foo',
  resave: false,
  saveUninitialized: true,
  // This example project can be used to build a plugin using the Plugin Framework.
  // Note that this example project's particular cookie technique will only work in Chromium-based browsers e.g.
  // - Google Chrome
  // - newer versions of Microsoft Edge
  //
  // Note that these cookies are going to be blocked by Chromium-based browsers in the future, and are already
  // blocked by Safari and Firefox by default.
  //
  // Safari can be made to work by disabling the "Prevent cross-site tracking" option. This will work for the developer,
  // but isn't a solution for production usage.
  cookie: {
    sameSite: 'none',
    secure: true
  }
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
app.get('/auth/cb', (req, res, next) => {
  // This is an undocumented workaround for a quirk in how sessions are handled by this project's
  // specific OpenID Connect client (https://github.com/panva/node-openid-client) dependency.
  //
  // The issue presents itself when using this example project to build a plugin for the Plugin Framework.
  //
  // Developers must ensure that protections are put in place to ensure that requests arriving
  // without an existing session and state are not vulnerable to cross-site request forgeries.
  req.session[passportStrategy._key] = req.session[passportStrategy._key] || { 'key': 'DO_NOT_USE_IN_PRODUCTION'};

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
});

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
  const consumerApiPath = `${config.consumerApi.environment}${config.consumerApi.usersBase}`;

  let output = '';

  // PUT Fetch
  const taskId = await putFetch(consumerApiPath, userId, accessToken);

  // GET Tasks
  await getTasksUntilTaskEndedEventIsReceived(consumerApiPath, userId, taskId, accessToken);

  // GET Accounts
  const accounts = await getAccounts(consumerApiPath, userId, accessToken);

  for (const account of accounts) {
    const accountId = account.id;
    const accountBalance = account.balance;

    output += `
    Account ID: ${accountId}
      Balance: ${accountBalance}
    `;

    // GET Transactions
    const transactions = await getTransactions(consumerApiPath, userId, accountId, accessToken);

    transactions.forEach(transaction => {
      const transactionId = transaction.id;
      const transactionAccountId = transaction.accountId;
      const transactionAmount = transaction.amount;
      const transactionMemo = transaction.memo;

      output += `
      Transaction ID: ${transactionId}
        Account ID: ${transactionAccountId}
        Amount: ${transactionAmount}
        Memo: ${transactionMemo}
      `;
    });
  }

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

    if (!taskEndedEventReceived) {
      // We should wait a while while the aggregation work is performed on the server,
      // then we can check again.
      sleep(3000);
    }
  }
}

async function getTransactions(consumerApiPath, userId, accountId, accessToken) {
  const transactionsApiResponse = await fetch(`${consumerApiPath}${userId}/accounts/${accountId}/transactions`, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  const transactionsApiJson = await transactionsApiResponse.json();
  const transactions = transactionsApiJson.transactions;
  return transactions;
}

async function getAccounts(consumerApiPath, userId, accessToken) {
  const accountsApiResponse = await fetch(`${consumerApiPath}${userId}/accounts`, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  const accountsApiJson = await accountsApiResponse.json();
  const accounts = accountsApiJson.accounts;
  return accounts;
}

async function getTasks(consumerApiPath, userId, taskId, accessToken) {
  const tasksApiResponse = await fetch(`${consumerApiPath}${userId}/tasks/${taskId}`, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  const tasksApiJson = await tasksApiResponse.json();
  const events = tasksApiJson.events;
  return events;
}

async function putFetch(consumerApiPath, userId, accessToken) {
  const fetchApiResponse = await fetch(`${consumerApiPath}${userId}/fetch`, {
    method: 'put',
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  const fetchApiJson = await fetchApiResponse.json();
  const taskId = fetchApiJson.taskId;
  return taskId;
}

function sleep(milliseconds) {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
}
})();
