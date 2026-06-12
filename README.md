# pharos-paygate

pharos-paygate is an MCP (Model Context Protocol) server that gives AI agents a complete payments toolkit on the Pharos Atlantic Testnet. It exposes 9 tools covering everything an agent needs to move money: checking balances, fetching prices, sending USDC or any supported token, conditional payments that only fire when a price condition is met, batch payouts, transaction history, gas estimation, and paying for x402-protected web resources. Install it once in Claude Desktop, Cursor, or any MCP-compatible client and your agent can transact on Pharos with plain English.

## Why this exists

AI agents are getting good at deciding *when* to pay for things, but they have no hands. They cannot hold a wallet, sign a transaction, or respond to an HTTP 402 Payment Required. Every team building agent commerce ends up rebuilding the same plumbing: RPC clients, decimal conversion, gas math, explorer lookups, payment protocol handshakes.

pharos-paygate packages all of that plumbing as a single MCP skill. The agent says "send 5 USDC to 0xabc..." and the skill handles address validation, decimal conversion, signing, broadcasting, waiting for the receipt, and handing back an explorer link. It also speaks x402, so an agent can buy access to paid APIs autonomously while staying inside a spending cap you set.

## The 9 tools

### 1. get_wallet_balances

Fetches PHRS (native), USDC, USDT, WETH, and WPHRS balances for any wallet in a single multicall.

- Input: `address` (string)
- Output: array of `{symbol, balance, raw}` for all 5 tokens

> "What's the balance of 0x1234...abcd on Pharos?"

### 2. get_token_price

Fetches a live USD price from the CoinGecko public API (no API key needed). PHRS is not listed on CoinGecko, so it returns a $0.10 estimate with a note saying so.

- Input: `token` (PHRS | USDC | USDT | WETH), `currency` (USD, default USD)
- Output: `{token, price, currency, source, timestamp}`

> "What's the current price of WETH?"

### 3. send_usdc

Sends USDC to an address. Amounts are human readable, so "5.00" means 5 USDC.

- Input: `to` (address), `amount` (string, e.g. "5.00"), `memo` (optional string)
- Output: `{txHash, explorer, status}` with a link like https://atlantic.pharosscan.xyz/tx/0x...

> "Send 5 USDC to 0x1234...abcd with the memo 'invoice 42'"

### 4. send_token

Generic transfer for any supported token. Decimals are handled per token (6 for USDC/USDT, 18 for WETH/WPHRS).

- Input: `token` (USDC | USDT | WETH | WPHRS), `to` (address), `amount` (string)
- Output: `{txHash, explorer, status}`

> "Transfer 0.01 WETH to 0x1234...abcd"

### 5. conditional_payment

Fetches the live price of a condition token, evaluates a comparison, and only sends the payment if the condition holds. If not, it tells you the current price versus the threshold and skips the payment.

- Input: `to`, `amount`, `token`, `condition_token` (PHRS | USDC | USDT | WETH), `condition_operator` (gt | lt | gte | lte), `condition_value` (string)
- Output: executed payment with tx hash, or a skip explanation with the current price

> "Send 5 USDC to 0x1234...abcd if WETH price is above 2000"

### 6. batch_send

Sends tokens to multiple recipients in sequence. One failed transfer does not stop the rest. Returns per-recipient results and a summary with success/fail counts and totals per token.

- Input: `recipients` (array of `{address, amount, token}`), `memo` (optional)
- Output: `{results, summary: {total, successCount, failCount, totalSentByToken}}`

> "Pay 2 USDC each to these three addresses: 0xaaa..., 0xbbb..., 0xccc..."

### 7. get_transaction_history

Fetches recent transactions for an address from the PharosScan explorer API.

- Input: `address` (string), `limit` (number, default 10, max 50)
- Output: array of `{hash, from, to, value, token, timestamp, status}`

> "Show me the last 10 transactions for my wallet"

### 8. estimate_gas

Estimates the gas cost of a transfer before sending it.

- Input: `to` (address), `token` (USDC | USDT | WETH | WPHRS | PHRS), `amount` (string)
- Output: `{estimatedGasUnits, gasPriceGwei, totalCostPhrs, totalCostUsd}`

> "How much gas would it cost to send 10 USDT to 0x1234...abcd?"

### 9. x402_pay_for_resource

Implements the x402 HTTP 402 payment protocol. Makes the initial request, parses the payment requirements from the 402 response, and if the price is within your `max_price` cap it signs the payment and retries the request with the payment header. If the price exceeds the cap, it refuses and reports the actual price required. Nothing is ever signed above your cap.

- Input: `url` (string), `max_price` (string, max USDC you are willing to pay, e.g. "0.01")
- Output: the resource data, the price paid, and the settlement receipt

> "Fetch https://api.example.com/premium-data and pay for it if it costs less than 0.05 USDC"

## Installation

You need Node.js 18 or newer.

```bash
git clone https://github.com/your-username/pharos-paygate.git
cd pharos-paygate
npm install
npm run build
```

Then create your env file:

```bash
cp .env.example .env
# edit .env and paste your wallet private key
```

Verify the server starts:

```bash
npm start
# should print: pharos-paygate MCP server running on stdio
```

For interactive testing there is an MCP Inspector script:

```bash
npm run inspector
```

## Add to Claude Desktop

Open your Claude Desktop config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add this entry (adjust the path to wherever you cloned the repo):

```json
{
  "mcpServers": {
    "pharos-paygate": {
      "command": "node",
      "args": ["/absolute/path/to/pharos-paygate/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "your_wallet_private_key_here",
        "RPC_URL": "https://atlantic.dplabs-internal.com",
        "CHAIN_ID": "688689",
        "FACILITATOR_URL": "https://x402.org/facilitator"
      }
    }
  }
}
```

Restart Claude Desktop and the 9 tools will show up under the pharos-paygate server.

## Add to Cursor

Create or edit `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "pharos-paygate": {
      "command": "node",
      "args": ["/absolute/path/to/pharos-paygate/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "your_wallet_private_key_here",
        "RPC_URL": "https://atlantic.dplabs-internal.com",
        "CHAIN_ID": "688689",
        "FACILITATOR_URL": "https://x402.org/facilitator"
      }
    }
  }
}
```

Then enable the server in Cursor's MCP settings.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | For sending tools | Private key of the wallet that signs transactions. Read-only tools (balances, prices, history) work without it. Never commit this. |
| `RPC_URL` | No | Pharos Atlantic RPC endpoint. Defaults to https://atlantic.dplabs-internal.com |
| `CHAIN_ID` | No | Chain ID. Defaults to 688689 |
| `FACILITATOR_URL` | No | x402 facilitator endpoint. Defaults to https://x402.org/facilitator |

The private key is only ever read from the environment. It is never logged, never returned in tool output, and never hardcoded anywhere in the source.

## Network details

| Setting | Value |
|---|---|
| Network | Pharos Atlantic Testnet |
| RPC URL | https://atlantic.dplabs-internal.com |
| Chain ID | 688689 |
| Currency | PHRS (18 decimals) |
| Explorer | https://atlantic.pharosscan.xyz |

## Token contracts

| Token | Address | Decimals |
|---|---|---|
| USDC | `0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B` | 6 |
| USDT | `0xE7E84B8B4f39C507499c40B4ac199B050e2882d5` | 6 |
| WETH | `0x7d211F77525ea39A0592794f793cC1036eEaccD5` | 18 |
| WPHRS | `0x838800b758277CC111B2d48Ab01e5E164f8E9471` | 18 |
| MultiCall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | - |
| x402 test USDC | `0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8` | 6 |

## What is x402 and why it matters

HTTP has had a 402 Payment Required status code reserved since the 1990s, but nobody wired it up. x402 is an open protocol that finally does: a server responds to a request with 402 and a machine-readable description of what it costs, the client signs a token payment authorization, retries the request with a payment header, and a facilitator settles it on chain. No accounts, no API keys, no credit card forms.

This matters for agent commerce because agents cannot fill out checkout pages. With x402 an agent can discover a paid API, see the price, decide whether it is worth it, pay a fraction of a cent in USDC, and get the data, all in a single tool call lasting a couple of seconds. The `x402_pay_for_resource` tool implements the client side of this on Pharos (network `eip155:688689`), with a hard spending cap so the agent can never pay more than you allowed.

Reference implementation for Pharos: https://github.com/PharosNetwork/examples/tree/main/skills/x402-pharos

## Project structure

```
pharos-paygate/
  src/
    index.ts                  MCP server entry point, registers all 9 tools
    config/pharos.ts          chain definition, token addresses, ABIs
    utils/client.ts           viem public + wallet clients, result helpers
    tools/                    one file per tool
  CLAUDE.md                   working notes for AI coding agents
  .env.example                environment template
```

## Contributing

Contributions are welcome. The codebase is small on purpose, so it is easy to find your way around.

1. Fork the repo and create a feature branch
2. Add your tool in `src/tools/` following the existing pattern: export a zod schema and a handler that returns `{success, data, error?}`
3. Register it in `src/index.ts` with `safeHandler`
4. Make sure `npm run build` passes with no errors
5. Test it with `npm run inspector`
6. Open a pull request with a short description of what the tool does and why

Bug reports and ideas for new payment primitives are just as useful as code.

## License

MIT
