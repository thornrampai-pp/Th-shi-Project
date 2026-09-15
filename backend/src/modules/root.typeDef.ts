import { gql } from 'graphql-tag';

// Base Query/Mutation — every module below extends these with `extend type Query/Mutation`.
export const rootTypeDefs = gql`
  type HealthStatus {
    status: String!
    dbConnected: Boolean!
  }

  type Query {
    health: HealthStatus!
  }

  type Mutation {
    _empty: String
  }
`;
