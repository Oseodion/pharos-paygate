# pharos-paygate

## Quick look

Here are four things you can say to an AI agent with pharos-paygate connected:

"Check the balance of 0x1234..." - triggers get_wallet_balances, returns PHRS, USDC, USDT, WETH and WPHRS in one call
"Send 5 USDC to 0x1234... if WETH is above 2000" - triggers conditional_payment, fetches live price, pays only if condition is met
"Is 0x1234... safe to send money to?" - triggers check_wallet_safety, screens the address against GoPlus malicious address database
"Fetch https://api.example.com/data and pay for it if it costs under 0.01 USDC" - triggers x402_pay_for_resource, handles the full 402 payment handshake autonomously

pharos-paygate is an MCP (Model Context Protocol) server that gives AI agents a complete payments and security toolkit on Pharos, across both the Atlantic Testnet and the Pacific Mainnet. It exposes 20 tools covering everything an agent needs to move money safely: checking balances, fetching prices, sending USDC or any supported token, conditional and multi-condition payments, batch payouts, transaction history, gas estimation, paying for x402-protected web resources, GoPlus-powered wallet and contract screening, safety-gated transfers, payment requests and verification, native token wrapping, wallet intelligence profiles, and live network stats. Every tool takes an optional `network` parameter so an agent can work on testnet by default and switch to mainnet just by saying "on mainnet". Install it once in Claude Desktop, Cursor, or any MCP-compatible client and your agent can transact on Pharos with plain English.

## Verified on-chain

These transactions were executed live on Pharos Atlantic Testnet during development:

USDC send: https://atlantic.pharosscan.xyz/tx/0x9d988fe11f13a560849ad0a331c9f3e5d7a5d834bf5169738c9990eb16b341db
Conditional payment (WETH above 1000 USD): https://atlantic.pharosscan.xyz/tx/0xa3de353b01372f88ef94c71225e72bdb82cb7c1b37c6871ef69ebb13f6c0f742
Safe transfer with GoPlus screening: https://atlantic.pharosscan.xyz/tx/0x312d2382f85505f1e95becc882cdd1ad13e986cc51f5f0318accf1ef3863facd
Multi-condition payment (WETH above 1000 USD AND USDC above 0.99): https://atlantic.pharosscan.xyz/tx/0x6dbe8241552b291a8e6ba80d28f6d08594467743350866ddee4fd59e55017fcb

## Why this exists

AI agents are getting good at deciding *when* to pay for things, but they have no hands. They cannot hold a wallet, sign a transaction, or respond to an HTTP 402 Payment Required. Every team building agent commerce ends up rebuilding the same plumbing: RPC clients, decimal conversion, gas math, explorer lookups, payment protocol handshakes.

pharos-paygate packages all of that plumbing as a single MCP skill. The agent says "send 5 USDC to 0xabc..." and the skill handles address validation, decimal conversion, signing, broadcasting, waiting for the receipt, and handing back an explorer link. It also speaks x402, so an agent can buy access to paid APIs autonomously while staying inside a spending cap you set.

## The 20 tools

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

### 10. check_wallet_safety

Screens a wallet address against the GoPlus Security database for malicious activity, blacklists, and sanctions. Free API, no key needed.

- Input: `address` (string), `chain_id` (string, default "688689")
- Output: `{address, is_malicious, is_blacklisted, is_sanctioned, risk_level, risk_details, recommendation}`

> "Is 0x1234...abcd a safe address to send money to?"

### 11. check_token_safety

Analyzes a token contract with GoPlus: honeypot detection, buy/sell taxes, mintability, and ownership risks.

- Input: `token_address` (string), `chain_id` (string, default "688689")
- Output: `{token_address, is_honeypot, is_open_source, is_proxy, buy_tax, sell_tax, can_take_back_ownership, is_mintable, risk_level, risk_summary}`

> "Check if this token is a honeypot before I buy: 0xabcd..."

### 12. check_contract_safety

Analyzes a smart contract with GoPlus: verification status, proxy patterns, self destruct, and other risk items.

- Input: `contract_address` (string), `chain_id` (string, default "688689")
- Output: `{contract_address, is_verified, is_open_source, is_proxy, risk_items, overall_risk, recommendation}`

> "Is the contract at 0xabcd... safe to interact with?"

### 13. safe_transfer

The intelligent payment tool. Screens the recipient with GoPlus first, and only sends if the recipient is not flagged as high or critical risk. If the recipient is flagged, the transfer is aborted and the full safety report comes back instead. You can override with `skip_safety_check` if you are certain.

- Input: `to` (address), `amount` (string), `token` (USDC | USDT | WETH | WPHRS), `skip_safety_check` (boolean, default false)
- Output: safety check outcome plus transaction result, or an abort report

> "Safely send 10 USDC to 0x1234...abcd, but check the address first"

### 14. create_payment_request

Generates a structured payment request payable to your wallet, with a unique ID, expiry, and a human readable payment string you can hand to a counterparty.

- Input: `amount` (string), `token` (USDC | USDT | WETH | WPHRS | PHRS), `memo` (optional), `expires_in_minutes` (number, default 60)
- Output: `{payment_request_id, payable_to, amount, token, memo, expires_at, created_at, status, payment_uri}`

> "Create a payment request for 25 USDC for invoice 1043, valid for 2 hours"

### 15. verify_payment_received

Checks recent incoming transactions for a payment matching an expected amount, token, and optionally a sender. Pairs with create_payment_request to close the loop on agent invoicing.

- Input: `expected_from` (optional address), `expected_amount` (string), `token`, `wallet_address` (string), `since_minutes_ago` (number, default 30)
- Output: `{verified, matching_tx?: {hash, from, amount, timestamp, explorer_link}, message}`

> "Did I receive the 25 USDC payment from 0x1234...abcd yet?"

### 16. wrap_phrs

Wraps native PHRS into WPHRS by calling deposit() on the WETH-style wrapper contract.

- Input: `amount` (string, human readable PHRS)
- Output: `{tx_hash, explorer_link, amount_wrapped, wphrs_received}`

> "Wrap 2 PHRS into WPHRS"

### 17. unwrap_phrs

Unwraps WPHRS back to native PHRS by calling withdraw() on the wrapper contract.

- Input: `amount` (string, human readable WPHRS)
- Output: `{tx_hash, explorer_link, amount_unwrapped, phrs_received}`

> "Unwrap 2 WPHRS back to PHRS"

### 18. get_wallet_profile

Builds a full intelligence report on any wallet: all balances with USD values, total portfolio value, transaction count, an age estimate (new, active, veteran), and a GoPlus safety status, all in one call.

- Input: `address` (string)
- Output: `{address, total_portfolio_usd, balances, transaction_count, wallet_age_estimate, safety_status, risk_level}`

> "Give me a full profile of the wallet 0x1234...abcd"

### 19. get_network_stats

Fetches live Pharos network stats for testnet or mainnet straight from the RPC: current block, gas price, and the latest block's transaction count and timestamp.

- Input: none
- Output: `{network, chain_id, block_number, gas_price_gwei, last_block_tx_count, last_block_timestamp, rpc_url, explorer}`

> "What's the current state of the Pharos network?"

### 20. multi_condition_payment

The upgraded conditional payment. Takes a list of price conditions and combines them with AND or OR logic. Reports exactly which conditions passed and which failed, with current prices, whether the payment fires or not.

- Input: `to`, `amount`, `token`, `conditions` (array of `{condition_token, operator, value}`), `logic` (AND | OR, default AND)
- Output: executed payment with per-condition breakdown, or a detailed skip explanation

> "Send 5 USDC to 0x1234...abcd if WETH is above 1500 AND USDT is at least 0.99"

## Installation

You need Node.js 18 or newer.

The quickest way to get started:

```bash
npm install -g pharos-paygate
```

For developers who want to contribute or inspect the source:

```bash
git clone https://github.com/Oseodion/pharos-paygate.git
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

**If you installed via npm (recommended for most users):**

```json
{
  "mcpServers": {
    "pharos-paygate": {
      "command": "pharos-paygate",
      "env": {
        "PRIVATE_KEY": "your_wallet_private_key_here",
        "NETWORK": "testnet"
      }
    }
  }
}
```

**If you cloned the repo (for developers):**

```json
{
  "mcpServers": {
    "pharos-paygate": {
      "command": "node",
      "args": ["/absolute/path/to/pharos-paygate/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "your_wallet_private_key_here",
        "RPC_URL": "https://atlantic.dplabs-internal.com",
        "MAINNET_RPC_URL": "https://rpc.pharos.xyz",
        "CHAIN_ID": "688689",
        "NETWORK": "testnet",
        "FACILITATOR_URL": "https://x402.org/facilitator"
      }
    }
  }
}
```

Note: PRIVATE_KEY is only needed for tools that send transactions. Read-only tools like get_wallet_balances, get_token_price, check_wallet_safety, and get_network_stats work without it. NETWORK defaults to testnet if not set.

Restart Claude Desktop fully after editing the config (Command+Q on Mac, not just closing the window).

## Add to Cursor

Create or edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project).

If you installed via npm:

```json
{
  "mcpServers": {
    "pharos-paygate": {
      "command": "pharos-paygate",
      "env": {
        "PRIVATE_KEY": "your_wallet_private_key_here",
        "NETWORK": "testnet"
      }
    }
  }
}
```

If you cloned the repo:

```json
{
  "mcpServers": {
    "pharos-paygate": {
      "command": "node",
      "args": ["/absolute/path/to/pharos-paygate/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "your_wallet_private_key_here",
        "NETWORK": "testnet"
      }
    }
  }
}
```

Then enable the server in Cursor's MCP settings.

## Supported clients

pharos-paygate is a standard stdio MCP server, so it works in any MCP-compatible client. The same `command` / `args` / `env` block shown above goes into each client's config file:

| Client | Config location | Config format |
|---|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows) | Same JSON block with `command: pharos-paygate` (npm) or `command: node` + args (repo clone) |
| Cursor | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project) | Same JSON block with `command: pharos-paygate` (npm) or `command: node` + args (repo clone) |
| Windsurf | `~/.windsurf/mcp.json` | Same JSON block with `command: pharos-paygate` (npm) or `command: node` + args (repo clone) |
| Cline (VSCode extension) | MCP servers settings inside VSCode | Same JSON block with `command: pharos-paygate` (npm) or `command: node` + args (repo clone) |
| Goose | `~/.config/goose/config.yaml` | Same JSON block with `command: pharos-paygate` (npm) or `command: node` + args (repo clone) |
| Zed | `~/.config/zed/settings.json` | Same JSON block with `command: pharos-paygate` (npm) or `command: node` + args (repo clone) |
| Continue | `~/.continue/config.json` | Same JSON block with `command: pharos-paygate` (npm) or `command: node` + args (repo clone) |
| Custom agent | Any agent built on `@modelcontextprotocol/sdk` can spawn `node dist/index.js` over stdio | Same JSON block with `command: pharos-paygate` (npm) or `command: node` + args (repo clone) |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | For sending tools | Private key of the wallet that signs transactions. Read-only tools (balances, prices, history) work without it. Never commit this. |
| `RPC_URL` | No | Pharos Atlantic Testnet RPC endpoint. Defaults to https://atlantic.dplabs-internal.com |
| `MAINNET_RPC_URL` | No | Pharos Pacific Mainnet RPC endpoint. Defaults to https://rpc.pharos.xyz |
| `CHAIN_ID` | No | Testnet chain ID. Defaults to 688689 |
| `NETWORK` | No | Default network when a tool call does not specify one: `testnet` (default) or `mainnet` |
| `FACILITATOR_URL` | No | x402 facilitator endpoint. Defaults to https://x402.org/facilitator |

The private key is only ever read from the environment. It is never logged, never returned in tool output, and never hardcoded anywhere in the source.

## Networks

Every tool accepts an optional `network` parameter (`testnet` or `mainnet`). When omitted, it falls back to the `NETWORK` env var, and then to `testnet`. So existing setups keep working with no changes, and an agent can switch chains per request just by saying "on mainnet".

| Network | Chain ID | Currency | RPC | Explorer |
|---|---|---|---|---|
| Atlantic Testnet | 688689 | PHRS | https://atlantic.dplabs-internal.com | https://atlantic.pharosscan.xyz |
| Pacific Mainnet | 1672 | PROS | https://rpc.pharos.xyz | https://www.pharosscan.xyz |

## Token contracts

### Atlantic Testnet (chain 688689)

| Token | Address | Decimals |
|---|---|---|
| USDC | `0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B` | 6 |
| USDT | `0xE7E84B8B4f39C507499c40B4ac199B050e2882d5` | 6 |
| WETH | `0x7d211F77525ea39A0592794f793cC1036eEaccD5` | 18 |
| WPHRS | `0x838800b758277CC111B2d48Ab01e5E164f8E9471` | 18 |
| MultiCall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | - |
| x402 test USDC | `0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8` | 6 |

### Pacific Mainnet (chain 1672)

| Token | Address | Decimals |
|---|---|---|
| USDC | `0xc879c018db60520f4355c26ed1a6d572cdac1815` | 6 |
| WETH | `0x1f4b7011Ee3d53969bb67F59428a9ec0477856E9` | 18 |
| WPROS | `0x52c48d4213107b20bc583832b0d951fb9ca8f0b0` | 18 |
| LINK | `0x51e2A24742Db77604B881d6781Ee16B5b8fcBE29` | 18 |
| MultiCall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | - |

Note: the token send enums (`USDC`, `USDT`, `WETH`, `WPHRS`) are shared across both networks for backward compatibility. On mainnet, USDC and WETH work directly; USDT and WPHRS are testnet-only and return a clear "not available on this network" error. Mainnet-only tokens (WPROS, LINK) show up in balances and profiles automatically.

## Security

Four of the tools (check_wallet_safety, check_token_safety, check_contract_safety, and safe_transfer) are backed by the [GoPlus Security API](https://gopluslabs.io/), a free public service that maintains databases of malicious addresses, honeypot tokens, and risky contracts across chains. No API key is needed for the lookups this skill makes.

Why this matters: an AI agent moving money is a new kind of attack surface. A scammer does not need to compromise the agent, they just need to get a bad address in front of it: a poisoned payment request, a phishing address in a website the agent scraped, a honeypot token in a list of "opportunities". Humans hesitate before sending money to a stranger. An agent executes.

The screening tools give the agent the same instinct. Before any transfer, it can ask whether the recipient has been linked to phishing, theft, money laundering, or sanctions, and get a concrete recommendation back: safe_to_transact, proceed_with_caution, or do_not_transact. The safe_transfer tool bakes this in: it refuses to send to addresses flagged high or critical risk unless you explicitly override it, and it also refuses to send blind if the screening service itself is unreachable.

Two honest caveats. GoPlus coverage of the Pharos Atlantic Testnet specifically is thin, so many testnet addresses come back with no data (the tools report risk_level "unknown" in that case rather than pretending). And no blacklist is complete: a clean screening result lowers risk, it does not eliminate it. Treat the screening as a seatbelt, not a guarantee.

## What is x402 and why it matters

HTTP has had a 402 Payment Required status code reserved since the 1990s, but nobody wired it up. x402 is an open protocol that finally does: a server responds to a request with 402 and a machine-readable description of what it costs, the client signs a token payment authorization, retries the request with a payment header, and a facilitator settles it on chain. No accounts, no API keys, no credit card forms.

This matters for agent commerce because agents cannot fill out checkout pages. With x402 an agent can discover a paid API, see the price, decide whether it is worth it, pay a fraction of a cent in USDC, and get the data, all in a single tool call lasting a couple of seconds. The `x402_pay_for_resource` tool implements the client side of this on Pharos (network `eip155:688689`), with a hard spending cap so the agent can never pay more than you allowed.

Reference implementation for Pharos: https://github.com/PharosNetwork/examples/tree/main/skills/x402-pharos

## Project structure

```
pharos-paygate/
  src/
    index.ts                  MCP server entry point, registers all 20 tools
    config/pharos.ts          chain definition, token addresses, ABIs
    utils/client.ts           viem public + wallet clients, result helpers
    tools/                    one file per tool
  SKILL.md                    Pharos Skill Engine format capability index
  .env.example                environment template
```

## Troubleshooting

### Permission denied on Mac when running npm install -g

If you see EACCES permission denied on macOS, run with sudo:

```bash
sudo npm install -g pharos-paygate
```

Or fix npm permissions permanently so you never need sudo again:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm install -g pharos-paygate
```

### Permission denied on Windows

On Windows, open PowerShell or Command Prompt as Administrator:

1. Press Windows key
2. Search for PowerShell
3. Right click and select Run as Administrator
4. Then run: npm install -g pharos-paygate

Or if you use nvm on Windows, permissions are handled automatically.

### pharos-paygate command not found after install on Mac

If the command is not found after installing, your PATH may not include the npm global bin folder. Run:

```bash
npm config get prefix
```

Then add that path plus /bin to your PATH in ~/.zshrc or ~/.bashrc and restart your terminal.

### pharos-paygate command not found after install on Windows

Close and reopen PowerShell or Command Prompt after installing. If still not found, run:

```bash
npm config get prefix
```

Add that path to your System Environment Variables under PATH.

### Server starts but tools don't show in Claude Desktop

Make sure you fully quit Claude Desktop and reopen it after editing the config file. On Mac press Command+Q, on Windows right click the taskbar icon and click Quit. Just closing the window is not enough.

### Explorer API rate limit errors

The PharosScan explorer API has rate limits. If get_transaction_history or verify_payment_received return a rate limit error, wait 30 seconds and try again.

### Tools work but transactions fail with insufficient funds

Make sure your wallet has PHRS on testnet or PROS on mainnet for gas fees. Get testnet PHRS from the faucet at https://testnet.pharosnetwork.xyz. Read-only tools like get_wallet_balances, get_token_price, check_wallet_safety, and get_network_stats work without any gas.

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
