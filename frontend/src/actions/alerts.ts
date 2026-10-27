"use server";

import { graphql } from "@/gql";
import type { AlertCondition } from "@/gql/graphql";
import { serverQuery } from "@/lib/graphql/server";
import { run } from "./run";

const CreateAlertMutation = graphql(`
  mutation CreateAlert($assetId: ID!, $condition: AlertCondition!, $targetValue: Float!) {
    createAlert(assetId: $assetId, condition: $condition, targetValue: $targetValue) {
      id
    }
  }
`);

const UpdateAlertMutation = graphql(`
  mutation UpdateAlert($id: ID!, $isActive: Boolean) {
    updateAlert(id: $id, isActive: $isActive) {
      id
    }
  }
`);

const DeleteAlertMutation = graphql(`
  mutation DeleteAlert($id: ID!) {
    deleteAlert(id: $id)
  }
`);

export async function createAlertAction(assetId: string, condition: AlertCondition, targetValue: number) {
  return run(() => serverQuery(CreateAlertMutation, { assetId, condition, targetValue }));
}

export async function setAlertActiveAction(id: string, isActive: boolean) {
  return run(() => serverQuery(UpdateAlertMutation, { id, isActive }));
}

export async function deleteAlertAction(id: string) {
  return run(() => serverQuery(DeleteAlertMutation, { id }));
}
