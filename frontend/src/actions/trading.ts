"use server";

import { graphql } from "@/gql";
import type { OrderType, OrderSide } from "@/gql/graphql";
import { serverQuery } from "@/lib/graphql/server";
import { run } from "./run";

const PlaceOrderMutation = graphql(`
  mutation PlaceOrder($portfolioId: ID!, $assetId: ID!, $side: OrderSide!, $orderType: OrderType!, $quantity: Float!, $limitPrice: Float) {
    placeOrder(portfolioId: $portfolioId, assetId: $assetId, side: $side, orderType: $orderType, quantity: $quantity, limitPrice: $limitPrice) {
      id
    }
  }
`);

export type NewOrder = {
  assetId: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPrice?: number;
};

export async function placeOrderAction(portfolioId: string, input: NewOrder) {
  return run(() => serverQuery(PlaceOrderMutation, { portfolioId, ...input }));
}

const CancelOrderMutation = graphql(`
  mutation CancelOrder($id: ID!) {
    cancelOrder(id: $id) {
      id
    }
  }
`);

export async function cancelOrderAction(id: string) {
  return run(() => serverQuery(CancelOrderMutation, { id }));
}

const FillOrderMutation = graphql(`
  mutation FillOrder($id: ID!, $fillPrice: Float!, $fee: Float, $executedAt: String) {
    fillOrder(id: $id, fillPrice: $fillPrice, fee: $fee, executedAt: $executedAt) {
      id
    }
  }
`);

export async function fillOrderAction(id: string, input: { fillPrice: number; fee?: number; executedAt?: string }) {
  return run(() => serverQuery(FillOrderMutation, { id, ...input }));
}

const ExecuteSignalMutation = graphql(`
  mutation ExecuteTradingSignal($id: ID!, $quantity: Float!, $orderType: OrderType, $limitPrice: Float) {
    executeTradingSignal(id: $id, quantity: $quantity, orderType: $orderType, limitPrice: $limitPrice) {
      id
    }
  }
`);

export async function executeSignalAction(
  id: string,
  input: { quantity: number; orderType?: OrderType; limitPrice?: number },
) {
  return run(() => serverQuery(ExecuteSignalMutation, { id, ...input }));
}

const DismissSignalMutation = graphql(`
  mutation DismissTradingSignal($id: ID!) {
    dismissTradingSignal(id: $id) {
      id
    }
  }
`);

export async function dismissSignalAction(id: string) {
  return run(() => serverQuery(DismissSignalMutation, { id }));
}
