import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getFinancialSnapshot from "./tools/get-financial-snapshot";
import listWallets from "./tools/list-wallets";
import listTransactions from "./tools/list-transactions";
import createTransaction from "./tools/create-transaction";
import listBudgets from "./tools/list-budgets";
import listProjects from "./tools/list-projects";
import listAssets from "./tools/list-assets";
import listShoppingLists from "./tools/list-shopping-lists";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "personal-cfo-mcp",
  title: "Personal CFO",
  version: "0.1.0",
  instructions:
    "Outils pour interagir avec les finances personnelles de l'utilisateur (portefeuilles, transactions, budgets, projets, actifs, listes d'achats, snapshot financier). Utilise get_financial_snapshot pour une vue synthétique, puis list_budgets/list_projects/list_assets/list_shopping_lists/list_transactions pour le détail avant d'analyser, critiquer ou guider. Devise de référence: MGA.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getFinancialSnapshot, listWallets, listTransactions, createTransaction, listBudgets, listProjects, listAssets, listShoppingLists],
});
