module.exports = {
  issuer: {
    'silverlake-local': 'https://2019silverlake.banno-uat.com/a/consumer/api/v0/oidc/.well-known/openid-configuration'
  },
  client: {
    'silverlake-local': {
      client_id: 'ada34b1f-2aee-43c6-9448-4d85ec59662d', // These credentials are designed for *demonstration* purposes only.
      client_secret: 'fd6674b3-0460-4ed2-a029-8035c5366bb6', // These credentials are designed for *demonstration* purposes only.
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      redirect_uris: ['https://localhost:8080/auth/cb']
    }
  },
  consumerApi: {
    environment: 'https://2019silverlake.banno-uat.com',
    usersBase: '/a/consumer/api/v0/users/'
  }
}