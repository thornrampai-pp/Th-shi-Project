import { builder } from '../graphql/builder';

// Importing each module for its side effects — every file below calls
// builder.queryField()/mutationField()/objectRef() at import time, registering
// itself onto the shared builder. Order matters only where one module's schema
// file references another's exported type (e.g. auth.schema.ts uses UserType from
// user.schema.ts) — imports below are ordered so dependencies load first.
import './root.schema';
import './user/user.schema';
import './auth/auth.schema';
import './notification/notification.schema';
import './asset/asset.schema';
import './portfolio/portfolio.schema';
import './ledger/ledger.schema';
import './transaction/transaction.schema';
import './snapshot/snapshot.schema';
import './fx/fx.schema';
import './tax/tax.schema';
import './thesis/thesis.schema';
import './watchlist/watchlist.schema';
import './alert/alert.schema';
import './trading/trading.schema';
import './history/history.schema';

// Add each new module's import above as phases land, then it's registered —
// nothing else in this file needs to change.
export const schema = builder.toSchema();
