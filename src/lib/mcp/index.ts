import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getFinancialSnapshot from "./tools/get-financial-snapshot";
import listWallets from "./tools/list-wallets";
import listTransactions from "./tools/list-transactions";
import createTransaction from "./tools/create-transaction";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "personal-cfo-mcp",
  title: "Personal CFO",
  version: "0.1.0",
  instructions:
    "Outils pour interagir avec les finances personnelles de l'utilisateur (portefeuilles, transactions, snapshot financier). Devise de référence: MGA.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getFinancialSnapshot, listWallets, listTransactions, createTransaction],
});
