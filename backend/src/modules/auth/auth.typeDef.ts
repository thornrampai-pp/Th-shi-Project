import gql from 'graphql-tag';

export const authTypeDefs = gql`
  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  extend type Mutation {
    register(email: String!, password: String!, firstName: String, lastName: String): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    refreshToken(refreshToken: String!): AuthPayload!
    logout(refreshToken: String!): Boolean!
    revokeAllSessions: Boolean!
    changePassword(oldPassword: String!, newPassword: String!): Boolean!
  }
`;
