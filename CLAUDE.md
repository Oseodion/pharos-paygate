# pharos-paygate

MCP (Model Context Protocol) server that gives AI agents a complete payments toolkit on the Pharos Atlantic Testnet: balance reads, token transfers, conditional and batch payments, gas estimation, transaction history, and x402 machine-to-machine payments.

## Network

| Setting | Value |
|---|---|
| Network | Pharos Atlantic Testnet |
| RPC URL | https://atlantic.dplabs-internal.com |
| Chain ID | 688689 |
| Explorer | https://atlantic.pharosscan.xyz |
| Explorer API | https://atlantic.pharosscan.xyz/api |
| x402 facilitator | https://x402.org/facilitator |

## Contract addresses (Atlantic Testnet)

| Contract | Address | Decimals |
|---|---|---|
| USDC | 0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B | 6 |
| USDT | 0xE7E84B8B4f39C507499c40B4ac199B050e2882d5 | 6 |
| WETH | 0x7d211F77525ea39A0592794f793cC1036eEaccD5 | 18 |
| WPHRS | 0x838800b758277CC111B2d48Ab01e5E164f8E9471 | 18 |
| MultiCall3 | 0xcA11bde05977b3631167028862bE2a173976CA11 | - |
| x402 test USDC | 0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8 | 6 |

All of these live in `src/config/pharos.ts`. PHRS is the native gas token (18 decimals) and is handled separately from the ERC20 map.

## Architecture

- `src/index.ts` registers the 9 tools on an `McpServer` (stdio transport). Every handler is wrapped in `safeHandler` so a thrown error becomes a JSON failure envelope instead of crashing the server.
- `src/config/pharos.ts` holds the viem chain definition, token map, ERC20 ABI, CoinGecko ID map, and explorer helpers.
- `src/utils/client.ts` holds lazy singletons for the viem public client (reads) and wallet client (writes, signed with `PRIVATE_KEY` from env), plus the `ok()`/`fail()` result helpers.
- `src/tools/*.ts` each export a zod input schema (`<name>Schema`, a raw zod shape) and an async handler returning `{success, data, error?}`.

Shared internals worth knowing:

- `transferToken()` in `src/tools/sendToken.ts` is the single ERC20 transfer path. `send_usdc`, `conditional_payment`, and `batch_send` all call it.
- `fetchTokenPrice()` in `src/tools/getTokenPrice.ts` is the single price path. `conditional_payment` and `estimate_gas` reuse it. PHRS is not on CoinGecko so it returns a fixed $0.10 estimate with a note.

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

## Adding a new tool

1. Create `src/tools/myTool.ts` exporting:
   - `myToolSchema` - a raw zod shape (plain object of zod validators, not `z.object(...)`)
   - `myTool(input): Promise<ToolResult>` - wrap the body in try/catch and return `ok(data)` or `fail(error)`
2. Register it in `src/index.ts`: `server.tool("my_tool", "description", myToolSchema, safeHandler(myTool))`
3. `npm run build` and test with the inspector.

Rules: never hardcode private keys, accept human readable amounts and convert internally, always return the `{success, data, error?}` envelope, never throw out of a handler.

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
