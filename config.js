module.exports = {
  issuer: {
    'silverlake-local': {
      issuer: 'https://www.banno.com/a/consumer/api/oidc',
      authorization_endpoint: 'https://2019silverlake.banno-production.com/a/consumer/api/oidc/auth',
      token_endpoint: 'https://2019silverlake.banno-production.com/a/consumer/api/oidc/token',
      jwks_uri: 'https://2019silverlake.banno-production.com/a/consumer/api/oidc/certs'
    }
  },
  client: {
    'silverlake-local': {
      client_id: '55fc6a69-a4dd-404c-97f9-e2361b4c44b1', // These credentials are designed for *demonstration* purposes only.
      client_secret: 'da9003cc-438a-4bbe-95d0-9af6ffe36d6a', // These credentials are designed for *demonstration* purposes only.
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      redirect_uris: ['https://localhost:8080/auth/cb']
    }
  },
  consumerApi: {
    environment: 'https://2019silverlake.banno-production.com',
    usersBase: '/a/consumer/api/v0/users/'
  }
}