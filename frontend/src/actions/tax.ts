"use server";

import { graphql } from "@/gql";
import type { CalculatePersonalIncomeTaxQuery, PersonalIncomeTaxInput, TaxStatus } from "@/gql/graphql";
import { GraphQLRequestError, serverQuery } from "@/lib/graphql/server";
import { run } from "./run";

const UpdateTaxRecordMutation = graphql(`
  mutation UpdateTaxRecordStatus($id: ID!, $status: TaxStatus) {
    updateTaxRecord(id: $id, status: $status) {
      id
    }
  }
`);

const CalculateTaxQuery = graphql(`
  query CalculatePersonalIncomeTax($input: PersonalIncomeTaxInput!) {
    calculatePersonalIncomeTax(input: $input) {
      taxYear
      totalIncome
      expenses
      totalDeductions
      netIncome
      brackets {
        from
        upTo
        rate
        taxableAmount
        tax
      }
      grossTax
      taxCredits
      taxPayable
      refund
      effectiveRate
      marginalRate
      disclaimer
    }
  }
`);

export async function setTaxRecordStatusAction(id: string, status: TaxStatus) {
  return run(() => serverQuery(UpdateTaxRecordMutation, { id, status }));
}

export type TaxCalculation = NonNullable<CalculatePersonalIncomeTaxQuery["calculatePersonalIncomeTax"]>;

/** A read, not a write — so no refresh(), unlike the actions that go through run(). */
export async function calculateTaxAction(
  input: PersonalIncomeTaxInput,
): Promise<{ result?: TaxCalculation; error?: string }> {
  try {
    const { calculatePersonalIncomeTax } = await serverQuery(CalculateTaxQuery, { input });
    return calculatePersonalIncomeTax ? { result: calculatePersonalIncomeTax } : { error: "No result" };
  } catch (e) {
    if (e instanceof GraphQLRequestError) return { error: e.message };
    if (e instanceof TypeError) return { error: "Couldn't reach the server" };
    throw e;
  }
}
