module.exports = {
  issuer: {
    'silverlake-local': {
      issuer: 'https://uat.banno.com/a/consumer/api/oidc',
      authorization_endpoint: 'https://2019silverlake.banno-uat.com/a/consumer/api/oidc/auth',
      token_endpoint: 'https://2019silverlake.banno-uat.com/a/consumer/api/oidc/token',
      jwks_uri: 'https://2019silverlake.banno-uat.com/a/consumer/api/oidc/certs'
    }
  },
  client: {
    'silverlake-local': {
      client_id: 'cccf3193-ae12-474c-a2a3-5ee17db83823', // These credentials are designed for *demonstration* purposes only.
      client_secret: '27e75624-ed9b-4c1e-a2be-5b22b8891bb3', // These credentials are designed for *demonstration* purposes only.
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      redirect_uris: ['https://plugin.2019silverlake.banno-uat.com/auth/cb']
    }
  },
  consumerApi: {
    environment: 'https://2019silverlake.banno-uat.com',
    usersBase: '/a/consumer/api/v0/users/'
  }
}