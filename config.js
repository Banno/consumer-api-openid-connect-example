module.exports = {
  issuer: {
    'silverlake-local': {
      issuer: 'https://www.banno.com/a/consumer/api/oidc',
      authorization_endpoint: 'https://silverlake.banno-production.com/a/consumer/api/oidc/auth',
      token_endpoint: 'https://silverlake.banno-production.com/a/consumer/api/oidc/token',
      jwks_uri: 'https://silverlake.banno-production.com/a/consumer/api/oidc/certs'
    }
  },
  client: {
    'silverlake-local': {
      client_id: '42b799f2-e543-4910-b5ec-e69fd458814b', // These credentials are designed for *demonstration* purposes only.
      client_secret: 'd75b6fb3-91b8-4935-9251-651b294249de', // These credentials are designed for *demonstration* purposes only.
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      redirect_uris: ['https://localhost:8080/auth/cb']
    }
  }
}