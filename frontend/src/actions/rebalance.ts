"use server";

import { graphql } from "@/gql";
import { serverQuery } from "@/lib/graphql/server";
import { run } from "./run";

const SetTargetWeightMutation = graphql(`
  mutation SetPositionTargetWeight($portfolioId: ID!, $assetId: ID!, $targetWeight: Float) {
    setPositionTargetWeight(portfolioId: $portfolioId, assetId: $assetId, targetWeight: $targetWeight) {
      assetId
    }
  }
`);

/** `targetWeight: null` clears it. */
export async function setTargetWeightAction(portfolioId: string, assetId: string, targetWeight: number | null) {
  return run(() => serverQuery(SetTargetWeightMutation, { portfolioId, assetId, targetWeight }));
}

const RecordRebalanceMutation = graphql(`
  mutation RecordRebalance($portfolioId: ID!, $description: String) {
    recordRebalance(portfolioId: $portfolioId, description: $description) {
      id
    }
  }
`);

export async function recordRebalanceAction(portfolioId: string, description?: string) {
  return run(() => serverQuery(RecordRebalanceMutation, { portfolioId, description: description || undefined }));
}
