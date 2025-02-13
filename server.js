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

// Note:
// If you're learning how to build a *plugin*, you should use this other example project - 
// https://github.com/Banno/simple-plugin-example

'use strict';

const fs = require('fs');
const fetch = require('node-fetch');
const { Strategy, Issuer, custom } = require('openid-client');
const passport = require('passport');
const express = require('express');
const session = require('express-session');
const config = require('./config');

console.log('Note: This is a local development server, it is meant as a demonstration of how to use the Banno OpenID Connect API. It is not meant to be used in production.');
console.log('API_ENVIRONMENT: ' + config.consumerApi.environment);

(async () => {
// Configure the OpenID Connect client based on the issuer.
const issuer = await Issuer.discover(config.issuer['garden']);
const client = new issuer.Client(config.client['garden']);

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
  // If you uncomment this line for the 'Unique Customer Identifer' Restricted claim,
  // the administrator at the financial institution would also need to enable that restricted claim
  // for the External Application used by this example in order to actually receive data for that claim.
  //'https://api.banno.com/consumer/claim/customer_identifier': null,
  'https://api.banno.com/consumer/claim/institution_id': null
};

// Configure the Passport strategy for OpenID Connect.
const passportStrategy = new Strategy({
  client: client,
  params: {
    redirect_uri: config.client['garden'].redirect_uris[0],
    // These are the OpenID Connect scopes that you'll need to:
    // - receive a Refresh Token
    // - get read-only access to Accounts data
    // - get read-only access to Transactions data
    //
    // For general information on scopes and claims, see https://jackhenry.dev/open-api-docs/authentication-framework/overview/openidconnectoauth/.
    //
    // For specific information on scopes for API endpoints, see the definitions in https://jackhenry.dev/open-api-docs/consumer-api/api-reference/.
    // Every API endpoint documented in our API Reference includes information on the scope necessary to use that endpoint.
    scope: 'openid https://api.banno.com/consumer/auth/offline_access https://api.banno.com/consumer/auth/accounts.readonly https://api.banno.com/consumer/auth/transactions.detail.readonly',
    claims: JSON.stringify({
      // Authenticated information about the user can be returned in these ways:
      // - as Claims in the Identity Token,
      // - as Claims returned from the UserInfo Endpoint,
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
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use('openidconnect', passportStrategy);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// If you click on the URL in the log, "Server listening on http://localhost:8080", that will open the URL in your web browser.
// In this case, we'll redirect you from the '/' route to the '/hello' route.
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
  passport.authenticate('openidconnect', (err, user, info) => {
    console.log(err, user, info);
    if (err || !user) {
      return res.redirect('/login.html');
    }
    const options = {
      keepSessionInfo: true
    }
    req.logIn(user, options, (err) => {
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

// This routing path shows a text string with "Hello (user.name)".
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

// Previous versions of this demo used provided certs to run a secure server,
// this is no longer neccesary for localhost
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`))

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
    const accountType = account.accountType;
    const accountSubtype = account.accountSubType;
    const accountRoutingNumber = account.routingNumber;

    output += `
    Account ID: ${accountId}
      Balance: ${accountBalance}
      Type: ${accountType}
      Subtype: ${accountSubtype}
      Routing Number: ${accountRoutingNumber}
    `;

    // GET Transactions
    const transactions = await getTransactions(consumerApiPath, userId, accountId, accessToken);

    if (transactions != null){
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
    } else {
      output += `
        No transactions for this account.
      `
    }
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
