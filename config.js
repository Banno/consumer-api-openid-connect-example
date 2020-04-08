module.exports = {
  issuer: {
    'silverlake-local': {
      issuer: 'https://uat.banno.com/a/consumer/api/oidc',
      authorization_endpoint: 'https://silverlake.banno-uat.com/a/consumer/api/oidc/auth',
      token_endpoint: 'https://silverlake.banno-uat.com/a/consumer/api/oidc/token',
      jwks_uri: 'https://silverlake.banno-uat.com/a/consumer/api/oidc/certs'
    }
  },
  client: {
    'silverlake-local': {
      client_id: '042bd8a9-f470-4804-baa2-4910df7de9cf', // These credentials are designed for *demonstration* purposes only.
      client_secret: 'a85c2227-1198-4605-b2e5-326411aee27c', // These credentials are designed for *demonstration* purposes only.
      grant_types: ['authorization_code'],
      response_types: ['code'],
      // token_endpoint_auth_method: 'client_secret_basic',
      redirect_uris: ['https://localhost:8080/auth/cb']
    }
  },
  consumerApi: {
    environment: 'https://silverlake.banno-uat.com',
    usersBase: '/a/consumer/api/v0/users/'
  }
}