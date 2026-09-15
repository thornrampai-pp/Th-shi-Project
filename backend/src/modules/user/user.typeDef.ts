import { gql } from 'graphql-tag';

export const userTypeDefs = gql`
  enum UserRole {
    USER
    ADMIN
  }

  type User {
    id: ID!
    email: String!
    firstName: String
    lastName: String
    imageUrl: String
    role: UserRole!
    taxResidency: String!
    isActive: Boolean!
    createdAt: String!
  }

  extend type Query {
    me: User!
  }

  extend type Mutation {
    updateProfile(firstName: String, lastName: String, imageUrl: String, taxResidency: String): User!
    deactivateAccount: Boolean!
  }
`;
