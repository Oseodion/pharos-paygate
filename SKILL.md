# pharos-paygate Skill

> v0.1.1 · Pharos Atlantic Testnet & Pacific Mainnet · MCP Server

## Prerequisites

- Node.js 18 or newer
- A Pharos wallet private key for transaction tools
- pharos-paygate installed via npm install -g pharos-paygate
- Added to Claude Desktop, Cursor, or any MCP compatible client config

## Capability Index

| User Need | Tool Name | What It Does | Network |
|---|---|---|---|
| Check wallet balance / how much PHRS do I have / what tokens are in this wallet | get_wallet_balances | Fetches PHRS, USDC, USDT, WETH, WPHRS balances via multicall | testnet + mainnet |
| What is WETH worth / current token price / price of USDC | get_token_price | Live USD price from CoinGecko | testnet + mainnet |
| Send USDC / pay this address / transfer stablecoin | send_usdc | Sends USDC to any address | testnet + mainnet |
| Send any token / transfer WETH / send USDT | send_token | Generic ERC20 transfer for any supported token | testnet + mainnet |
| Pay only if price condition met / conditional transfer / send if WETH above X | conditional_payment | Fetches live price, evaluates condition, sends only if true | testnet + mainnet |
| Pay multiple addresses / batch transfer / airdrop USDC | batch_send | Sends tokens to multiple recipients in one call | testnet + mainnet |
| Show transaction history / recent transfers / what did this wallet do | get_transaction_history | Fetches recent txs from PharosScan explorer | testnet + mainnet |
| How much gas will this cost / estimate transaction fee | estimate_gas | Estimates gas cost before sending | testnet + mainnet |
| Pay for this API / access paid resource / buy data with USDC | x402_pay_for_resource | Implements x402 HTTP 402 payment protocol end to end | testnet |
| Is this wallet safe / check address for scams / screen recipient | check_wallet_safety | GoPlus malicious address detection | testnet + mainnet |
| Is this token a honeypot / check token safety / rug pull risk | check_token_safety | GoPlus token security analysis | testnet + mainnet |
| Is this contract safe / check smart contract / verify contract risk | check_contract_safety | GoPlus contract security analysis | testnet + mainnet |
| Send safely / screen before paying / safe transfer with security check | safe_transfer | GoPlus screens recipient then sends only if safe | testnet + mainnet |
| Create invoice / request payment / generate payment link | create_payment_request | Generates structured payment request with expiry | testnet + mainnet |
| Did I get paid / verify payment / check if payment arrived | verify_payment_received | Checks incoming transactions for matching payment | testnet + mainnet |
| Wrap PHRS / convert PHRS to WPHRS / wrap native token | wrap_phrs | Wraps PHRS to WPHRS via deposit() | testnet |
| Unwrap WPHRS / convert WPHRS back to PHRS | unwrap_phrs | Unwraps WPHRS to PHRS via withdraw() | testnet |
| Full wallet report / wallet intelligence / analyze this wallet | get_wallet_profile | Balances + USD value + tx count + age + GoPlus safety | testnet + mainnet |
| Network status / current block / gas price / Pharos stats | get_network_stats | Live block, gas price, latest block details from RPC | testnet + mainnet |
| Pay if multiple conditions met / AND OR payment logic / complex conditional | multi_condition_payment | Multiple price conditions with AND or OR logic | testnet + mainnet |

## How It Works

pharos-paygate is an MCP server, not a cast or forge skill. There is no Foundry toolchain to install and nothing to compile per call. The AI agent connects to the server over stdio and calls tools by name with JSON parameters, for example `send_usdc` with `{ "to": "0x...", "amount": "5.00" }`. The server does all the heavy lifting internally: building the viem clients, making RPC calls to Pharos, converting human readable amounts to token decimals, signing transactions with the wallet key from the environment, broadcasting, waiting for receipts, and formatting the response. The agent never touches a private key, an ABI, or an RPC endpoint directly. It just asks for what it wants and reads back a clean JSON result.

## Network Configuration

| Network | Chain ID | Currency | RPC | Explorer |
|---|---|---|---|---|
| Atlantic Testnet | 688689 | PHRS | https://atlantic.dplabs-internal.com | https://atlantic.pharosscan.xyz |
| Pacific Mainnet | 1672 | PROS | https://rpc.pharos.xyz | https://www.pharosscan.xyz |

Every tool takes an optional `network` parameter (`testnet` or `mainnet`). When it is omitted, the server falls back to the `NETWORK` environment variable and then to testnet, so existing setups keep working with no changes.

## Security

Four tools are backed by the GoPlus Security API: check_wallet_safety, check_token_safety, check_contract_safety, and safe_transfer. No API key is needed. Wallet address screening works cross-chain, since GoPlus tracks malicious addresses across networks, so check_wallet_safety and safe_transfer give useful results on both testnet and mainnet. Token and contract checks often return a risk level of "unknown" on testnet because GoPlus coverage of Pharos testnet contracts is sparse. The tools report that honestly rather than pretending an address is clean.

## x402

x402 is an open protocol that turns the long dormant HTTP 402 Payment Required status code into a working payment rail. A server answers a request with 402 and a machine readable description of what it costs, the client signs a stablecoin payment authorization, retries the request with a payment header, and a facilitator settles it on chain. No accounts, no API keys, no checkout forms. The x402_pay_for_resource tool implements the client side on Pharos (network `eip155:688689`): it makes the initial request, parses the payment requirements from the 402 response, refuses to pay anything above the agent's `max_price` cap, and otherwise signs the payment with the configured wallet and retries to fetch the resource, all in one call.

## Quick Start

Install from npm:

```bash
npm install -g pharos-paygate
```

Then add to your Claude Desktop config at `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

If installed via npm:

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

If you cloned the repo instead:

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

For other MCP clients (Cursor, Windsurf, Cline, Goose, Zed, Continue) use the same JSON block in each client's config file location. See the README for per-client paths.

Fully quit and reopen your AI client after saving the config.
