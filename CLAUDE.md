# pharos-paygate

MCP (Model Context Protocol) server that gives AI agents a complete payments and security toolkit on Pharos (Atlantic Testnet and Pacific Mainnet): balance reads, token transfers, conditional/multi-condition and batch payments, gas estimation, transaction history, x402 machine-to-machine payments, GoPlus security screening, safety-gated transfers, payment requests/verification, native token wrapping, wallet profiling, and network stats. 20 tools total, each with an optional `network` parameter.

## Networks

| Setting | Atlantic Testnet (default) | Pacific Mainnet |
|---|---|---|
| Network name | Pharos Atlantic Testnet | Pharos Pacific Mainnet |
| RPC URL | https://atlantic.dplabs-internal.com | https://rpc.pharos.xyz |
| Chain ID | 688689 | 1672 |
| Native token | PHRS | PROS |
| Wrapped native | WPHRS | WPROS |
| Explorer | https://atlantic.pharosscan.xyz | https://www.pharosscan.xyz |
| Explorer API | https://atlantic.pharosscan.xyz/api | https://www.pharosscan.xyz/api |

Shared services: x402 facilitator https://x402.org/facilitator, GoPlus Security API https://api.gopluslabs.io/api/v1, MultiCall3 0xcA11bde05977b3631167028862bE2a173976CA11 on both chains.

## Dual network architecture

Network selection is centralized in `src/config/pharos.ts`:

- `type Network = "testnet" | "mainnet"`.
- `resolveNetwork(network?)` resolves an explicit arg, then `process.env.NETWORK`, then `"testnet"`.
- `getNetworkConfig(network?)` returns the resolved `{ network, chain, tokens, explorer, explorerApi, chainId, networkName, nativeSymbol, wrappedNativeSymbol, rpcUrl, facilitatorNetwork }`. This is the single source of truth every tool uses.
- `getPublicClient(network?)` / `getWalletClient(network?)` in `src/utils/client.ts` cache one viem client per network in a `Map`, so the testnet client stays a lazy singleton (backward compatible) and mainnet is created on first use.
- Backward-compatible exports are preserved: `TOKENS` aliases `TESTNET_TOKENS`, `pharosTestnet` aliases `pharosAtlantic`, and `CHAIN_ID` / `EXPLORER_URL` / `RPC_URL` still point at testnet. No existing import broke.
- `explorerTxLink(hash, network?)` builds the link from the resolved explorer.

Every tool schema carries `network: z.enum(["testnet","mainnet"]).optional()`. Tools thread `input.network` into `getNetworkConfig`, the clients, `transferToken`, `fetchBalances`, `fetchExplorerTxs`, and `assessWalletSafety`. Token lookups resolve from `getNetworkConfig(network).tokens` and return a clean "Token X is not available on <network>" error when a symbol does not exist on the chosen chain.

## Contract addresses

### Atlantic Testnet (chain 688689)

| Contract | Address | Decimals |
|---|---|---|
| USDC | 0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B | 6 |
| USDT | 0xE7E84B8B4f39C507499c40B4ac199B050e2882d5 | 6 |
| WETH | 0x7d211F77525ea39A0592794f793cC1036eEaccD5 | 18 |
| WPHRS | 0x838800b758277CC111B2d48Ab01e5E164f8E9471 | 18 |
| x402 test USDC | 0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8 | 6 |

### Pacific Mainnet (chain 1672)

| Contract | Address | Decimals |
|---|---|---|
| USDC | 0xc879c018db60520f4355c26ed1a6d572cdac1815 | 6 |
| WETH | 0x1f4b7011Ee3d53969bb67F59428a9ec0477856E9 | 18 |
| WPROS | 0x52c48d4213107b20bc583832b0d951fb9ca8f0b0 | 18 |
| LINK | 0x51e2A24742Db77604B881d6781Ee16B5b8fcBE29 | 18 |

These live in `TESTNET_TOKENS` and `MAINNET_TOKENS` in `src/config/pharos.ts`. The native gas token (PHRS / PROS, 18 decimals) is handled separately from the ERC20 maps.

## Architecture

- `src/index.ts` registers the 20 tools on an `McpServer` (stdio transport). Every handler is wrapped in `safeHandler` so a thrown error becomes a JSON failure envelope instead of crashing the server.
- `src/config/pharos.ts` holds both chain definitions, both token registries, the `Network` type and `getNetworkConfig` resolver, ERC20/WPHRS ABIs, CoinGecko ID map, and explorer helpers.
- `src/utils/client.ts` holds the per-network cached viem public client (reads) and wallet client (writes, signed with `PRIVATE_KEY` from env), plus the `ok()`/`fail()` result helpers.
- `src/tools/*.ts` each export a zod input schema (`<name>Schema`, a raw zod shape, including the optional `network`) and an async handler returning `{success, data, error?}`.

Shared internals worth knowing (all network-aware):

- `transferToken(token, to, amount, network?)` in `src/tools/sendToken.ts` is the single ERC20 transfer path. `send_usdc`, `conditional_payment`, `batch_send`, `safe_transfer`, and `multi_condition_payment` all call it.
- `fetchTokenPrice(token)` in `src/tools/getTokenPrice.ts` is the single price path. `conditional_payment`, `multi_condition_payment`, `estimate_gas`, and `get_wallet_profile` reuse it. PHRS/PROS are not on CoinGecko so they return a fixed $0.10 estimate with a note (WPHRS/WPROS are priced as the native token).
- `fetchBalances(address, network?)` in `src/tools/getWalletBalances.ts` is the single balance path. `get_wallet_profile` reuses it.
- `fetchExplorerTxs(address, limit, action?, contractAddress?, network?)` in `src/tools/getTransactionHistory.ts` is the single explorer path, supporting both `txlist` (native) and `tokentx` (ERC20, with contract filter). `verify_payment_received` reuses it.
- `assessWalletSafety(address, chainId?)` in `src/tools/checkWalletSafety.ts` is the single GoPlus address screening path. `safe_transfer` and `get_wallet_profile` reuse it, passing the resolved chain ID.

## How each tool works

1. `get_wallet_balances` - native balance via `getBalance` plus one multicall (MultiCall3) for all ERC20 `balanceOf` reads. Returns formatted and raw balances.
2. `get_token_price` - CoinGecko simple price API (no key). USDC = usd-coin, USDT = tether, WETH = ethereum, PHRS = $0.10 estimate.
3. `send_usdc` - wrapper around `transferToken("USDC", ...)`, echoes the optional memo, returns tx hash and explorer link.
4. `send_token` - generic `transferToken` for USDC/USDT/WETH/WPHRS. Amounts are human readable strings converted with `parseUnits` using the token's decimals.
5. `conditional_payment` - fetches the condition token price, evaluates gt/lt/gte/lte against the threshold, executes the transfer only if true. When skipped it returns the current price vs the condition.
6. `batch_send` - sequential `transferToken` calls per recipient. MultiCall3 cannot batch ERC20 transfers (it would become msg.sender and need allowances), so sends are sequential and one failure does not stop the rest. Returns per-recipient results plus a summary.
7. `get_transaction_history` - Etherscan-style `?module=account&action=txlist` query against the explorer API, normalized to `{hash, from, to, value, token, timestamp, status}`.
8. `estimate_gas` - `estimateGas` for a native or ERC20 transfer, `getGasPrice`, then total cost in PHRS and USD (PHRS at the $0.10 estimate).
9. `x402_pay_for_resource` - initial fetch; on 402 it parses the payment requirements from the body, rejects if the cheapest option exceeds `max_price`, otherwise signs with `ExactEvmScheme` via `@x402/fetch` `wrapFetchWithPayment` on network `eip155:688689` and retries. A client policy also filters out any requirement above the cap as a second guard.
10. `check_wallet_safety` - GoPlus `GET /address_security/{address}?chain_id=` screening. Flags are bucketed into malicious (cybercrime, stealing, phishing, etc.) and caution (blacklist doubt, mixer, etc.) sets, then mapped to a risk level: critical (sanctioned or stealing), high (any malicious flag), medium (blacklisted or 2+ caution flags), low (1 caution flag), safe (clean). Empty GoPlus result returns risk_level "unknown".
11. `check_token_safety` - GoPlus `GET /token_security/{chain_id}?contract_addresses=`. Honeypot = critical; ownership takeback or sell tax > 0.5 = high; otherwise scaled by risk count.
12. `check_contract_safety` - GoPlus `GET /contract_security/{chain_id}?contract_addresses=`. Self destruct or ownership takeback = high; otherwise scaled by risk item count.
13. `safe_transfer` - runs `assessWalletSafety()` on the recipient, aborts on high/critical risk (or when the screening service is unreachable) unless `skip_safety_check` is true, then executes via `transferToken()`. Result combines the safety report with the tx details.
14. `create_payment_request` - builds a structured request payable to the `PRIVATE_KEY` wallet: UUID, expiry, and a human readable `payment_uri`.
15. `verify_payment_received` - scans explorer history (`txlist` for PHRS, `tokentx` filtered by token contract for ERC20) for a successful incoming tx matching amount, token, optional sender, and time window.
16. `wrap_phrs` - `deposit()` on the WPHRS contract with the amount as msg.value.
17. `unwrap_phrs` - `withdraw(wad)` on the WPHRS contract.
18. `get_wallet_profile` - parallel `fetchBalances()` + `getTransactionCount` + `assessWalletSafety()`, then prices each balance for a USD portfolio total. Age estimate: new (<10 txs), active (10-100), veteran (>100).
19. `get_network_stats` - `getBlockNumber()`, `getGasPrice()`, `getBlock()` for a live network snapshot.
20. `multi_condition_payment` - fetches prices for every condition token in parallel, evaluates each gt/lt/gte/lte condition, combines with AND/OR, executes via `transferToken()` only when the combined result passes. Always returns the per-condition breakdown.

## GoPlus Security API

Base URL: `https://api.gopluslabs.io/api/v1` (free tier, no API key, exported as `GOPLUS_API_URL` in `src/config/pharos.ts`).

Endpoints used:

- `GET /address_security/{address}?chain_id={chain_id}` - malicious address flags ("0"/"1" strings: cybercrime, phishing_activities, stealing_attack, sanctioned, blacklist_doubt, mixer, ...)
- `GET /token_security/{chain_id}?contract_addresses={address}` - token analysis (result keyed by lowercase address: is_honeypot, buy_tax, sell_tax, is_mintable, ...)
- `GET /contract_security/{chain_id}?contract_addresses={address}` - contract analysis (is_open_source, is_proxy, selfdestruct, ...)

Behavior notes: GoPlus coverage of chain 688689 is sparse, so empty results are normal and must map to risk_level "unknown" with the message "No security data available for this address on this chain", never to an error. All calls use native fetch with try/catch; a GoPlus outage degrades to "unknown" everywhere except `safe_transfer`, which aborts rather than sending unscreened.

## WPHRS ABI

`WPHRS_ABI` in `src/config/pharos.ts` covers the WETH-style wrapper at `0x838800b758277CC111B2d48Ab01e5E164f8E9471`:

```typescript
export const WPHRS_ABI = [
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable", inputs: [{ name: "wad", type: "uint256" }], outputs: [] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
```

The same ABI drives WPROS on mainnet (`0x52c48d4213107b20bc583832b0d951fb9ca8f0b0`); `wrap_phrs` / `unwrap_phrs` resolve the wrapped-native token from `getNetworkConfig(network).wrappedNativeSymbol`. Regular wrapped-token transfers still use `ERC20_ABI`; `WPHRS_ABI` is only for wrap/unwrap.

## Adding a new tool

1. Create `src/tools/myTool.ts` exporting:
   - `myToolSchema` - a raw zod shape (plain object of zod validators, not `z.object(...)`). Add `network: z.enum(["testnet","mainnet"]).optional()` so the tool works on both chains.
   - `myTool(input): Promise<ToolResult>` - wrap the body in try/catch and return `ok(data)` or `fail(error)`
2. For any chain access, call `getNetworkConfig(input.network)` and `getPublicClient(input.network)` / `getWalletClient(input.network)` rather than hardcoding testnet.
3. Register it in `src/index.ts`: `server.tool("my_tool", "description", myToolSchema, safeHandler(myTool))`
4. `npm run build` and test with the inspector.

Rules: never hardcode private keys, accept human readable amounts and convert internally, default to testnet when no network is given, always return the `{success, data, error?}` envelope, never throw out of a handler.

## Testing

```bash
npm install
npm run build
npm start                # run the compiled server on stdio
npm run dev              # run from source with tsx
npm run inspector        # MCP Inspector UI for interactive tool calls
```

Quick protocol-level check without the inspector:

```bash
(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 2) | node dist/index.js
```

Read-only tools (`get_wallet_balances`, `get_token_price`, `get_transaction_history`) work without a `PRIVATE_KEY`. Sending tools need `PRIVATE_KEY` in `.env` and testnet funds.
